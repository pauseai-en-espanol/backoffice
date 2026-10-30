import type { DB } from '@backoffice/db/generated/db';

import { type AccountKind, normalBalance } from '@backoffice/domain/accounting';
import { sql, type Transaction } from 'kysely';

import { centsOf, listAccounts } from './books.js';

/**
 * A budget per year (accounting spec §6, step 2): what tesorería expects to come in and go out, by income or expense
 * account, and what did, from posted entries (the closing entry left out). RLS lets tesorería write and admins read;
 * the database keeps the rules (migration budgets): one line per account and year, none above or below another, and
 * nothing changed in a closed year.
 */

type Trx = Transaction<DB>;

interface AccountRef {
  id: string;
  code: string;
  name: string;
  kind: 'income' | 'expense';
}

export interface BudgetLine {
  id: string;
  account: AccountRef;
  budgetCents: number;
  /** What came in or went out on the account and its sub-accounts. */
  actualCents: number;
}

export interface Budget {
  year: number;
  status: 'open' | 'closed';
  lines: BudgetLine[];
  /** Accounts that moved with no budget line over them, under the chart's leaves. */
  unbudgeted: { account: AccountRef; actualCents: number }[];
  income: { budgetCents: number; actualCents: number };
  expenses: { budgetCents: number; actualCents: number };
}

/** A year's budget against what was posted, by line and in total; undefined if the year isn't open yet. */
export const getBudget = async (trx: Trx, year: number): Promise<Budget | undefined> => {
  const { rows: years } = await sql<{ status: 'open' | 'closed' }>`
    SELECT status FROM app.fiscal_years WHERE year = ${year}`.execute(trx);
  const status = years[0]?.status;
  if (!status) {
    return undefined;
  }
  const chart = await listAccounts(trx);
  const byCode = new Map(chart.map((account) => [account.code, account]));
  const { rows: moved } = await sql<{
    id: string;
    kind: AccountKind;
    debits: string;
    credits: string;
  }>`
    SELECT a.id, a.kind, sum(l.debit_cents) AS debits, sum(l.credit_cents) AS credits
      FROM app.journal_lines l
      JOIN app.journal_entries e ON e.id = l.entry_id
      JOIN app.ledger_accounts a ON a.id = l.account_id
     WHERE e.status = 'posted' AND e.kind <> 'closing' AND e.fiscal_year = ${year}
       AND a.kind IN ('income', 'expense')
     GROUP BY a.id`.execute(trx);
  const actual = new Map(
    moved.map((row) => [
      row.id,
      Number(normalBalance(row.kind, BigInt(row.debits), BigInt(row.credits))),
    ]),
  );
  const { rows } = await sql<{ id: string; accountId: string; budgetCents: string }>`
    SELECT b.id, b.account_id AS "accountId", b.amount_cents AS "budgetCents"
      FROM app.budget_lines b WHERE b.fiscal_year = ${year}`.execute(trx);

  /** Whether `code` is `top` or under it, by the chart's parents. */
  const under = (code: string, top: string): boolean => {
    for (let current = byCode.get(code); current;) {
      if (current.code === top) {
        return true;
      }
      current = current.parentCode ? byCode.get(current.parentCode) : undefined;
    }
    return false;
  };
  const refOf = (id: string): AccountRef | undefined => {
    const account = chart.find((each) => each.id === id);
    return account && (account.kind === 'income' || account.kind === 'expense')
      ? { id: account.id, code: account.code, name: account.name, kind: account.kind }
      : undefined;
  };

  const lines: BudgetLine[] = rows
    .flatMap((row) => {
      const account = refOf(row.accountId);
      if (!account) {
        return [];
      }
      const actualCents = chart
        .filter((each) => under(each.code, account.code))
        .reduce((sum, each) => sum + (actual.get(each.id) ?? 0), 0);
      return [{ id: row.id, account, budgetCents: centsOf(row.budgetCents), actualCents }];
    })
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
  const unbudgeted = [...actual.entries()]
    .flatMap(([id, actualCents]) => {
      const account = refOf(id);
      return account &&
        actualCents !== 0 &&
        !lines.some((line) => under(account.code, line.account.code))
        ? [{ account, actualCents }]
        : [];
    })
    .sort((a, b) => a.account.code.localeCompare(b.account.code));
  const total = (kind: 'income' | 'expense') => ({
    budgetCents: lines
      .filter((line) => line.account.kind === kind)
      .reduce((sum, line) => sum + line.budgetCents, 0),
    actualCents: [...actual.entries()].reduce(
      (sum, [id, cents]) => sum + (refOf(id)?.kind === kind ? cents : 0),
      0,
    ),
  });
  return {
    year,
    status,
    lines,
    unbudgeted,
    income: total('income'),
    expenses: total('expense'),
  };
};

export type AddBudgetLineResult =
  { id: string } | 'yearNotOpen' | 'yearClosed' | 'account' | 'nested' | 'taken';

/**
 * Adds a line to a year's budget, said in words first: a year not open or closed, an account that isn't an income
 * or expense one, one budgeted already, or one above or below a budgeted one.
 */
export const addBudgetLine = async (
  trx: Trx,
  year: number,
  accountId: string,
  cents: number,
): Promise<AddBudgetLineResult> => {
  const { rows: years } = await sql<{ status: 'open' | 'closed' }>`
    SELECT status FROM app.fiscal_years WHERE year = ${year}`.execute(trx);
  const status = years[0]?.status;
  if (!status) {
    return 'yearNotOpen';
  }
  if (status === 'closed') {
    return 'yearClosed';
  }
  const chart = await listAccounts(trx);
  const account = chart.find((each) => each.id === accountId);
  if (!account || (account.kind !== 'income' && account.kind !== 'expense')) {
    return 'account';
  }
  const byCode = new Map(chart.map((each) => [each.code, each]));
  const ancestry = (code: string): string[] => {
    const codes: string[] = [];
    for (let current = byCode.get(code); current;) {
      codes.push(current.code);
      current = current.parentCode ? byCode.get(current.parentCode) : undefined;
    }
    return codes;
  };
  const { rows } = await sql<{ accountId: string }>`
    SELECT account_id AS "accountId" FROM app.budget_lines WHERE fiscal_year = ${year}`.execute(
    trx,
  );
  const budgeted = rows.flatMap((row) => chart.find((each) => each.id === row.accountId) ?? []);
  if (budgeted.some((each) => each.id === accountId)) {
    return 'taken';
  }
  if (
    budgeted.some(
      (each) =>
        ancestry(account.code).includes(each.code) || ancestry(each.code).includes(account.code),
    )
  ) {
    return 'nested';
  }
  const { rows: added } = await sql<{ id: string }>`
    INSERT INTO app.budget_lines (fiscal_year, account_id, amount_cents)
    VALUES (${year}, ${accountId}, ${cents}) RETURNING id`.execute(trx);
  return { id: added[0]?.id ?? '' };
};

export type ChangeBudgetLineResult = 'changed' | 'deleted' | 'notFound' | 'yearClosed';

/** A budget line's year status, for its change or removal; undefined if there is no such line. */
const statusOfLine = async (trx: Trx, id: string): Promise<'open' | 'closed' | undefined> =>
  (
    await sql<{ status: 'open' | 'closed' }>`
      SELECT y.status FROM app.budget_lines b JOIN app.fiscal_years y ON y.year = b.fiscal_year
       WHERE b.id = ${id}`.execute(trx)
  ).rows[0]?.status;

export const changeBudgetLine = async (
  trx: Trx,
  id: string,
  cents: number,
): Promise<ChangeBudgetLineResult> => {
  const status = await statusOfLine(trx, id);
  if (!status) {
    return 'notFound';
  }
  if (status === 'closed') {
    return 'yearClosed';
  }
  await sql`UPDATE app.budget_lines SET amount_cents = ${cents} WHERE id = ${id}`.execute(trx);
  return 'changed';
};

export const deleteBudgetLine = async (trx: Trx, id: string): Promise<ChangeBudgetLineResult> => {
  const status = await statusOfLine(trx, id);
  if (!status) {
    return 'notFound';
  }
  if (status === 'closed') {
    return 'yearClosed';
  }
  await sql`DELETE FROM app.budget_lines WHERE id = ${id}`.execute(trx);
  return 'deleted';
};
