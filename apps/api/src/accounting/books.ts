import type { DB } from '@backoffice/db/generated/db';

import {
  type AccountKind,
  type EntryKind,
  type EntryLine,
  mirrorOf,
} from '@backoffice/domain/accounting';
import { sql, type Transaction } from 'kysely';

/**
 * The association's books (ADR-0006; accounting spec): years, the chart, counterparties, projects and entries. RLS
 * lets tesorería write and admins read, and the database keeps every rule (migration journal): these functions run
 * in the actor's transaction and say in words what the routes check first.
 */

type Trx = Transaction<DB>;

/** The database's own answer to whether the actor reads the books (tesorería or an admin) or writes them. */
export const BOOKS = sql<{ ok: boolean }>`SELECT private.staff_can('admin', 'tesoreria') AS ok`;
export const TESORERIA = sql<{ ok: boolean }>`SELECT private.staff_can('tesoreria') AS ok`;

/** A sum of cents as Postgres returns a bigint: a string. Every amount here fits a safe integer many times over. */
export const centsOf = (value: string | number | null | undefined): number => Number(value ?? 0);

const instant = (column: string) => sql.raw(`to_json(${column})#>>'{}'`);

// Fiscal years --------------------------------------------------------------------------------------------------------

export interface FiscalYear {
  year: number;
  status: 'open' | 'closed';
  assemblyOn: string | null;
  closedAt: string | null;
  closedBy: string | null;
  drafts: number;
  posted: number;
}

export const listYears = async (trx: Trx): Promise<FiscalYear[]> =>
  (
    await sql<FiscalYear>`
      SELECT y.year, y.status, y.assembly_on::text AS "assemblyOn", ${instant('y.closed_at')} AS "closedAt",
             s.display_name AS "closedBy",
             (SELECT count(*)::int FROM app.journal_entries e WHERE e.fiscal_year = y.year AND e.status = 'draft')
               AS drafts,
             (SELECT count(*)::int FROM app.journal_entries e WHERE e.fiscal_year = y.year AND e.status = 'posted')
               AS posted
        FROM app.fiscal_years y
        LEFT JOIN app.staff s ON s.user_id = y.closed_by
       ORDER BY y.year DESC`.execute(trx)
  ).rows;

export type OpenYearResult = 'opened' | 'notNext';

/** Opens a year: the first may be any, every later one the year after the last (the database's rule too). */
export const openYear = async (trx: Trx, year: number): Promise<OpenYearResult> => {
  const { rows } = await sql<{ last: number | null }>`
    SELECT max(year) AS last FROM app.fiscal_years`.execute(trx);
  const last = rows[0]?.last ?? null;
  if (last !== null && year !== last + 1) {
    return 'notNext';
  }
  await sql`INSERT INTO app.fiscal_years (year) VALUES (${year})`.execute(trx);
  return 'opened';
};

export type CloseYearResult =
  'closed' | 'notFound' | 'alreadyClosed' | 'earlierOpen' | 'drafts' | 'assemblyDate';

/**
 * Closes a year once the assembly has approved its accounts (accounting spec §3): the database posts the closing and
 * opening entries in the same step. Said in words first: a year closed already, one with an earlier year still open
 * or drafts left, an assembly before the year ended or still to come.
 */
export const closeYear = async (
  trx: Trx,
  year: number,
  assemblyOn: string,
  today: string,
): Promise<CloseYearResult> => {
  const { rows } = await sql<{ status: string; earlier: boolean; drafts: number }>`
    SELECT y.status,
           EXISTS (SELECT 1 FROM app.fiscal_years o WHERE o.year < y.year AND o.status = 'open') AS earlier,
           (SELECT count(*)::int FROM app.journal_entries e WHERE e.fiscal_year = y.year AND e.status = 'draft')
             AS drafts
      FROM app.fiscal_years y WHERE y.year = ${year}`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  if (found.status === 'closed') {
    return 'alreadyClosed';
  }
  if (assemblyOn <= `${year}-12-31` || assemblyOn > today) {
    return 'assemblyDate';
  }
  if (found.earlier) {
    return 'earlierOpen';
  }
  if (found.drafts > 0) {
    return 'drafts';
  }
  await sql`UPDATE app.fiscal_years SET status = 'closed', assembly_on = ${assemblyOn}::date
             WHERE year = ${year}`.execute(trx);
  return 'closed';
};

/** The status of the year a day falls in, or undefined if that year isn't open yet. */
export const yearStatusOf = async (trx: Trx, day: string): Promise<'open' | 'closed' | undefined> =>
  (
    await sql<{ status: 'open' | 'closed' }>`
      SELECT status FROM app.fiscal_years WHERE year = extract(year FROM ${day}::date)::integer`.execute(
      trx,
    )
  ).rows[0]?.status;

// The chart ----------------------------------------------------------------------------------------------------------

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  parentCode: string | null;
  treasury: boolean;
  iban: string | null;
  /** The account a year closes to (129). */
  yearResult: boolean;
  active: boolean;
  /** Has lines: never deleted, and never given sub-accounts. */
  used: boolean;
  /** Has sub-accounts: a group, which takes no lines of its own. */
  group: boolean;
}

/** The whole chart, by code: a parent comes right before its sub-accounts. */
export const listAccounts = async (trx: Trx): Promise<LedgerAccount[]> =>
  (
    await sql<LedgerAccount>`
      SELECT a.id, a.code, a.name, a.kind, a.parent_code AS "parentCode", a.treasury, a.iban,
             a.year_result AS "yearResult", a.active,
             EXISTS (SELECT 1 FROM app.journal_lines l WHERE l.account_id = a.id) AS used,
             EXISTS (SELECT 1 FROM app.ledger_accounts c WHERE c.parent_code = a.code) AS "group"
        FROM app.ledger_accounts a
       ORDER BY a.code`.execute(trx)
  ).rows;

export interface AccountInput {
  code: string;
  name: string;
  /** Required for an account without a parent; a sub-account takes its parent's. */
  kind?: AccountKind;
  parentCode: string | null;
  treasury: boolean;
  iban: string | null;
}

export type AddAccountResult =
  | { id: string }
  | 'codeTaken'
  | 'parentNotFound'
  | 'parentUsed'
  | 'codeOutsideParent'
  | 'kindRequired'
  | 'treasuryNotAsset';

/** A new account or sub-account (one per bank account, `5720001`), checked in words before the database does. */
export const addAccount = async (trx: Trx, input: AccountInput): Promise<AddAccountResult> => {
  const { rows } = await sql<{ taken: boolean; kind: AccountKind | null; used: boolean | null }>`
    SELECT EXISTS (SELECT 1 FROM app.ledger_accounts WHERE code = ${input.code}) AS taken,
           p.kind, EXISTS (SELECT 1 FROM app.journal_lines l WHERE l.account_id = p.id) AS used
      FROM (SELECT 1) one
      LEFT JOIN app.ledger_accounts p ON p.code = ${input.parentCode}`.execute(trx);
  const found = rows[0];
  if (found?.taken) {
    return 'codeTaken';
  }
  let kind = input.kind;
  if (input.parentCode !== null) {
    if (!found?.kind) {
      return 'parentNotFound';
    }
    if (found.used) {
      return 'parentUsed';
    }
    if (!input.code.startsWith(input.parentCode) || input.code.length <= input.parentCode.length) {
      return 'codeOutsideParent';
    }
    kind = found.kind;
  }
  if (!kind) {
    return 'kindRequired';
  }
  if (input.treasury && kind !== 'asset') {
    return 'treasuryNotAsset';
  }
  const inserted = await sql<{ id: string }>`
    INSERT INTO app.ledger_accounts (code, name, kind, parent_code, treasury, iban)
    VALUES (${input.code}, ${input.name.trim()}, ${kind}::app.account_kind, ${input.parentCode}, ${input.treasury},
            ${input.treasury ? input.iban : null})
    RETURNING id`.execute(trx);
  return { id: inserted.rows[0]?.id ?? '' };
};

export interface AccountChange {
  name?: string;
  treasury?: boolean;
  iban?: string | null;
  active?: boolean;
}

export type ChangeAccountResult = 'changed' | 'notFound' | 'treasuryNotAsset';

export const changeAccount = async (
  trx: Trx,
  id: string,
  change: AccountChange,
): Promise<ChangeAccountResult> => {
  const { rows } = await sql<{ kind: AccountKind; treasury: boolean }>`
    SELECT kind, treasury FROM app.ledger_accounts WHERE id = ${id}`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  const treasury = change.treasury ?? found.treasury;
  if (treasury && found.kind !== 'asset') {
    return 'treasuryNotAsset';
  }
  await sql`
    UPDATE app.ledger_accounts
       SET name = coalesce(${change.name?.trim() ?? null}, name),
           treasury = ${treasury},
           iban = CASE WHEN ${treasury} THEN ${change.iban === undefined ? sql`iban` : change.iban} END,
           active = coalesce(${change.active ?? null}, active)
     WHERE id = ${id}`.execute(trx);
  return 'changed';
};

export type DeleteResult = 'deleted' | 'notFound' | 'inUse';

/** Deletes an account never used, without sub-accounts, that a year doesn't close to; anything else is retired. */
export const deleteAccount = async (trx: Trx, id: string): Promise<DeleteResult> => {
  const { rows } = await sql<{ used: boolean }>`
    SELECT a.year_result
           OR EXISTS (SELECT 1 FROM app.journal_lines l WHERE l.account_id = a.id)
           OR EXISTS (SELECT 1 FROM app.ledger_accounts c WHERE c.parent_code = a.code) AS used
      FROM app.ledger_accounts a WHERE a.id = ${id}`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  if (found.used) {
    return 'inUse';
  }
  await sql`DELETE FROM app.ledger_accounts WHERE id = ${id}`.execute(trx);
  return 'deleted';
};

// Counterparties and projects ------------------------------------------------------------------------------------------

export interface Counterparty {
  id: string;
  kind: 'person' | 'organisation';
  name: string;
  taxId: string | null;
  province: string | null;
  iban: string | null;
  /** Named by an entry or a project: never deleted. */
  used: boolean;
}

export const listCounterparties = async (trx: Trx): Promise<Counterparty[]> =>
  (
    await sql<Counterparty>`
      SELECT c.id, c.kind, c.name, c.tax_id AS "taxId", c.province, c.iban,
             EXISTS (SELECT 1 FROM app.journal_entries e WHERE e.counterparty_id = c.id)
             OR EXISTS (SELECT 1 FROM app.projects p WHERE p.funder_id = c.id) AS used
        FROM app.counterparties c
       ORDER BY lower(c.name), c.id`.execute(trx)
  ).rows;

export interface CounterpartyInput {
  kind: 'person' | 'organisation';
  name: string;
  taxId: string | null;
  province: string | null;
  iban: string | null;
}

export const addCounterparty = async (trx: Trx, input: CounterpartyInput): Promise<string> =>
  (
    await sql<{ id: string }>`
      INSERT INTO app.counterparties (kind, name, tax_id, province, iban)
      VALUES (${input.kind}::app.counterparty_kind, ${input.name.trim()}, ${input.taxId}, ${input.province},
              ${input.iban})
      RETURNING id`.execute(trx)
  ).rows[0]?.id ?? '';

export const changeCounterparty = async (
  trx: Trx,
  id: string,
  input: CounterpartyInput,
): Promise<boolean> =>
  (
    await sql`
      UPDATE app.counterparties
         SET kind = ${input.kind}::app.counterparty_kind, name = ${input.name.trim()}, tax_id = ${input.taxId},
             province = ${input.province}, iban = ${input.iban}
       WHERE id = ${id}`.execute(trx)
  ).numAffectedRows === 1n;

export const deleteCounterparty = async (trx: Trx, id: string): Promise<DeleteResult> => {
  const found = (await listCounterparties(trx)).find((each) => each.id === id);
  if (!found) {
    return 'notFound';
  }
  if (found.used) {
    return 'inUse';
  }
  await sql`DELETE FROM app.counterparties WHERE id = ${id}`.execute(trx);
  return 'deleted';
};

export interface Project {
  id: string;
  name: string;
  funder: { id: string; name: string } | null;
  description: string | null;
  active: boolean;
  used: boolean;
}

export const listProjects = async (trx: Trx): Promise<Project[]> =>
  (
    await sql<Project>`
      SELECT p.id, p.name, p.description, p.active,
             CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name) END AS funder,
             EXISTS (SELECT 1 FROM app.journal_entries e WHERE e.project_id = p.id)
             OR EXISTS (SELECT 1 FROM app.journal_lines l WHERE l.project_id = p.id) AS used
        FROM app.projects p
        LEFT JOIN app.counterparties c ON c.id = p.funder_id
       ORDER BY p.active DESC, lower(p.name), p.id`.execute(trx)
  ).rows;

export interface ProjectInput {
  name: string;
  funderId: string | null;
  description: string | null;
  active: boolean;
}

export const addProject = async (trx: Trx, input: ProjectInput): Promise<string> =>
  (
    await sql<{ id: string }>`
      INSERT INTO app.projects (name, funder_id, description, active)
      VALUES (${input.name.trim()}, ${input.funderId}, ${input.description}, ${input.active})
      RETURNING id`.execute(trx)
  ).rows[0]?.id ?? '';

export const changeProject = async (trx: Trx, id: string, input: ProjectInput): Promise<boolean> =>
  (
    await sql`
      UPDATE app.projects
         SET name = ${input.name.trim()}, funder_id = ${input.funderId}, description = ${input.description},
             active = ${input.active}
       WHERE id = ${id}`.execute(trx)
  ).numAffectedRows === 1n;

export const deleteProject = async (trx: Trx, id: string): Promise<DeleteResult> => {
  const found = (await listProjects(trx)).find((each) => each.id === id);
  if (!found) {
    return 'notFound';
  }
  if (found.used) {
    return 'inUse';
  }
  await sql`DELETE FROM app.projects WHERE id = ${id}`.execute(trx);
  return 'deleted';
};

// Entries --------------------------------------------------------------------------------------------------------------

export interface EntrySummary {
  id: string;
  number: number | null;
  date: string;
  fiscalYear: number;
  description: string;
  kind: EntryKind;
  status: 'draft' | 'posted';
  /** What it moves: its debits (its credits, once it balances). */
  amountCents: number;
  counterparty: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  reverses: string | null;
  reversedBy: string | null;
  receipts: number;
}

export interface EntryFilter {
  year: number;
  status?: 'draft' | 'posted';
  accountId?: string;
  projectId?: string;
  counterpartyId?: string;
  /** In the concept, or the counterparty's name. */
  query?: string;
}

/** A year's entries, drafts first, then posted by number, newest first. */
export const listEntries = async (trx: Trx, filter: EntryFilter): Promise<EntrySummary[]> => {
  const like = filter.query ? `%${filter.query.replaceAll(/[\\%_]/gu, '\\$&')}%` : null;
  const { rows } = await sql<EntrySummary & { amountCents: string }>`
    SELECT e.id, e.number, e.entry_date::text AS date, e.fiscal_year AS "fiscalYear", e.description, e.kind,
           e.status,
           (SELECT coalesce(sum(l.debit_cents), 0) FROM app.journal_lines l WHERE l.entry_id = e.id)
             AS "amountCents",
           CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name) END AS counterparty,
           CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id, 'name', p.name) END AS project,
           e.reverses, r.id AS "reversedBy",
           (SELECT count(*)::int FROM app.receipts x WHERE x.entry_id = e.id) AS receipts
      FROM app.journal_entries e
      LEFT JOIN app.counterparties c ON c.id = e.counterparty_id
      LEFT JOIN app.projects p ON p.id = e.project_id
      LEFT JOIN app.journal_entries r ON r.reverses = e.id
     WHERE e.fiscal_year = ${filter.year}
       AND (${filter.status ?? null}::app.entry_status IS NULL OR e.status = ${filter.status ?? null}::app.entry_status)
       AND (${filter.accountId ?? null}::uuid IS NULL
            OR EXISTS (SELECT 1 FROM app.journal_lines l WHERE l.entry_id = e.id AND l.account_id = ${filter.accountId ?? null}::uuid))
       AND (${filter.projectId ?? null}::uuid IS NULL OR e.project_id = ${filter.projectId ?? null}::uuid
            OR EXISTS (SELECT 1 FROM app.journal_lines l WHERE l.entry_id = e.id AND l.project_id = ${filter.projectId ?? null}::uuid))
       AND (${filter.counterpartyId ?? null}::uuid IS NULL OR e.counterparty_id = ${filter.counterpartyId ?? null}::uuid)
       AND (${like}::text IS NULL OR e.description ILIKE ${like} OR c.name ILIKE ${like})
     ORDER BY e.status = 'posted', e.number DESC NULLS FIRST, e.entry_date DESC, e.created_at DESC
     LIMIT 1000`.execute(trx);
  return rows.map((row) => ({ ...row, amountCents: centsOf(row.amountCents) }));
};

export interface EntryDetailLine extends EntryLine {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
}

export interface ReceiptRow {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface EntryDetail extends EntrySummary {
  lines: EntryDetailLine[];
  receiptList: ReceiptRow[];
  createdBy: string | null;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
}

export const getEntry = async (trx: Trx, id: string): Promise<EntryDetail | undefined> => {
  const { rows } = await sql<
    Omit<EntryDetail, 'amountCents' | 'lines' | 'receiptList'> & { amountCents: string }
  >`
    SELECT e.id, e.number, e.entry_date::text AS date, e.fiscal_year AS "fiscalYear", e.description, e.kind,
           e.status,
           (SELECT coalesce(sum(l.debit_cents), 0) FROM app.journal_lines l WHERE l.entry_id = e.id)
             AS "amountCents",
           CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name) END AS counterparty,
           CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id', p.id, 'name', p.name) END AS project,
           e.reverses, r.id AS "reversedBy",
           (SELECT count(*)::int FROM app.receipts x WHERE x.entry_id = e.id) AS receipts,
           cs.display_name AS "createdBy", ${instant('e.created_at')} AS "createdAt",
           ps.display_name AS "postedBy", ${instant('e.posted_at')} AS "postedAt"
      FROM app.journal_entries e
      LEFT JOIN app.counterparties c ON c.id = e.counterparty_id
      LEFT JOIN app.projects p ON p.id = e.project_id
      LEFT JOIN app.journal_entries r ON r.reverses = e.id
      LEFT JOIN app.staff cs ON cs.user_id = e.created_by
      LEFT JOIN app.staff ps ON ps.user_id = e.posted_by
     WHERE e.id = ${id}`.execute(trx);
  const entry = rows[0];
  if (!entry) {
    return undefined;
  }
  const lines = await sql<EntryDetailLine & { debitCents: string; creditCents: string }>`
    SELECT l.id, l.account_id AS "accountId", a.code, a.name, a.kind, l.debit_cents AS "debitCents",
           l.credit_cents AS "creditCents", l.project_id AS "projectId"
      FROM app.journal_lines l JOIN app.ledger_accounts a ON a.id = l.account_id
     WHERE l.entry_id = ${id}
     ORDER BY l.debit_cents = 0, a.code, l.created_at, l.id`.execute(trx);
  const receipts = await sql<ReceiptRow>`
    SELECT id, file_name AS "fileName", content_type AS "contentType", byte_size AS "byteSize",
           ${instant('created_at')} AS "createdAt"
      FROM app.receipts WHERE entry_id = ${id} ORDER BY created_at, id`.execute(trx);
  return {
    ...entry,
    amountCents: centsOf(entry.amountCents),
    lines: lines.rows.map((line) => ({
      ...line,
      debitCents: centsOf(line.debitCents),
      creditCents: centsOf(line.creditCents),
    })),
    receiptList: receipts.rows,
  };
};

export interface DraftInput {
  kind: 'income' | 'expense' | 'transfer' | 'manual';
  date: string;
  description: string;
  counterpartyId: string | null;
  projectId: string | null;
  lines: readonly EntryLine[];
}

const insertLines = async (
  trx: Trx,
  entryId: string,
  lines: readonly EntryLine[],
): Promise<void> => {
  for (const line of lines) {
    await sql`
      INSERT INTO app.journal_lines (entry_id, account_id, debit_cents, credit_cents, project_id)
      VALUES (${entryId}, ${line.accountId}, ${line.debitCents}, ${line.creditCents}, ${line.projectId})`.execute(
      trx,
    );
  }
};

/** A new draft with its lines; its id. */
export const addDraft = async (trx: Trx, input: DraftInput): Promise<string> => {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.journal_entries (entry_date, description, kind, counterparty_id, project_id)
    VALUES (${input.date}::date, ${input.description.trim()}, ${input.kind}::app.entry_kind, ${input.counterpartyId},
            ${input.projectId})
    RETURNING id`.execute(trx);
  const id = rows[0]?.id ?? '';
  await insertLines(trx, id, input.lines);
  return id;
};

export type ChangeDraftResult = 'changed' | 'notFound' | 'posted' | 'kind';

/** A draft written again, its lines replaced: drafts are tesorería's to change (posted entries never). */
export const changeDraft = async (
  trx: Trx,
  id: string,
  input: DraftInput,
): Promise<ChangeDraftResult> => {
  const { rows } = await sql<{ status: string; kind: EntryKind }>`
    SELECT status, kind FROM app.journal_entries WHERE id = ${id} FOR UPDATE`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  if (found.status === 'posted') {
    return 'posted';
  }
  if (found.kind !== input.kind) {
    return 'kind';
  }
  await sql`
    UPDATE app.journal_entries
       SET entry_date = ${input.date}::date, description = ${input.description.trim()},
           counterparty_id = ${input.counterpartyId}, project_id = ${input.projectId}
     WHERE id = ${id}`.execute(trx);
  await sql`DELETE FROM app.journal_lines WHERE entry_id = ${id}`.execute(trx);
  await insertLines(trx, id, input.lines);
  return 'changed';
};

export type PostResult = { number: number } | 'notFound' | 'posted' | 'unbalanced';

/** Posts a draft: it must balance; the database numbers it next in its year. */
export const postEntry = async (trx: Trx, id: string): Promise<PostResult> => {
  const { rows } = await sql<{ status: string; balanced: boolean }>`
    SELECT e.status,
           (SELECT count(*) >= 2 AND sum(l.debit_cents) = sum(l.credit_cents)
              FROM app.journal_lines l WHERE l.entry_id = e.id) AS balanced
      FROM app.journal_entries e WHERE e.id = ${id} FOR UPDATE`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  if (found.status === 'posted') {
    return 'posted';
  }
  if (!found.balanced) {
    return 'unbalanced';
  }
  const posted = await sql<{ number: number }>`
    UPDATE app.journal_entries SET status = 'posted' WHERE id = ${id} RETURNING number`.execute(
    trx,
  );
  return { number: posted.rows[0]?.number ?? 0 };
};

export type DeleteDraftResult = { receipts: string[] } | 'notFound' | 'posted';

/** Deletes a draft, its lines and its receipts' rows; the receipts' ids, whose files the caller removes once committed. */
export const deleteDraft = async (trx: Trx, id: string): Promise<DeleteDraftResult> => {
  const { rows } = await sql<{ status: string }>`
    SELECT status FROM app.journal_entries WHERE id = ${id} FOR UPDATE`.execute(trx);
  if (!rows[0]) {
    return 'notFound';
  }
  if (rows[0].status === 'posted') {
    return 'posted';
  }
  const receipts = await sql<{ id: string }>`
    DELETE FROM app.receipts WHERE entry_id = ${id} RETURNING id`.execute(trx);
  await sql`DELETE FROM app.journal_entries WHERE id = ${id}`.execute(trx);
  return { receipts: receipts.rows.map((row) => row.id) };
};

export type ReverseResult =
  | { id: string; number: number }
  | 'notFound'
  | 'notPosted'
  | 'notReversible'
  | 'reversed'
  | 'beforeOriginal';

/**
 * "Corregir" (accounting spec §2): the reversing entry of a posted one, its lines mirrored, posted at once on `date`,
 * its concept as `describe` says it (packages/i18n). The staff app then opens a new form with the original's values,
 * so a mistake is fixed by two entries the journal can explain.
 */
export const reverseEntry = async (
  trx: Trx,
  id: string,
  date: string,
  describe: (original: { number: number | null; year: number; description: string }) => string,
): Promise<ReverseResult> => {
  const original = await getEntry(trx, id);
  if (!original) {
    return 'notFound';
  }
  if (original.status !== 'posted') {
    return 'notPosted';
  }
  if (original.kind === 'reversal' || original.kind === 'opening' || original.kind === 'closing') {
    return 'notReversible';
  }
  if (original.reversedBy !== null) {
    return 'reversed';
  }
  if (date < original.date) {
    return 'beforeOriginal';
  }
  const description = describe({
    number: original.number,
    year: original.fiscalYear,
    description: original.description,
  }).slice(0, 500);
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.journal_entries (entry_date, description, kind, reverses, counterparty_id, project_id)
    VALUES (${date}::date, ${description}, 'reversal', ${id}, ${original.counterparty?.id ?? null},
            ${original.project?.id ?? null})
    RETURNING id`.execute(trx);
  const reversal = rows[0]?.id ?? '';
  await insertLines(trx, reversal, mirrorOf(original.lines));
  const posted = await postEntry(trx, reversal);
  return { id: reversal, number: typeof posted === 'object' ? posted.number : 0 };
};

/** The accounts a form may use, by id: whether each exists, is active, takes lines, and its kind and treasury flag. */
export const accountsByIds = async (
  trx: Trx,
  ids: readonly string[],
): Promise<Map<string, { kind: AccountKind; treasury: boolean; postable: boolean }>> => {
  const { rows } = await sql<{
    id: string;
    kind: AccountKind;
    treasury: boolean;
    postable: boolean;
  }>`
    SELECT a.id, a.kind, a.treasury,
           a.active AND NOT EXISTS (SELECT 1 FROM app.ledger_accounts c WHERE c.parent_code = a.code) AS postable
      FROM app.ledger_accounts a WHERE a.id = ANY (${[...ids]}::uuid[])`.execute(trx);
  return new Map(rows.map((row) => [row.id, row]));
};

/** Whether a counterparty and a project (each optional) exist. */
export const referencesExist = async (
  trx: Trx,
  counterpartyId: string | null,
  projectId: string | null,
): Promise<{ counterparty: boolean; project: boolean }> => {
  const { rows } = await sql<{ counterparty: boolean; project: boolean }>`
    SELECT (${counterpartyId}::uuid IS NULL OR EXISTS (SELECT 1 FROM app.counterparties WHERE id = ${counterpartyId}::uuid))
             AS counterparty,
           (${projectId}::uuid IS NULL OR EXISTS (SELECT 1 FROM app.projects WHERE id = ${projectId}::uuid))
             AS project`.execute(trx);
  return rows[0] ?? { counterparty: false, project: false };
};
