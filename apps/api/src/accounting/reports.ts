import type { DB } from '@backoffice/db/generated/db';

import { type AccountKind, normalBalance } from '@backoffice/domain/accounting';
import { sql, type Transaction } from 'kysely';

import { centsOf, listAccounts } from './books.js';

/**
 * The books' reports (accounting spec §4), from posted entries only, for any range of days within a year, and by
 * project. Income and expenses leave out the closing entry, which only carries them to the year's result: a closed
 * year still shows what came in and went out, and its balance sheet the result as its own line, as an open year's.
 */

type Trx = Transaction<DB>;

export interface Range {
  year: number;
  /** First and last day, within the year; the whole year by default. */
  from: string;
  to: string;
}

export interface JournalLine {
  code: string;
  name: string;
  debitCents: number;
  creditCents: number;
  project: string | null;
}

export interface JournalEntry {
  id: string;
  number: number;
  date: string;
  description: string;
  kind: string;
  counterparty: string | null;
  lines: JournalLine[];
}

/** Libro diario: every posted entry in the range by number, with its lines; with a project, those touching it. */
export const journal = async (
  trx: Trx,
  range: Range,
  projectId: string | null,
): Promise<JournalEntry[]> =>
  (
    await sql<JournalEntry>`
      SELECT e.id, e.number, e.entry_date::text AS date, e.description, e.kind, c.name AS counterparty,
             json_agg(json_build_object('code', a.code, 'name', a.name, 'debitCents', l.debit_cents,
                                        'creditCents', l.credit_cents, 'project', p.name)
                      ORDER BY l.debit_cents = 0, a.code, l.id) AS lines
        FROM app.journal_entries e
        JOIN app.journal_lines l ON l.entry_id = e.id
        JOIN app.ledger_accounts a ON a.id = l.account_id
        LEFT JOIN app.projects p ON p.id = coalesce(l.project_id, e.project_id)
        LEFT JOIN app.counterparties c ON c.id = e.counterparty_id
       WHERE e.status = 'posted' AND e.fiscal_year = ${range.year}
         AND e.entry_date BETWEEN ${range.from}::date AND ${range.to}::date
         AND (${projectId}::uuid IS NULL
              OR EXISTS (SELECT 1 FROM app.journal_lines o WHERE o.entry_id = e.id
                            AND coalesce(o.project_id, e.project_id) = ${projectId}::uuid))
       GROUP BY e.id, c.name
       ORDER BY e.number`.execute(trx)
  ).rows;

export interface LedgerMovement {
  entryId: string;
  number: number;
  date: string;
  description: string;
  code: string;
  debitCents: number;
  creditCents: number;
  /** As the account's kind reads it (an asset's debits less credits; income's the other way round). */
  balanceCents: number;
}

export interface Ledger {
  account: { id: string; code: string; name: string; kind: AccountKind };
  /** What it held before the range's first day, within the year (its opening entry included). */
  openingCents: number;
  movements: LedgerMovement[];
  closingCents: number;
}

/**
 * Libro mayor: an account's movements in the range by date, its sub-accounts' included, with the running balance;
 * every posted entry counts, the year's closing entry too.
 */
export const ledger = async (
  trx: Trx,
  range: Range,
  accountId: string,
): Promise<Ledger | undefined> => {
  const account = (await listAccounts(trx)).find((each) => each.id === accountId);
  if (!account) {
    return undefined;
  }
  const { rows } = await sql<{
    entryId: string;
    number: number;
    date: string;
    description: string;
    code: string;
    debitCents: string;
    creditCents: string;
    before: boolean;
  }>`
    WITH RECURSIVE tree AS (
      SELECT id, code FROM app.ledger_accounts WHERE id = ${accountId}
      UNION ALL
      SELECT a.id, a.code FROM app.ledger_accounts a JOIN tree t ON a.parent_code = t.code)
    SELECT e.id AS "entryId", e.number, e.entry_date::text AS date, e.description, tree.code,
           l.debit_cents AS "debitCents", l.credit_cents AS "creditCents", e.entry_date < ${range.from}::date AS before
      FROM app.journal_lines l
      JOIN tree ON tree.id = l.account_id
      JOIN app.journal_entries e ON e.id = l.entry_id
     WHERE e.status = 'posted' AND e.fiscal_year = ${range.year} AND e.entry_date <= ${range.to}::date
     ORDER BY e.entry_date, e.number, l.id`.execute(trx);
  const of = (debit: number, credit: number) =>
    Number(normalBalance(account.kind, BigInt(debit), BigInt(credit)));
  const openingCents = rows
    .filter((row) => row.before)
    .reduce((sum, row) => sum + of(centsOf(row.debitCents), centsOf(row.creditCents)), 0);
  let balance = openingCents;
  const movements: LedgerMovement[] = [];
  for (const { before, ...row } of rows) {
    if (before) {
      continue;
    }
    const debitCents = centsOf(row.debitCents);
    const creditCents = centsOf(row.creditCents);
    balance += of(debitCents, creditCents);
    movements.push({ ...row, debitCents, creditCents, balanceCents: balance });
  }
  return {
    account: { id: account.id, code: account.code, name: account.name, kind: account.kind },
    openingCents,
    movements,
    closingCents: balance,
  };
};

export interface ReportLine {
  code: string;
  name: string;
  cents: number;
}

export interface ReportGroup extends ReportLine {
  lines: ReportLine[];
}

/** Each account's movement in the range as its kind reads it, accounts of the given kinds, the closing entry left out. */
const totals = async (
  trx: Trx,
  kinds: readonly AccountKind[],
  range: Range,
  projectId: string | null,
): Promise<Map<string, number>> => {
  const { rows } = await sql<{ id: string; kind: AccountKind; debits: string; credits: string }>`
    SELECT a.id, a.kind, sum(l.debit_cents) AS debits, sum(l.credit_cents) AS credits
      FROM app.journal_lines l
      JOIN app.journal_entries e ON e.id = l.entry_id
      JOIN app.ledger_accounts a ON a.id = l.account_id
     WHERE e.status = 'posted' AND e.kind <> 'closing' AND e.fiscal_year = ${range.year}
       AND e.entry_date BETWEEN ${range.from}::date AND ${range.to}::date
       AND a.kind = ANY (${[...kinds]}::app.account_kind[])
       AND (${projectId}::uuid IS NULL OR coalesce(l.project_id, e.project_id) = ${projectId}::uuid)
     GROUP BY a.id`.execute(trx);
  return new Map(
    rows.map((row) => [
      row.id,
      Number(normalBalance(row.kind, BigInt(row.debits), BigInt(row.credits))),
    ]),
  );
};

/** The accounts with a movement, under the chart's groups they belong to (their top ancestor), groups by code. */
const grouped = async (trx: Trx, amounts: Map<string, number>): Promise<ReportGroup[]> => {
  const chart = await listAccounts(trx);
  const byCode = new Map(chart.map((account) => [account.code, account]));
  const rootOf = (code: string): string => {
    let current = byCode.get(code);
    while (current?.parentCode) {
      const parent = byCode.get(current.parentCode);
      if (!parent) {
        break;
      }
      current = parent;
    }
    return current?.code ?? code;
  };
  const groups = new Map<string, ReportGroup>();
  for (const account of chart) {
    const cents = amounts.get(account.id);
    if (cents === undefined || cents === 0) {
      continue;
    }
    const root = byCode.get(rootOf(account.code));
    const key = root?.code ?? account.code;
    const group = groups.get(key) ?? {
      code: key,
      name: root?.name ?? account.name,
      cents: 0,
      lines: [],
    };
    group.cents += cents;
    group.lines.push({ code: account.code, name: account.name, cents });
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
};

export interface IncomeAndExpenses {
  income: ReportGroup[];
  expenses: ReportGroup[];
  totalIncomeCents: number;
  totalExpensesCents: number;
  /** Income less expenses: a surplus when positive. */
  resultCents: number;
}

/**
 * Ingresos y gastos, and the cuenta de resultados: the range's income and expenses by account, under the chart's
 * groups, and the result. With a project, only its lines (or its entries' when a line names none).
 */
export const incomeAndExpenses = async (
  trx: Trx,
  range: Range,
  projectId: string | null,
): Promise<IncomeAndExpenses> => {
  const income = await grouped(trx, await totals(trx, ['income'], range, projectId));
  const expenses = await grouped(trx, await totals(trx, ['expense'], range, projectId));
  const totalIncomeCents = income.reduce((sum, group) => sum + group.cents, 0);
  const totalExpensesCents = expenses.reduce((sum, group) => sum + group.cents, 0);
  return {
    income,
    expenses,
    totalIncomeCents,
    totalExpensesCents,
    resultCents: totalIncomeCents - totalExpensesCents,
  };
};

export interface BalanceSheet {
  assets: ReportGroup[];
  liabilities: ReportGroup[];
  equity: ReportGroup[];
  /** The year's result up to the range's last day, not yet carried to its account. */
  resultCents: number;
  totalAssetsCents: number;
  /** Liabilities, equity and the result: equal to the assets, or the books don't balance. */
  totalLiabilitiesAndEquityCents: number;
}

/** Balance: what the association has and owes on the range's last day, by the chart's groups. */
export const balanceSheet = async (trx: Trx, range: Range): Promise<BalanceSheet> => {
  const upTo: Range = { ...range, from: `${range.year}-01-01` };
  const assets = await grouped(trx, await totals(trx, ['asset'], upTo, null));
  const liabilities = await grouped(trx, await totals(trx, ['liability'], upTo, null));
  const equity = await grouped(trx, await totals(trx, ['equity'], upTo, null));
  const { resultCents } = await incomeAndExpenses(trx, upTo, null);
  const sum = (groups: ReportGroup[]) => groups.reduce((total, group) => total + group.cents, 0);
  return {
    assets,
    liabilities,
    equity,
    resultCents,
    totalAssetsCents: sum(assets),
    totalLiabilitiesAndEquityCents: sum(liabilities) + sum(equity) + resultCents,
  };
};

export interface ProjectMovement {
  entryId: string;
  number: number;
  date: string;
  fiscalYear: number;
  description: string;
  code: string;
  name: string;
  /** Came in for the project (income), or went to it (expenses). */
  incomeCents: number;
  expenseCents: number;
  receipts: string[];
}

export interface ProjectReport {
  project: { id: string; name: string; funder: string | null };
  movements: ProjectMovement[];
  totalIncomeCents: number;
  totalExpensesCents: number;
}

/**
 * Por proyecto: what came in for a project and what went to it, in every year or one, with the receipts' names, for
 * whoever funded it.
 */
export const byProject = async (
  trx: Trx,
  projectId: string,
  year: number | null,
): Promise<ProjectReport | undefined> => {
  const { rows: found } = await sql<{ id: string; name: string; funder: string | null }>`
    SELECT p.id, p.name, c.name AS funder FROM app.projects p LEFT JOIN app.counterparties c ON c.id = p.funder_id
     WHERE p.id = ${projectId}`.execute(trx);
  const project = found[0];
  if (!project) {
    return undefined;
  }
  const { rows } = await sql<{
    entryId: string;
    number: number;
    date: string;
    fiscalYear: number;
    description: string;
    code: string;
    name: string;
    kind: AccountKind;
    debitCents: string;
    creditCents: string;
    receipts: string[];
  }>`
    SELECT e.id AS "entryId", e.number, e.entry_date::text AS date, e.fiscal_year AS "fiscalYear", e.description,
           a.code, a.name, a.kind, l.debit_cents AS "debitCents", l.credit_cents AS "creditCents",
           coalesce((SELECT array_agg(r.file_name ORDER BY r.created_at) FROM app.receipts r WHERE r.entry_id = e.id),
                    '{}') AS receipts
      FROM app.journal_lines l
      JOIN app.journal_entries e ON e.id = l.entry_id
      JOIN app.ledger_accounts a ON a.id = l.account_id
     WHERE e.status = 'posted' AND e.kind <> 'closing' AND a.kind IN ('income', 'expense')
       AND coalesce(l.project_id, e.project_id) = ${projectId}
       AND (${year}::integer IS NULL OR e.fiscal_year = ${year}::integer)
     ORDER BY e.entry_date, e.number, l.id`.execute(trx);
  const movements = rows.map(({ kind, debitCents, creditCents, ...row }) => {
    const cents = Number(normalBalance(kind, BigInt(debitCents), BigInt(creditCents)));
    return {
      ...row,
      incomeCents: kind === 'income' ? cents : 0,
      expenseCents: kind === 'expense' ? cents : 0,
    };
  });
  return {
    project,
    movements,
    totalIncomeCents: movements.reduce((sum, each) => sum + each.incomeCents, 0),
    totalExpensesCents: movements.reduce((sum, each) => sum + each.expenseCents, 0),
  };
};
