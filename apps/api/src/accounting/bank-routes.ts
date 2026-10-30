import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import { madridToday } from '@backoffice/domain/days';
import {
  ibanOf,
  isAccountOf,
  lineKeys,
  lineText,
  Norma43Error,
  parseNorma43,
} from '@backoffice/domain/norma43';
import { captureException } from '@sentry/node';
import { createHash } from 'node:crypto';

import { databaseRefusal } from '../database-errors.js';
import { createRateLimiter } from '../rate-limit.js';
import {
  deleteStatement,
  entryByNumber,
  getLine,
  importStatements,
  type LineState,
  listLines,
  listStatements,
  listTreasuryAccounts,
  matchLine,
  reconciliationOf,
  type StatementToImport,
  unmatchLine,
} from './bank.js';
import { BOOKS, TESORERIA } from './books.js';

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

export interface BankRoutesOptions {
  app: Database | undefined;
  staffOrigin: string;
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
}

/** A statement file: a year of a small association's movements is a few dozen kilobytes. */
const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;

const UUID = { type: 'string', format: 'uuid' } as const;
const ID_PARAMS = { type: 'object', properties: { id: UUID }, required: ['id'] } as const;

const require = async (trx: Transaction<DB>, check: typeof BOOKS): Promise<void> => {
  const { rows } = await check.execute(trx);
  if (rows[0]?.ok !== true) {
    throw new Refusal(403, 'forbidden');
  }
};

/** A Norma 43 file's text: UTF-8 if it is valid UTF-8, else ISO-8859-1 as banks write it (read as Windows-1252). */
const textOf = (bytes: Buffer): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
};

/**
 * The bank (accounting spec §6, step 2): tesorería imports a statement, a Norma 43 file, first as a dry run (the
 * real import in a transaction rolled back, R17), then for real; matches each line to its entry, or undoes a match;
 * and undoes an import with nothing matched. Tesorería and admins read the lines, the suggestions and what the bank
 * and the books say. The file comes as the request's body (`application/octet-stream`, 2 MB at most); each account
 * in it goes to the treasury account with its IBAN.
 */
export const bankRoutes =
  ({ app, staffOrigin, actorFor }: BankRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    scope.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: MAX_STATEMENT_BYTES },
      (_request, body, done) => {
        done(null, body);
      },
    );

    // Imports per member and hour, dry runs included: a few statements a month, tried a few times each.
    const allowImport = createRateLimiter({ limit: 60, windowMs: 60 * 60_000 });

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
            'Bank request failed',
          );
          captureException(
            typeof code === 'string'
              ? new Error(`Bank request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({
          error: refusal.error,
          ...(refusal.constraint === undefined ? {} : { constraint: refusal.constraint }),
        });
      }
    };

    const reading = <T>(db: Database, actor: Actor, run: (trx: Transaction<DB>) => Promise<T>) =>
      withActor(db, actor, async (trx) => {
        await require(trx, BOOKS);
        return run(trx);
      });

    const keeping = <T>(db: Database, actor: Actor, run: (trx: Transaction<DB>) => Promise<T>) =>
      withActor(db, actor, async (trx) => {
        await require(trx, TESORERIA);
        return run(trx);
      });

    // A treasury account's statements, lines (waiting, matched or all, in a year) and what bank and books say.
    scope.get<{
      Querystring: { account?: string; year?: number; state?: LineState };
    }>(
      '/accounting/bank',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              account: UUID,
              year: { type: 'integer', minimum: 2000, maximum: 2999 },
              state: { type: 'string', enum: ['pending', 'matched', 'all'] },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const year = request.query.year ?? Number(madridToday().slice(0, 4));
          const state = request.query.state ?? 'pending';
          return reading(db, actor, async (trx) => {
            const accounts = await listTreasuryAccounts(trx);
            const account =
              accounts.find((each) => each.id === request.query.account) ??
              accounts.find((each) => each.iban !== null && each.active) ??
              accounts[0];
            if (!account) {
              return { accounts, account: null, year, state };
            }
            return {
              accounts,
              account: account.id,
              year,
              state,
              statements: await listStatements(trx, account.id),
              lines: await listLines(trx, account.id, year, state),
              reconciliation: await reconciliationOf(trx, account.id),
            };
          });
        }),
    );

    // A statement file: a dry run unless `apply`, which imports it for real (R17: the same code, rolled back).
    scope.post<{ Querystring: { apply?: boolean }; Body: Buffer }>(
      '/accounting/bank/statements',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: { apply: { type: 'boolean' } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
            throw new Refusal(400, 'invalid', { field: 'file' });
          }
          if (!allowImport(actor.userId)) {
            throw new Refusal(429, 'limit');
          }
          let accounts;
          try {
            accounts = parseNorma43(textOf(request.body));
          } catch (error) {
            if (error instanceof Norma43Error) {
              throw new Refusal(400, 'norma43', { problem: error.problem, line: error.line });
            }
            throw error;
          }
          if (accounts.some((each) => each.currency !== '978')) {
            throw new Refusal(400, 'norma43', { problem: 'currency' });
          }
          const sha256 = createHash('sha256').update(request.body).digest('hex');
          const apply = request.query.apply === true;
          // A dry run applies the file in a transaction that is then rolled back: its counts are what applying does.
          const DRY_RUN = Symbol('dry run');
          let answer: Record<string, unknown> = {};
          try {
            await keeping(db, actor, async (trx) => {
              const treasury = (await listTreasuryAccounts(trx)).filter(
                (each) => each.iban !== null,
              );
              const found = accounts.map((statement) => ({
                statement,
                account: treasury.find((each) => isAccountOf(each.iban ?? '', statement)),
              }));
              const toImport: StatementToImport[] = found.flatMap(({ statement, account }) =>
                account
                  ? [
                      {
                        accountId: account.id,
                        statement,
                        fingerprints: lineKeys(statement).map((key) =>
                          createHash('sha256').update(key).digest('hex'),
                        ),
                      },
                    ]
                  : [],
              );
              const counts = await importStatements(trx, sha256, toImport);
              const statements = found.map(({ statement, account }) => {
                const count = counts.find((each) => each.accountId === account?.id);
                return {
                  iban: ibanOf(statement),
                  account: account
                    ? { id: account.id, code: account.code, name: account.name }
                    : null,
                  startsOn: statement.startsOn,
                  endsOn: statement.endsOn,
                  openingCents: statement.openingCents,
                  closingCents: statement.closingCents,
                  lines: statement.lines.length,
                  new: count?.new ?? 0,
                  already: count?.already ?? 0,
                  closedYear: count?.closedYear ?? 0,
                  statementId: count?.statementId ?? null,
                };
              });
              const unknown = statements.some((each) => each.account === null);
              const closedYear = statements.some((each) => each.closedYear > 0);
              const nothingNew = statements.every((each) => each.new === 0);
              if (apply && unknown) {
                throw new Refusal(409, 'unknownAccount');
              }
              if (apply && closedYear) {
                throw new Refusal(409, 'yearClosed');
              }
              if (apply && nothingNew) {
                throw new Refusal(409, 'nothingNew');
              }
              answer = apply
                ? { statements }
                : {
                    statements: statements.map(({ statementId: _id, ...each }) => each),
                    // The first new movements, as they would come in, to check before importing.
                    preview: toImport
                      .flatMap(({ statement }) =>
                        statement.lines.map((line) => ({
                          bookedOn: line.bookedOn,
                          commonConcept: line.commonConcept,
                          amountCents: line.amountCents,
                          ...lineText(line),
                        })),
                      )
                      .slice(0, 20),
                    canApply: !unknown && !closedYear && !nothingNew,
                  };
              if (!apply) {
                throw DRY_RUN;
              }
            });
          } catch (error) {
            if (error !== DRY_RUN) {
              throw error;
            }
          }
          return reply.code(apply ? 201 : 200).send(answer);
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/bank/statements/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) => deleteStatement(trx, request.params.id));
          if (result !== 'deleted') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/accounting/bank/lines/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const line = await reading(db, actor, (trx) => getLine(trx, request.params.id));
          if (!line) {
            throw new Refusal(404, 'notFound');
          }
          return { line };
        }),
    );

    // A match: a suggestion's entry by its id, or any entry by its number and year, as tesorería writes it.
    scope.put<{
      Params: { id: string };
      Body: { entryId: string } | { year: number; number: number };
    }>(
      '/accounting/bank/lines/:id/match',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['entryId'],
                properties: { entryId: UUID },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['year', 'number'],
                properties: {
                  year: { type: 'integer', minimum: 2000, maximum: 2999 },
                  number: { type: 'integer', minimum: 1, maximum: 999_999 },
                },
              },
            ],
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { body } = request;
          const result = await keeping(db, actor, async (trx) => {
            const entryId =
              'entryId' in body ? body.entryId : await entryByNumber(trx, body.year, body.number);
            return entryId === undefined
              ? ('notAMatch' as const)
              : matchLine(trx, request.params.id, entryId);
          });
          if (result !== 'matched') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/bank/lines/:id/match',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await keeping(db, actor, (trx) => unmatchLine(trx, request.params.id));
          if (result !== 'unmatched') {
            throw new Refusal(result === 'notFound' ? 404 : 409, result);
          }
          return reply.code(204).send();
        }),
    );
  };
