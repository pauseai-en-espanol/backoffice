import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import {
  ACCOUNT_KINDS,
  type AccountKind,
  type EntryLine,
  isBalanced,
  isValidIban,
  isValidTaxId,
  linesOf,
  normaliseIban,
  normaliseTaxId,
} from '@backoffice/domain/accounting';
import { madridToday, parseDay } from '@backoffice/domain/days';
import { parseEuros } from '@backoffice/domain/money';
import { getTranslator } from '@backoffice/i18n/messages';
import { captureException } from '@sentry/node';
import { sql } from 'kysely';

import type { ReceiptStore } from './receipt-store.js';

import { RECENT_SECOND_FACTOR } from '../auth/step-up.js';
import { databaseRefusal } from '../database-errors.js';
import { fromAnotherSite } from '../fetch-site.js';
import { schemaRefusal } from '../schema-refusal.js';
import { bankRoutes } from './bank-routes.js';
import { linesOfEntry, lineToMatch, matchLine } from './bank.js';
import {
  accountsByIds,
  addAccount,
  addCounterparty,
  addDraft,
  addProject,
  BOOKS,
  changeAccount,
  changeCounterparty,
  changeDraft,
  changeProject,
  closeYear,
  type CounterpartyInput,
  deleteAccount,
  deleteCounterparty,
  deleteDraft,
  deleteProject,
  type DraftInput,
  getEntry,
  listAccounts,
  listCounterparties,
  listEntries,
  listProjects,
  listYears,
  openYear,
  postEntry,
  type ProjectInput,
  referencesExist,
  reverseEntry,
  TESORERIA,
  yearStatusOf,
} from './books.js';
import { addBudgetLine, changeBudgetLine, deleteBudgetLine, getBudget } from './budget.js';
import { BOOK_REPORTS, type BookReport, reportCsv } from './exports.js';
import { receiptRoutes } from './receipt-routes.js';
import {
  balanceSheet,
  byProject,
  incomeAndExpenses,
  journal,
  ledger,
  type Range,
} from './reports.js';

/** A refusal the API decides itself: its status and key, which the staff app shows in words. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(key);
  }
}

export interface AccountingRoutesOptions {
  app: Database | undefined;
  staffOrigin: string;
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
  /** Receipts' files, encrypted on the API's volume (ADR-0006 decision 7); without it, none can be stored or read. */
  receipts?: ReceiptStore | undefined;
}

const UUID = { type: 'string', format: 'uuid' } as const;
const NULLABLE_UUID = { type: ['string', 'null'], format: 'uuid' } as const;
const ID_PARAMS = { type: 'object', properties: { id: UUID }, required: ['id'] } as const;
const YEAR = { type: 'integer', minimum: 2000, maximum: 2999 } as const;
const TEXT = (max: number) => ({ type: 'string', maxLength: max }) as const;
const NULLABLE_TEXT = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const;
/** An amount as typed, the Spanish way (`1.234,56`): packages/domain reads it. */
const AMOUNT = TEXT(40);
/** A day as typed (`30/10/2026`) or as a date field sends it (`2026-10-30`). */
const DAY = TEXT(20);

const ACCOUNT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'name'],
  properties: {
    code: { type: 'string', pattern: '^[0-9]{2,10}$' },
    name: TEXT(120),
    kind: { type: 'string', enum: [...ACCOUNT_KINDS] },
    parentCode: { type: ['string', 'null'], pattern: '^[0-9]{2,10}$' },
    treasury: { type: 'boolean' },
    iban: NULLABLE_TEXT(50),
  },
} as const;

const ACCOUNT_CHANGE = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: TEXT(120),
    treasury: { type: 'boolean' },
    iban: NULLABLE_TEXT(50),
    active: { type: 'boolean' },
  },
} as const;

const COUNTERPARTY_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'name'],
  properties: {
    kind: { type: 'string', enum: ['person', 'organisation'] },
    name: TEXT(200),
    taxId: NULLABLE_TEXT(40),
    province: NULLABLE_TEXT(100),
    iban: NULLABLE_TEXT(50),
  },
} as const;

const PROJECT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: TEXT(120),
    funderId: NULLABLE_UUID,
    description: NULLABLE_TEXT(2000),
    active: { type: 'boolean' },
  },
} as const;

const LINE = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId'],
  properties: {
    accountId: UUID,
    debit: AMOUNT,
    credit: AMOUNT,
    projectId: NULLABLE_UUID,
  },
} as const;

/** Ingreso, Gasto, Traspaso or Asiento manual (accounting spec §2): what each form asks for, saved or posted. */
const ENTRY_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'date', 'description'],
  properties: {
    kind: { type: 'string', enum: ['income', 'expense', 'transfer', 'manual'] },
    date: DAY,
    description: TEXT(500),
    amount: AMOUNT,
    treasuryAccountId: UUID,
    accountId: UUID,
    fromAccountId: UUID,
    toAccountId: UUID,
    lines: { type: 'array', maxItems: 100, items: LINE },
    counterpartyId: NULLABLE_UUID,
    projectId: NULLABLE_UUID,
    /** Post at once rather than keep a draft. */
    post: { type: 'boolean' },
    /** The bank line it records, matched to it once posted (Banco's "Anotar"): posted at once, then. */
    bankLineId: UUID,
  },
} as const;

interface LineBody {
  accountId: string;
  debit?: string;
  credit?: string;
  projectId?: string | null;
}

interface EntryBody {
  kind: 'income' | 'expense' | 'transfer' | 'manual';
  date: string;
  description: string;
  amount?: string;
  treasuryAccountId?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  lines?: LineBody[];
  counterpartyId?: string | null;
  projectId?: string | null;
  post?: boolean;
  bankLineId?: string;
}

const REPORT_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    year: YEAR,
    from: DAY,
    to: DAY,
    account: UUID,
    project: UUID,
  },
} as const;

interface ReportQuery {
  year?: number;
  from?: string;
  to?: string;
  account?: string;
  project?: string;
}

const require = async (trx: Transaction<DB>, check: typeof BOOKS): Promise<void> => {
  const { rows } = await check.execute(trx);
  if (rows[0]?.ok !== true) {
    throw new Refusal(403, 'forbidden');
  }
};

/** A day as typed, or a refusal naming the field. */
const dayOf = (text: string, field: string): string => {
  const day = parseDay(text);
  if (!day) {
    throw new Refusal(400, 'invalid', { field });
  }
  return day;
};

/** An amount more than zero, as typed the Spanish way, in cents; or a refusal naming the field. */
const amountOf = (text: string | undefined, field: string): number => {
  const cents = text === undefined ? undefined : parseEuros(text);
  if (cents === undefined || cents === 0) {
    throw new Refusal(400, 'invalid', { field });
  }
  return cents;
};

const blankToNull = (text: string | null | undefined): string | null =>
  text === null || text === undefined || text.trim() === '' ? null : text.trim();

/** A counterparty as kept: its tax ID and IBAN normalised and checked, blanks as nothing. */
const counterpartyOf = (body: CounterpartyInput): CounterpartyInput => {
  if (body.name.trim() === '') {
    throw new Refusal(400, 'invalid', { field: 'name' });
  }
  const taxId = blankToNull(body.taxId) === null ? null : normaliseTaxId(body.taxId ?? '');
  if (taxId !== null && !isValidTaxId(taxId)) {
    throw new Refusal(400, 'invalid', { field: 'taxId' });
  }
  const iban = blankToNull(body.iban) === null ? null : normaliseIban(body.iban ?? '');
  if (iban !== null && !isValidIban(iban)) {
    throw new Refusal(400, 'invalid', { field: 'iban' });
  }
  return { kind: body.kind, name: body.name, taxId, province: blankToNull(body.province), iban };
};

/** The range a report covers: a year (this one by default) and days within it. */
const rangeOf = (query: ReportQuery): Range => {
  const year = query.year ?? Number(madridToday().slice(0, 4));
  const from = query.from === undefined ? `${year}-01-01` : dayOf(query.from, 'from');
  const to = query.to === undefined ? `${year}-12-31` : dayOf(query.to, 'to');
  if (!from.startsWith(`${year}-`) || !to.startsWith(`${year}-`) || from > to) {
    throw new Refusal(400, 'invalid', { field: 'to' });
  }
  return { year, from, to };
};

/**
 * The books (ADR-0006): tesorería records, admins read, through the staff app. Every query runs in the actor's
 * `withActor` transaction, where RLS decides again; the checks here are there to answer in words. Closing a year and
 * the exports are among the riskiest actions (PLAN D23): they want a second factor of the last 12 hours.
 */
export const accountingRoutes =
  ({ app, staffOrigin, actorFor, receipts }: AccountingRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    scope.setErrorHandler(async (error, _request, reply) => {
      const refusal = schemaRefusal(error);
      if (!refusal) {
        throw error;
      }
      return reply.code(400).send(refusal);
    });

    const t = getTranslator();

    /** As staff/routes.ts: the signed-in actor, the staff origin for writes, refusals in words, faults reported. */
    const signedIn = async (
      request: FastifyRequest,
      reply: FastifyReply,
      run: (db: Database, actor: Actor) => Promise<unknown>,
    ): Promise<unknown> => {
      if (!app) {
        return reply.code(503).send({ error: 'unavailable' });
      }
      const actor = await actorFor(request);
      if (!actor) {
        return reply.code(401).send({ error: 'signIn' });
      }
      if (request.method !== 'GET' && request.headers.origin !== staffOrigin) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      try {
        return await run(app, actor);
      } catch (error) {
        if (error instanceof Refusal) {
          return reply.code(error.status).send({ error: error.key, ...error.extra });
        }
        const refusal = databaseRefusal(error);
        if (refusal.report) {
          const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
          request.log.error(
            { code, routine, constraint: refusal.constraint },
            'Accounting request failed',
          );
          captureException(
            typeof code === 'string'
              ? new Error(`Accounting request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({
          error: refusal.error,
          ...(refusal.constraint === undefined ? {} : { constraint: refusal.constraint }),
        });
      }
    };

    /** Runs `run` in the actor's transaction once they read the books: tesorería or an admin. */
    const reading = <T>(db: Database, actor: Actor, run: (trx: Transaction<DB>) => Promise<T>) =>
      withActor(db, actor, async (trx) => {
        await require(trx, BOOKS);
        return run(trx);
      });

    /** Runs `run` in the actor's transaction once they keep the books: tesorería alone. */
    const keeping = <T>(db: Database, actor: Actor, run: (trx: Transaction<DB>) => Promise<T>) =>
      withActor(db, actor, async (trx) => {
        await require(trx, TESORERIA);
        return run(trx);
      });

    /**
     * What a form writes, checked in words: the day in an open year and not to come, a concept, an amount more than
     * zero, and accounts of the right kind (a treasury account to take money from or put it in, an income account for
     * an income, an expense one for an expense), each active and without sub-accounts.
     */
    const draftOf = async (trx: Transaction<DB>, body: EntryBody): Promise<DraftInput> => {
      const date = dayOf(body.date, 'date');
      if (date > madridToday()) {
        throw new Refusal(400, 'future', { field: 'date' });
      }
      const year = await yearStatusOf(trx, date);
      if (year !== 'open') {
        throw new Refusal(409, year === 'closed' ? 'yearClosed' : 'yearNotOpen', { field: 'date' });
      }
      if (body.description.trim() === '') {
        throw new Refusal(400, 'invalid', { field: 'description' });
      }
      const projectId = body.projectId ?? null;
      const counterpartyId = body.counterpartyId ?? null;
      const exist = await referencesExist(trx, counterpartyId, projectId);
      if (!exist.counterparty) {
        throw new Refusal(400, 'invalid', { field: 'counterpartyId' });
      }
      if (!exist.project) {
        throw new Refusal(400, 'invalid', { field: 'projectId' });
      }

      let lines: EntryLine[];
      const wanted: {
        id: string | undefined;
        field: string;
        kind?: AccountKind;
        treasury?: boolean;
      }[] = [];
      if (body.kind === 'manual') {
        lines = (body.lines ?? []).map((line, index) => {
          const debit = blankToNull(line.debit);
          const credit = blankToNull(line.credit);
          if ((debit === null) === (credit === null)) {
            throw new Refusal(400, 'invalid', { field: 'lines', line: index });
          }
          wanted.push({ id: line.accountId, field: 'lines' });
          return {
            accountId: line.accountId,
            debitCents: debit === null ? 0 : amountOf(debit, 'lines'),
            creditCents: credit === null ? 0 : amountOf(credit, 'lines'),
            projectId: line.projectId ?? null,
          };
        });
      } else {
        const amountCents = amountOf(body.amount, 'amount');
        if (body.kind === 'transfer') {
          if (!body.fromAccountId || !body.toAccountId || body.fromAccountId === body.toAccountId) {
            throw new Refusal(400, 'invalid', { field: 'toAccountId' });
          }
          wanted.push(
            { id: body.fromAccountId, field: 'fromAccountId', treasury: true },
            { id: body.toAccountId, field: 'toAccountId', treasury: true },
          );
          lines = linesOf({
            kind: 'transfer',
            amountCents,
            fromAccountId: body.fromAccountId,
            toAccountId: body.toAccountId,
            projectId,
          });
        } else {
          wanted.push(
            { id: body.treasuryAccountId, field: 'treasuryAccountId', treasury: true },
            { id: body.accountId, field: 'accountId', kind: body.kind },
          );
          lines = linesOf({
            kind: body.kind,
            amountCents,
            treasuryAccountId: body.treasuryAccountId ?? '',
            accountId: body.accountId ?? '',
            projectId,
          });
        }
      }
      const accounts = await accountsByIds(
        trx,
        wanted.flatMap((each) => (each.id ? [each.id] : [])),
      );
      for (const each of wanted) {
        const account = each.id === undefined ? undefined : accounts.get(each.id);
        if (
          !account?.postable ||
          (each.treasury === true && !account.treasury) ||
          (each.kind !== undefined && account.kind !== each.kind)
        ) {
          throw new Refusal(400, 'invalid', { field: each.field });
        }
      }
      return {
        kind: body.kind,
        date,
        description: body.description,
        counterpartyId,
        projectId,
        lines,
      };
    };

    /** Posts an entry in words: one that doesn't balance is refused before the database refuses it. */
    const post = async (trx: Transaction<DB>, id: string): Promise<number> => {
      const posted = await postEntry(trx, id);
      if (posted === 'notFound') {
        throw new Refusal(404, 'notFound');
      }
      if (posted === 'posted') {
        throw new Refusal(409, 'posted');
      }
      if (posted === 'unbalanced') {
        throw new Refusal(422, 'unbalanced');
      }
      return posted.number;
    };

    // Years ------------------------------------------------------------------------------------------------------------

    scope.get('/accounting/years', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        reading(db, actor, async (trx) => ({ years: await listYears(trx) })),
      ),
    );

    scope.post<{ Body: { year: number } }>(
      '/accounting/years',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['year'],
            properties: { year: YEAR },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) => openYear(trx, request.body.year));
          if (result === 'notNext') {
            throw new Refusal(409, 'notNextYear', { field: 'year' });
          }
          return reply.code(201).send({ year: request.body.year });
        }),
    );

    scope.post<{ Params: { year: number }; Body: { assemblyOn: string } }>(
      '/accounting/years/:year/close',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          params: { type: 'object', properties: { year: YEAR }, required: ['year'] },
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['assemblyOn'],
            properties: { assemblyOn: DAY },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const assemblyOn = dayOf(request.body.assemblyOn, 'assemblyOn');
          const result = await keeping(db, actor, (trx) =>
            closeYear(trx, request.params.year, assemblyOn, madridToday()),
          );
          if (result === 'notFound') {
            throw new Refusal(404, 'notFound');
          }
          if (result !== 'closed') {
            throw new Refusal(
              409,
              result,
              result === 'assemblyDate' ? { field: 'assemblyOn' } : {},
            );
          }
          return reply.code(204).send();
        }),
    );

    // The chart --------------------------------------------------------------------------------------------------------

    scope.get('/accounting/accounts', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        reading(db, actor, async (trx) => ({ accounts: await listAccounts(trx) })),
      ),
    );

    scope.post<{
      Body: {
        code: string;
        name: string;
        kind?: AccountKind;
        parentCode?: string | null;
        treasury?: boolean;
        iban?: string | null;
      };
    }>('/accounting/accounts', { schema: { body: ACCOUNT_BODY } }, async (request, reply) =>
      signedIn(request, reply, async (db, actor) => {
        const { body } = request;
        if (body.name.trim() === '') {
          throw new Refusal(400, 'invalid', { field: 'name' });
        }
        const treasury = body.treasury ?? false;
        const iban =
          treasury && blankToNull(body.iban) !== null ? normaliseIban(body.iban ?? '') : null;
        if (iban !== null && !isValidIban(iban)) {
          throw new Refusal(400, 'invalid', { field: 'iban' });
        }
        const result = await keeping(db, actor, (trx) =>
          addAccount(trx, {
            code: body.code,
            name: body.name,
            ...(body.kind === undefined ? {} : { kind: body.kind }),
            parentCode: body.parentCode ?? null,
            treasury,
            iban,
          }),
        );
        if (typeof result === 'string') {
          const field = {
            codeTaken: 'code',
            codeOutsideParent: 'code',
            parentNotFound: 'parentCode',
            parentUsed: 'parentCode',
            kindRequired: 'kind',
            treasuryNotAsset: 'treasury',
          }[result];
          throw new Refusal(409, result, { field });
        }
        return reply.code(201).send(result);
      }),
    );

    scope.patch<{
      Params: { id: string };
      Body: { name?: string; treasury?: boolean; iban?: string | null; active?: boolean };
    }>(
      '/accounting/accounts/:id',
      { schema: { params: ID_PARAMS, body: ACCOUNT_CHANGE } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { body } = request;
          if (body.name !== undefined && body.name.trim() === '') {
            throw new Refusal(400, 'invalid', { field: 'name' });
          }
          let iban: string | null | undefined;
          if (body.iban !== undefined) {
            iban = blankToNull(body.iban) === null ? null : normaliseIban(body.iban ?? '');
            if (iban !== null && !isValidIban(iban)) {
              throw new Refusal(400, 'invalid', { field: 'iban' });
            }
          }
          const result = await keeping(db, actor, (trx) =>
            changeAccount(trx, request.params.id, {
              ...(body.name === undefined ? {} : { name: body.name }),
              ...(body.treasury === undefined ? {} : { treasury: body.treasury }),
              ...(iban === undefined ? {} : { iban }),
              ...(body.active === undefined ? {} : { active: body.active }),
            }),
          );
          if (result === 'notFound') {
            throw new Refusal(404, 'notFound');
          }
          if (result === 'treasuryNotAsset') {
            throw new Refusal(409, result, { field: 'treasury' });
          }
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/accounts/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) => deleteAccount(trx, request.params.id));
          if (result !== 'deleted') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    // Counterparties and projects ---------------------------------------------------------------------------------------

    scope.get('/accounting/counterparties', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        reading(db, actor, async (trx) => ({ counterparties: await listCounterparties(trx) })),
      ),
    );

    scope.post<{ Body: CounterpartyInput }>(
      '/accounting/counterparties',
      { schema: { body: COUNTERPARTY_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const input = counterpartyOf(request.body);
          const id = await keeping(db, actor, (trx) => addCounterparty(trx, input));
          return reply.code(201).send({ id });
        }),
    );

    scope.patch<{ Params: { id: string }; Body: CounterpartyInput }>(
      '/accounting/counterparties/:id',
      { schema: { params: ID_PARAMS, body: COUNTERPARTY_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const input = counterpartyOf(request.body);
          if (
            !(await keeping(db, actor, (trx) => changeCounterparty(trx, request.params.id, input)))
          ) {
            throw new Refusal(404, 'notFound');
          }
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/counterparties/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) =>
            deleteCounterparty(trx, request.params.id),
          );
          if (result !== 'deleted') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    scope.get('/accounting/projects', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        reading(db, actor, async (trx) => ({ projects: await listProjects(trx) })),
      ),
    );

    const projectOf = (body: ProjectInput & { active?: boolean }): ProjectInput => {
      if (body.name.trim() === '') {
        throw new Refusal(400, 'invalid', { field: 'name' });
      }
      return {
        name: body.name,
        funderId: body.funderId ?? null,
        description: blankToNull(body.description),
        active: body.active ?? true,
      };
    };

    scope.post<{ Body: ProjectInput }>(
      '/accounting/projects',
      { schema: { body: PROJECT_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const id = await keeping(db, actor, (trx) => addProject(trx, projectOf(request.body)));
          return reply.code(201).send({ id });
        }),
    );

    scope.patch<{ Params: { id: string }; Body: ProjectInput }>(
      '/accounting/projects/:id',
      { schema: { params: ID_PARAMS, body: PROJECT_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const input = projectOf(request.body);
          if (!(await keeping(db, actor, (trx) => changeProject(trx, request.params.id, input)))) {
            throw new Refusal(404, 'notFound');
          }
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/projects/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) => deleteProject(trx, request.params.id));
          if (result !== 'deleted') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    // Entries ----------------------------------------------------------------------------------------------------------

    scope.get<{
      Querystring: {
        year?: number;
        status?: 'draft' | 'posted';
        account?: string;
        project?: string;
        counterparty?: string;
        q?: string;
      };
    }>(
      '/accounting/entries',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              year: YEAR,
              status: { type: 'string', enum: ['draft', 'posted'] },
              account: UUID,
              project: UUID,
              counterparty: UUID,
              q: TEXT(200),
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { query } = request;
          const year = query.year ?? Number(madridToday().slice(0, 4));
          return reading(db, actor, async (trx) => ({
            year,
            entries: await listEntries(trx, {
              year,
              ...(query.status === undefined ? {} : { status: query.status }),
              ...(query.account === undefined ? {} : { accountId: query.account }),
              ...(query.project === undefined ? {} : { projectId: query.project }),
              ...(query.counterparty === undefined ? {} : { counterpartyId: query.counterparty }),
              ...(blankToNull(query.q) === null ? {} : { query: query.q?.trim() ?? '' }),
            }),
          }));
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/accounting/entries/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const entry = await reading(db, actor, async (trx) => {
            const found = await getEntry(trx, request.params.id);
            return found && { ...found, bankLines: await linesOfEntry(trx, found.id) };
          });
          if (!entry) {
            throw new Refusal(404, 'notFound');
          }
          return { entry };
        }),
    );

    scope.post<{ Body: EntryBody }>(
      '/accounting/entries',
      { schema: { body: ENTRY_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { bankLineId } = request.body;
          if (bankLineId !== undefined && request.body.post !== true) {
            throw new Refusal(400, 'invalid', { field: 'bankLineId' });
          }
          const saved = await keeping(db, actor, async (trx) => {
            const input = await draftOf(trx, request.body);
            if (request.body.post === true && !isBalanced(input.lines)) {
              throw new Refusal(422, 'unbalanced');
            }
            // A bank line it records: one waiting for its entry, which this one moves by its amount.
            const line = bankLineId === undefined ? undefined : await lineToMatch(trx, bankLineId);
            if (bankLineId !== undefined) {
              const moved = input.lines
                .filter((each) => each.accountId === line?.accountId)
                .reduce((sum, each) => sum + each.debitCents - each.creditCents, 0);
              if (!line || line.closed || line.matched || moved !== line.amountCents) {
                throw new Refusal(409, 'bankLine', { field: 'amount' });
              }
            }
            const id = await addDraft(trx, input);
            const number = request.body.post === true ? await post(trx, id) : null;
            if (line && (await matchLine(trx, line.id, id)) !== 'matched') {
              throw new Refusal(409, 'bankLine', { field: 'amount' });
            }
            return { id, number };
          });
          return reply.code(201).send(saved);
        }),
    );

    scope.patch<{ Params: { id: string }; Body: EntryBody }>(
      '/accounting/entries/:id',
      { schema: { params: ID_PARAMS, body: ENTRY_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          keeping(db, actor, async (trx) => {
            const input = await draftOf(trx, request.body);
            if (request.body.post === true && !isBalanced(input.lines)) {
              throw new Refusal(422, 'unbalanced');
            }
            const result = await changeDraft(trx, request.params.id, input);
            if (result !== 'changed') {
              throw new Refusal(result === 'notFound' ? 404 : 409, result);
            }
            return {
              id: request.params.id,
              number: request.body.post === true ? await post(trx, request.params.id) : null,
            };
          }),
        ),
    );

    scope.post<{ Params: { id: string } }>(
      '/accounting/entries/:id/post',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          keeping(db, actor, async (trx) => ({ number: await post(trx, request.params.id) })),
        ),
    );

    scope.post<{ Params: { id: string }; Body: { date?: string } }>(
      '/accounting/entries/:id/reverse',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { date: DAY },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const today = madridToday();
          const date = request.body.date === undefined ? today : dayOf(request.body.date, 'date');
          if (date > today) {
            throw new Refusal(400, 'future', { field: 'date' });
          }
          const result = await keeping(db, actor, async (trx) => {
            const year = await yearStatusOf(trx, date);
            if (year !== 'open') {
              throw new Refusal(409, year === 'closed' ? 'yearClosed' : 'yearNotOpen', {
                field: 'date',
              });
            }
            return reverseEntry(trx, request.params.id, date, (original) =>
              t('accounting.reversalOf', {
                // Posted, so numbered: only a reversible entry gets this far.
                number: original.number ?? 0,
                year: original.year,
                description: original.description,
              }),
            );
          });
          if (typeof result === 'string') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(201).send(result);
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/entries/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) => deleteDraft(trx, request.params.id));
          if (typeof result === 'string') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          // Their rows are gone for good: their files go too, once committed. One that can't be removed now is set
          // aside at the next start, as any file without a row.
          for (const id of result.receipts) {
            await receipts?.remove(id).catch((error: unknown) => captureException(error));
          }
          return reply.code(204).send();
        }),
    );

    // The budget --------------------------------------------------------------------------------------------------------

    scope.get<{ Querystring: { year?: number } }>(
      '/accounting/budget',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: { year: YEAR },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const year = request.query.year ?? Number(madridToday().slice(0, 4));
          const budget = await reading(db, actor, (trx) => getBudget(trx, year));
          if (!budget) {
            throw new Refusal(404, 'yearNotOpen');
          }
          return { budget };
        }),
    );

    scope.post<{ Body: { year: number; accountId: string; amount: string } }>(
      '/accounting/budget',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['year', 'accountId', 'amount'],
            properties: { year: YEAR, accountId: UUID, amount: AMOUNT },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const cents = amountOf(request.body.amount, 'amount');
          const result = await keeping(db, actor, (trx) =>
            addBudgetLine(trx, request.body.year, request.body.accountId, cents),
          );
          if (typeof result === 'string') {
            throw new Refusal(409, result, {
              field: result === 'yearNotOpen' || result === 'yearClosed' ? 'year' : 'accountId',
            });
          }
          return reply.code(201).send(result);
        }),
    );

    scope.patch<{ Params: { id: string }; Body: { amount: string } }>(
      '/accounting/budget/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: { amount: AMOUNT },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const cents = amountOf(request.body.amount, 'amount');
          const result = await keeping(db, actor, (trx) =>
            changeBudgetLine(trx, request.params.id, cents),
          );
          if (result !== 'changed') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/budget/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) =>
            deleteBudgetLine(trx, request.params.id),
          );
          if (result !== 'deleted') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    // Reports ----------------------------------------------------------------------------------------------------------

    scope.get<{ Querystring: ReportQuery }>(
      '/accounting/reports/journal',
      { schema: { querystring: REPORT_QUERY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const range = rangeOf(request.query);
          return reading(db, actor, async (trx) => ({
            range,
            entries: await journal(trx, range, request.query.project ?? null),
          }));
        }),
    );

    scope.get<{ Querystring: ReportQuery }>(
      '/accounting/reports/ledger',
      { schema: { querystring: { ...REPORT_QUERY, required: ['account'] } } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const range = rangeOf(request.query);
          const found = await reading(db, actor, (trx) =>
            ledger(trx, range, request.query.account ?? ''),
          );
          if (!found) {
            throw new Refusal(404, 'notFound');
          }
          return { range, ledger: found };
        }),
    );

    scope.get<{ Querystring: ReportQuery }>(
      '/accounting/reports/income-expenses',
      { schema: { querystring: REPORT_QUERY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const range = rangeOf(request.query);
          return reading(db, actor, async (trx) => ({
            range,
            report: await incomeAndExpenses(trx, range, request.query.project ?? null),
          }));
        }),
    );

    scope.get<{ Querystring: ReportQuery }>(
      '/accounting/reports/balance',
      { schema: { querystring: REPORT_QUERY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const range = rangeOf(request.query);
          return reading(db, actor, async (trx) => ({
            range,
            report: await balanceSheet(trx, range),
          }));
        }),
    );

    scope.get<{ Querystring: ReportQuery }>(
      '/accounting/reports/project',
      { schema: { querystring: { ...REPORT_QUERY, required: ['project'] } } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const found = await reading(db, actor, (trx) =>
            byProject(trx, request.query.project ?? '', request.query.year ?? null),
          );
          if (!found) {
            throw new Refusal(404, 'notFound');
          }
          return { report: found };
        }),
    );

    // Each report as CSV, for tesorería and admins (decision 9), formula-looking cells defused (R18), and recorded.
    scope.get<{ Params: { report: string }; Querystring: ReportQuery }>(
      '/accounting/exports/:report',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          params: {
            type: 'object',
            properties: {
              report: { type: 'string', enum: BOOK_REPORTS.map((name) => `${name}.csv`) },
            },
            required: ['report'],
          },
          querystring: REPORT_QUERY,
        },
      },
      async (request, reply) =>
        fromAnotherSite(request)
          ? reply.code(403).send({ error: 'forbidden' })
          : signedIn(request, reply, async (db, actor) => {
              const report = request.params.report.replace(/\.csv$/u, '') as BookReport;
              const range = rangeOf(request.query);
              const csv = await reading(db, actor, async (trx) => {
                const made = await reportCsv(trx, report, range, {
                  accountId: request.query.account ?? null,
                  projectId: request.query.project ?? null,
                  wholeProject: request.query.year === undefined,
                });
                if (!made) {
                  throw new Refusal(400, 'invalid', {
                    field: report === 'ledger' ? 'account' : 'project',
                  });
                }
                await sql`INSERT INTO app.exports (kind, filter, row_count)
                          VALUES ('books_csv', ${JSON.stringify({
                            report,
                            ...range,
                            account: request.query.account ?? null,
                            project: request.query.project ?? null,
                          })}::jsonb, ${made.rows})`.execute(trx);
                return made;
              });
              return reply
                .header('content-type', 'text/csv; charset=utf-8')
                .header('content-disposition', `attachment; filename="${csv.fileName}"`)
                .send(csv.text);
            }),
    );

    // Receipts (receipt-routes.ts): their files, on the API's volume.
    await scope.register(receiptRoutes({ app, staffOrigin, actorFor, receipts }));
    // The bank (bank-routes.ts): statements imported, their lines matched.
    await scope.register(bankRoutes({ app, staffOrigin, actorFor }));
  };
