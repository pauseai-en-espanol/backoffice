import type { DB } from '@backoffice/db/generated/db';
import type { Norma43Account } from '@backoffice/domain/norma43';

import { lineText } from '@backoffice/domain/norma43';
import { sql, type Transaction } from 'kysely';

import { centsOf } from './books.js';

/**
 * The bank (accounting spec §6, step 2): statements imported from Norma 43 files, their lines matched to the entries
 * that record them, and what the bank and the books say of each treasury account. RLS lets tesorería write and admins
 * read, and the database keeps every rule (migration bank_statements): these functions run in the actor's
 * transaction and say in words what the routes check first.
 */

type Trx = Transaction<DB>;

const instant = (column: string) => sql.raw(`to_json(${column})#>>'{}'`);

/** The kinds of entry a line can match: the forms', never a reversal nor the database's opening or closing. */
const MATCHABLE = sql.raw(`('income', 'expense', 'transfer', 'manual')`);

// Treasury accounts ----------------------------------------------------------------------------------------------------

export interface TreasuryAccount {
  id: string;
  code: string;
  name: string;
  iban: string | null;
  active: boolean;
}

/** The chart's treasury accounts without sub-accounts, by code: where statements go. */
export const listTreasuryAccounts = async (trx: Trx): Promise<TreasuryAccount[]> =>
  (
    await sql<TreasuryAccount>`
      SELECT a.id, a.code, a.name, a.iban, a.active
        FROM app.ledger_accounts a
       WHERE a.treasury AND NOT EXISTS (SELECT 1 FROM app.ledger_accounts c WHERE c.parent_code = a.code)
       ORDER BY a.code`.execute(trx)
  ).rows;

// Importing -----------------------------------------------------------------------------------------------------------

/** An account's statement from a file, with the treasury account it belongs to and each line's fingerprint. */
export interface StatementToImport {
  accountId: string;
  statement: Norma43Account;
  /** One per line, in order: the hash of its records and its place among equal ones (norma43.ts, lineKeys). */
  fingerprints: string[];
}

export interface ImportCount {
  accountId: string;
  /** The statement's row, when it brought something new. */
  statementId: string | null;
  lines: number;
  new: number;
  /** Already imported with an earlier statement: an overlapping period, or the same file again. */
  already: number;
  /** New, but dated in a closed year: the database refuses them, and so the whole import. */
  closedYear: number;
}

/**
 * Imports each statement: only its lines not imported yet, with a statement row only if there are any. A statement
 * with new lines dated in a closed year is counted, not written, and the route refuses the import (the database
 * would): a dry run runs this same function and rolls back (R17), so its counts are what applying does.
 */
export const importStatements = async (
  trx: Trx,
  sha256: string,
  statements: readonly StatementToImport[],
): Promise<ImportCount[]> => {
  const { rows: closed } = await sql<{ year: number }>`
    SELECT year FROM app.fiscal_years WHERE status = 'closed'`.execute(trx);
  const closedYears = new Set(closed.map((row) => row.year));
  const counts: ImportCount[] = [];
  for (const { accountId, statement, fingerprints } of statements) {
    const { rows: known } = await sql<{ fingerprint: string }>`
      SELECT fingerprint FROM app.bank_statement_lines
       WHERE account_id = ${accountId} AND fingerprint = ANY (${fingerprints}::text[])`.execute(
      trx,
    );
    const already = new Set(known.map((row) => row.fingerprint));
    const fresh = statement.lines
      .map((line, index) => ({ line, fingerprint: fingerprints[index] ?? '' }))
      // The same fingerprint twice in one file can't be: lineKeys numbers equal lines apart.
      .filter((each) => !already.has(each.fingerprint));
    const count: ImportCount = {
      accountId,
      statementId: null,
      lines: statement.lines.length,
      new: fresh.length,
      already: statement.lines.length - fresh.length,
      closedYear: fresh.filter((each) => closedYears.has(Number(each.line.bookedOn.slice(0, 4))))
        .length,
    };
    counts.push(count);
    if (fresh.length === 0 || count.closedYear > 0) {
      continue;
    }
    const { rows } = await sql<{ id: string }>`
      INSERT INTO app.bank_statements (account_id, sha256, starts_on, ends_on, opening_cents, closing_cents)
      VALUES (${accountId}, ${sha256}, ${statement.startsOn}::date, ${statement.endsOn}::date,
              ${statement.openingCents}, ${statement.closingCents})
      RETURNING id`.execute(trx);
    const statementId = rows[0]?.id ?? '';
    count.statementId = statementId;
    const texts = fresh.map((each) => lineText(each.line));
    await sql`
      INSERT INTO app.bank_statement_lines (statement_id, account_id, booked_on, value_on, common_concept,
                                            amount_cents, description, reference, fingerprint)
      SELECT ${statementId}, ${accountId}, l.booked_on, l.value_on, l.common_concept, l.amount_cents,
             l.description, l.reference, l.fingerprint
        FROM unnest(${fresh.map((each) => each.line.bookedOn)}::date[],
                    ${fresh.map((each) => each.line.valueOn)}::date[],
                    ${fresh.map((each) => each.line.commonConcept)}::text[],
                    ${fresh.map((each) => each.line.amountCents)}::bigint[],
                    ${texts.map((text) => text.description)}::text[],
                    ${texts.map((text) => text.reference)}::text[],
                    ${fresh.map((each) => each.fingerprint)}::text[])
          AS l(booked_on, value_on, common_concept, amount_cents, description, reference, fingerprint)`.execute(
      trx,
    );
  }
  return counts;
};

export type DeleteStatementResult = 'deleted' | 'notFound' | 'matched' | 'yearClosed';

/** Undoes an import: the statement and its lines, unless one is matched or dated in a closed year. */
export const deleteStatement = async (trx: Trx, id: string): Promise<DeleteStatementResult> => {
  const { rows } = await sql<{ matched: boolean; closed: boolean }>`
    SELECT EXISTS (SELECT 1 FROM app.bank_statement_lines b WHERE b.statement_id = s.id AND b.entry_id IS NOT NULL)
             AS matched,
           EXISTS (SELECT 1 FROM app.bank_statement_lines b
                     JOIN app.fiscal_years y ON y.year = extract(year FROM b.booked_on)::integer
                    WHERE b.statement_id = s.id AND y.status = 'closed') AS closed
      FROM app.bank_statements s WHERE s.id = ${id}`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  if (found.matched) {
    return 'matched';
  }
  if (found.closed) {
    return 'yearClosed';
  }
  await sql`DELETE FROM app.bank_statements WHERE id = ${id}`.execute(trx);
  return 'deleted';
};

// Reading -------------------------------------------------------------------------------------------------------------

export interface StatementSummary {
  id: string;
  startsOn: string;
  endsOn: string;
  openingCents: number;
  closingCents: number;
  lines: number;
  matched: number;
  importedBy: string | null;
  importedAt: string;
}

export const listStatements = async (trx: Trx, accountId: string): Promise<StatementSummary[]> => {
  const { rows } = await sql<StatementSummary & { openingCents: string; closingCents: string }>`
    SELECT s.id, s.starts_on::text AS "startsOn", s.ends_on::text AS "endsOn", s.opening_cents AS "openingCents",
           s.closing_cents AS "closingCents",
           (SELECT count(*)::int FROM app.bank_statement_lines b WHERE b.statement_id = s.id) AS lines,
           (SELECT count(*)::int FROM app.bank_statement_lines b WHERE b.statement_id = s.id AND b.entry_id IS NOT NULL)
             AS matched,
           st.display_name AS "importedBy", ${instant('s.created_at')} AS "importedAt"
      FROM app.bank_statements s
      LEFT JOIN app.staff st ON st.user_id = s.created_by
     WHERE s.account_id = ${accountId}
     ORDER BY s.ends_on DESC, s.created_at DESC
     LIMIT 200`.execute(trx);
  return rows.map((row) => ({
    ...row,
    openingCents: centsOf(row.openingCents),
    closingCents: centsOf(row.closingCents),
  }));
};

export interface EntryRef {
  id: string;
  number: number | null;
  year: number;
  date: string;
  description: string;
}

export interface BankLine {
  id: string;
  statementId: string;
  bookedOn: string;
  valueOn: string;
  commonConcept: string;
  amountCents: number;
  description: string;
  reference: string;
  /** The entry it is matched to; `corrected` when a reversal has corrected it since, and it waits for the right one. */
  entry: (EntryRef & { corrected: boolean }) | null;
  /** For a line waiting for its entry: posted entries that move the account by its amount, within 15 days. */
  suggestions: EntryRef[];
}

export type LineState = 'pending' | 'matched' | 'all';

/**
 * A treasury account's lines in a year, newest first: those waiting for their entry (none yet, or a corrected one),
 * those matched, or all; each waiting one with up to three suggestions, the nearest in date first. A suggestion is a
 * posted entry of a form, not corrected, matched to no line of this account, that moves it by the line's amount.
 */
export const listLines = async (
  trx: Trx,
  accountId: string,
  year: number,
  state: LineState,
): Promise<BankLine[]> => {
  const { rows } = await sql<
    Omit<BankLine, 'amountCents' | 'suggestions'> & {
      amountCents: string;
      suggestions: EntryRef[] | null;
    }
  >`
    WITH lines AS (
      SELECT b.*,
             e.id AS e_id, e.number AS e_number, e.fiscal_year AS e_year, e.entry_date AS e_date,
             e.description AS e_description,
             EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = e.id) AS corrected
        FROM app.bank_statement_lines b
        LEFT JOIN app.journal_entries e ON e.id = b.entry_id
       WHERE b.account_id = ${accountId} AND extract(year FROM b.booked_on)::integer = ${year}
    )
    SELECT l.id, l.statement_id AS "statementId", l.booked_on::text AS "bookedOn", l.value_on::text AS "valueOn",
           l.common_concept AS "commonConcept", l.amount_cents AS "amountCents", l.description, l.reference,
           CASE WHEN l.e_id IS NULL THEN NULL
                ELSE json_build_object('id', l.e_id, 'number', l.e_number, 'year', l.e_year,
                                       'date', l.e_date::text, 'description', l.e_description,
                                       'corrected', l.corrected) END AS entry,
           CASE WHEN l.e_id IS NULL OR l.corrected THEN (
             SELECT json_agg(json_build_object('id', s.id, 'number', s.number, 'year', s.fiscal_year,
                                               'date', s.entry_date::text, 'description', s.description)
                             ORDER BY s.distance, s.number)
               FROM (
                 SELECT e.id, e.number, e.fiscal_year, e.entry_date, e.description,
                        abs(e.entry_date - l.booked_on) AS distance
                   FROM app.journal_entries e
                   JOIN app.journal_lines j ON j.entry_id = e.id AND j.account_id = l.account_id
                  WHERE e.status = 'posted' AND e.kind IN ${MATCHABLE}
                    AND e.entry_date BETWEEN l.booked_on - 15 AND l.booked_on + 15
                    AND NOT EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = e.id)
                    AND NOT EXISTS (SELECT 1 FROM app.bank_statement_lines m
                                     WHERE m.account_id = l.account_id AND m.entry_id = e.id)
                  GROUP BY e.id
                 HAVING sum(j.debit_cents - j.credit_cents) = l.amount_cents
                  ORDER BY distance, e.number
                  LIMIT 3) s)
           END AS suggestions
      FROM lines l
     WHERE ${state} = 'all'
        OR (${state} = 'pending' AND (l.e_id IS NULL OR l.corrected))
        OR (${state} = 'matched' AND l.e_id IS NOT NULL AND NOT l.corrected)
     ORDER BY l.booked_on DESC, l.created_at DESC, l.fingerprint
     LIMIT 1000`.execute(trx);
  return rows.map((row) => ({
    ...row,
    amountCents: centsOf(row.amountCents),
    suggestions: row.suggestions ?? [],
  }));
};

export interface Reconciliation {
  /** The last imported statement's last day, and what the bank said the account held at its end. */
  asOf: string | null;
  bankCents: number | null;
  /** What the books say it held that day, from posted entries. */
  booksCents: number | null;
  /** Lines waiting for their entry, in any year. */
  pendingLines: number;
  /** Posted entries of the forms that move the account within the statements' periods, matched to no line. */
  unmatchedEntries: EntryRef[];
}

/**
 * What the bank and the books say of a treasury account on the last imported statement's last day, and what isn't
 * matched yet on either side. The books' balance counts the year's opening entry and, while the years before aren't
 * closed (so nothing was carried forward), their movements too.
 */
export const reconciliationOf = async (trx: Trx, accountId: string): Promise<Reconciliation> => {
  const { rows: last } = await sql<{ asOf: string; bankCents: string; firstDay: string }>`
    SELECT s.ends_on::text AS "asOf", s.closing_cents AS "bankCents",
           (SELECT min(f.starts_on)::text FROM app.bank_statements f WHERE f.account_id = s.account_id)
             AS "firstDay"
      FROM app.bank_statements s
     WHERE s.account_id = ${accountId}
     ORDER BY s.ends_on DESC, s.created_at DESC
     LIMIT 1`.execute(trx);
  const { rows: pending } = await sql<{ count: number }>`
    SELECT count(*)::int AS count
      FROM app.bank_statement_lines b
      LEFT JOIN app.journal_entries e ON e.id = b.entry_id
     WHERE b.account_id = ${accountId}
       AND (b.entry_id IS NULL OR EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = e.id))`.execute(
    trx,
  );
  const found = last[0];
  if (!found) {
    return {
      asOf: null,
      bankCents: null,
      booksCents: null,
      pendingLines: pending[0]?.count ?? 0,
      unmatchedEntries: [],
    };
  }
  const { rows: books } = await sql<{ cents: string | null }>`
    WITH carried AS (
      SELECT coalesce(max(e.fiscal_year), 0) AS since
        FROM app.journal_entries e
       WHERE e.kind = 'opening' AND e.status = 'posted'
         AND e.fiscal_year <= extract(year FROM ${found.asOf}::date)::integer
    )
    SELECT sum(l.debit_cents - l.credit_cents) AS cents
      FROM app.journal_lines l
      JOIN app.journal_entries e ON e.id = l.entry_id
     WHERE l.account_id = ${accountId} AND e.status = 'posted' AND e.entry_date <= ${found.asOf}::date
       AND e.fiscal_year >= (SELECT since FROM carried)`.execute(trx);
  const { rows: unmatched } = await sql<EntryRef>`
    SELECT e.id, e.number, e.fiscal_year AS year, e.entry_date::text AS date, e.description
      FROM app.journal_entries e
      JOIN app.journal_lines l ON l.entry_id = e.id AND l.account_id = ${accountId}
     WHERE e.status = 'posted' AND e.kind IN ${MATCHABLE}
       AND e.entry_date BETWEEN ${found.firstDay}::date AND ${found.asOf}::date
       AND NOT EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = e.id)
       AND NOT EXISTS (SELECT 1 FROM app.bank_statement_lines b
                        WHERE b.account_id = ${accountId} AND b.entry_id = e.id)
     GROUP BY e.id
    HAVING sum(l.debit_cents - l.credit_cents) <> 0
     ORDER BY e.entry_date DESC, e.number DESC
     LIMIT 200`.execute(trx);
  return {
    asOf: found.asOf,
    bankCents: centsOf(found.bankCents),
    booksCents: centsOf(books[0]?.cents),
    pendingLines: pending[0]?.count ?? 0,
    unmatchedEntries: unmatched,
  };
};

// Matching ------------------------------------------------------------------------------------------------------------

export interface LineToMatch {
  id: string;
  accountId: string;
  amountCents: number;
  bookedOn: string;
  closed: boolean;
  /** Matched to an entry not corrected since: a match to undo before another. */
  matched: boolean;
}

/** A line as matching needs it, or undefined. */
export const lineToMatch = async (trx: Trx, id: string): Promise<LineToMatch | undefined> => {
  const { rows } = await sql<LineToMatch & { amountCents: string }>`
    SELECT b.id, b.account_id AS "accountId", b.amount_cents AS "amountCents", b.booked_on::text AS "bookedOn",
           EXISTS (SELECT 1 FROM app.fiscal_years y
                    WHERE y.year = extract(year FROM b.booked_on)::integer AND y.status = 'closed') AS closed,
           (b.entry_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = b.entry_id)) AS matched
      FROM app.bank_statement_lines b WHERE b.id = ${id}`.execute(trx);
  const row = rows[0];
  return row ? { ...row, amountCents: centsOf(row.amountCents) } : undefined;
};

export type MatchResult = 'matched' | 'notFound' | 'yearClosed' | 'matchedAlready' | 'notAMatch';

/**
 * Matches a line to an entry, said in words first: a line dated in a closed year, one matched already (undo it
 * first), or an entry that isn't one it can match (a draft, a corrected one, a reversal, one matched to another line
 * of the account, or one that doesn't move the account by the line's amount).
 */
export const matchLine = async (trx: Trx, id: string, entryId: string): Promise<MatchResult> => {
  const line = await lineToMatch(trx, id);
  if (!line) {
    return 'notFound';
  }
  if (line.closed) {
    return 'yearClosed';
  }
  if (line.matched) {
    return 'matchedAlready';
  }
  const { rows } = await sql<{ ok: boolean }>`
    SELECT sum(l.debit_cents - l.credit_cents) = ${line.amountCents} AS ok
      FROM app.journal_entries e
      JOIN app.journal_lines l ON l.entry_id = e.id AND l.account_id = ${line.accountId}
     WHERE e.id = ${entryId} AND e.status = 'posted' AND e.kind IN ${MATCHABLE}
       AND NOT EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = e.id)
       AND NOT EXISTS (SELECT 1 FROM app.bank_statement_lines b
                        WHERE b.account_id = ${line.accountId} AND b.entry_id = e.id AND b.id <> ${id})`.execute(
    trx,
  );
  if (rows[0]?.ok !== true) {
    return 'notAMatch';
  }
  await sql`UPDATE app.bank_statement_lines SET entry_id = ${entryId} WHERE id = ${id}`.execute(
    trx,
  );
  return 'matched';
};

export type UnmatchResult = 'unmatched' | 'notFound' | 'yearClosed' | 'notMatched';

export const unmatchLine = async (trx: Trx, id: string): Promise<UnmatchResult> => {
  const { rows } = await sql<{ entryId: string | null; closed: boolean }>`
    SELECT b.entry_id AS "entryId",
           EXISTS (SELECT 1 FROM app.fiscal_years y
                    WHERE y.year = extract(year FROM b.booked_on)::integer AND y.status = 'closed') AS closed
      FROM app.bank_statement_lines b WHERE b.id = ${id}`.execute(trx);
  const found = rows[0];
  if (!found) {
    return 'notFound';
  }
  if (found.closed) {
    return 'yearClosed';
  }
  if (found.entryId === null) {
    return 'notMatched';
  }
  await sql`UPDATE app.bank_statement_lines SET entry_id = NULL WHERE id = ${id}`.execute(trx);
  return 'unmatched';
};

export interface LineDetail {
  id: string;
  accountId: string;
  bookedOn: string;
  commonConcept: string;
  amountCents: number;
  description: string;
  reference: string;
  /** Waits for its entry: none yet, or a corrected one. */
  pending: boolean;
}

/** One line, as Nuevo movimiento starts from it ("Anotar"); undefined if there is none. */
export const getLine = async (trx: Trx, id: string): Promise<LineDetail | undefined> => {
  const { rows } = await sql<LineDetail & { amountCents: string }>`
    SELECT b.id, b.account_id AS "accountId", b.booked_on::text AS "bookedOn", b.common_concept AS "commonConcept",
           b.amount_cents AS "amountCents", b.description, b.reference,
           (b.entry_id IS NULL
            OR EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = b.entry_id)) AS pending
      FROM app.bank_statement_lines b WHERE b.id = ${id}`.execute(trx);
  const row = rows[0];
  return row ? { ...row, amountCents: centsOf(row.amountCents) } : undefined;
};

/** A posted entry's id by its number in its year, for a match tesorería writes by number. */
export const entryByNumber = async (
  trx: Trx,
  year: number,
  number: number,
): Promise<string | undefined> =>
  (
    await sql<{ id: string }>`
      SELECT id FROM app.journal_entries WHERE fiscal_year = ${year} AND number = ${number}`.execute(
      trx,
    )
  ).rows[0]?.id;

/** The bank lines an entry is matched to, for its page. */
export const linesOfEntry = async (
  trx: Trx,
  entryId: string,
): Promise<{ id: string; accountId: string; bookedOn: string; amountCents: number }[]> => {
  const { rows } = await sql<{
    id: string;
    accountId: string;
    bookedOn: string;
    amountCents: string;
  }>`
    SELECT b.id, b.account_id AS "accountId", b.booked_on::text AS "bookedOn", b.amount_cents AS "amountCents"
      FROM app.bank_statement_lines b WHERE b.entry_id = ${entryId}
     ORDER BY b.booked_on`.execute(trx);
  return rows.map((row) => ({ ...row, amountCents: centsOf(row.amountCents) }));
};
