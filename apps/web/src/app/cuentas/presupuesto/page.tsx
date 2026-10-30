import type { Metadata } from 'next';

import { madridToday } from '@backoffice/domain/days';
import { formatEuros, formatEurosPlain } from '@backoffice/domain/money';
import { getTranslator } from '@backoffice/i18n/messages';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import { AddBudgetLine, BudgetLineForm } from '@/accounting/BudgetForms';
import { getAccounts, getBudget, getYears } from '@/accounting/data';
import * as books from '@/accounting/styles';
import { budgetErrors, canKeepBooks, canReadBooks } from '@/accounting/text';
import { type Budget, type BudgetLine } from '@/accounting/types';
import { isUnavailable } from '@/data';
import * as onboarding from '@/onboarding/styles';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.budget.title') };

const one = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** How much of the budget was used, in whole percent; none without a budget. */
const usedOf = (budgetCents: number, actualCents: number): string =>
  budgetCents === 0
    ? '—'
    : t('books.budget.percent', { percent: Math.round((actualCents / budgetCents) * 100) });

/**
 * Presupuesto (accounting spec §6a): a year's budget, by income or expense account, against what was posted; the
 * accounts that moved and have no line; and the result expected and real. Tesorería sets it while the year is open;
 * admins read.
 */
const BudgetPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  if (!canReadBooks(me)) {
    return (
      <AppShell me={me}>
        <BooksOnly />
      </AppShell>
    );
  }
  const params = await searchParams;
  const years = await getYears();
  if (isUnavailable(years)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const thisYear = Number(madridToday().slice(0, 4));
  const asked = Number(one(params.ejercicio));
  const year = years.some((each) => each.year === asked)
    ? asked
    : (years.find((each) => each.year === thisYear) ?? years[0])?.year;
  if (year === undefined) {
    return (
      <AppShell me={me}>
        <h1 className={styles.h1}>{t('books.budget.title')}</h1>
        <p className={styles.notice}>{t('books.movements.noYears')}</p>
      </AppShell>
    );
  }
  const [budget, accounts] = await Promise.all([getBudget(year), getAccounts()]);
  if (isUnavailable(budget) || isUnavailable(accounts)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const editable = canKeepBooks(me) && budget.status === 'open';
  const errors = budgetErrors(t);
  const choices = accounts
    .filter(
      (account) => (account.kind === 'income' || account.kind === 'expense') && account.active,
    )
    .map(({ id, code, name }) => ({ id, code, name }));

  /** Income or expenses: each line, the accounts that moved without one, and the total. */
  const section = (kind: 'income' | 'expense', caption: string) => {
    const lines = budget.lines.filter((line) => line.account.kind === kind);
    const unbudgeted = budget.unbudgeted.filter((each) => each.account.kind === kind);
    const totals: Budget['income'] = kind === 'income' ? budget.income : budget.expenses;
    const row = (line: BudgetLine) => (
      <tr key={line.id}>
        <th scope="row">
          <span className={books.code}>{line.account.code}</span> · {line.account.name}
        </th>
        <td className={books.amount}>
          {editable ? (
            <BudgetLineForm
              id={line.id}
              amount={formatEurosPlain(line.budgetCents)}
              text={{
                label: t('books.budget.changeLabel', {
                  account: `${line.account.code} · ${line.account.name}`,
                }),
                save: t('books.budget.save'),
                saved: t('books.budget.saved'),
                remove: t('books.budget.remove'),
                removeLabel: t('books.budget.removeLabel', {
                  account: `${line.account.code} · ${line.account.name}`,
                }),
                removeText: {
                  question: t('books.budget.removeQuestion'),
                  confirm: t('books.budget.removeConfirm'),
                  cancel: t('books.entry.cancel'),
                  done: t('books.budget.removed'),
                  errors,
                },
                errors,
              }}
            />
          ) : (
            formatEuros(line.budgetCents)
          )}
        </td>
        <td className={books.amount}>{formatEuros(line.actualCents)}</td>
        <td className={books.amount}>{formatEuros(line.actualCents - line.budgetCents)}</td>
        <td className={books.amount}>{usedOf(line.budgetCents, line.actualCents)}</td>
      </tr>
    );
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{t('books.budget.account')}</th>
              <th scope="col" className={books.amount}>
                {t('books.budget.budget')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.budget.actual')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.budget.difference')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.budget.used')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map(row)}
            {unbudgeted.map((each) => (
              <tr key={each.account.id}>
                <th scope="row">
                  <span className={books.code}>{each.account.code}</span> · {each.account.name}
                  <span className={`${styles.block} ${styles.hint}`}>
                    {t('books.budget.unbudgeted')}
                  </span>
                </th>
                <td className={books.amount}>—</td>
                <td className={books.amount}>{formatEuros(each.actualCents)}</td>
                <td className={books.amount}>{formatEuros(each.actualCents)}</td>
                <td className={books.amount}>—</td>
              </tr>
            ))}
            <tr className={books.totalRow}>
              <th scope="row">{t('books.budget.total')}</th>
              <td className={books.amount}>{formatEuros(totals.budgetCents)}</td>
              <td className={books.amount}>{formatEuros(totals.actualCents)}</td>
              <td className={books.amount}>
                {formatEuros(totals.actualCents - totals.budgetCents)}
              </td>
              <td className={books.amount}>{usedOf(totals.budgetCents, totals.actualCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>
        {t('books.budget.title')} · {year}
      </h1>
      <p className={styles.text}>{t('books.budget.intro')}</p>
      {canKeepBooks(me) ? null : <p className={styles.hint}>{t('books.budget.readOnly')}</p>}
      {budget.status === 'closed' ? (
        <p className={styles.notice}>{t('books.budget.closed')}</p>
      ) : null}
      <form method="get" action="/cuentas/presupuesto" className={onboarding.filters}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ejercicio">
            {t('books.budget.year')}
          </label>
          <select
            id="ejercicio"
            name="ejercicio"
            className={onboarding.select}
            defaultValue={String(year)}
          >
            {years.map((each) => (
              <option key={each.year} value={each.year}>
                {each.year}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.rowActions} data-wide="">
          <button type="submit" className={styles.button}>
            {t('books.budget.apply')}
          </button>
        </div>
      </form>
      {editable ? (
        <AddBudgetLine
          year={year}
          accounts={choices}
          text={{
            title: t('books.budget.addTitle'),
            account: t('books.budget.addAccount'),
            accountHint: t('books.budget.addAccountHint'),
            amount: t('books.budget.addAmount'),
            amountHint: t('books.form.amountHint'),
            choose: t('books.form.choose'),
            add: t('books.budget.add'),
            added: t('books.budget.added'),
            errors,
          }}
        />
      ) : null}
      {budget.lines.length === 0 ? <p className={styles.text}>{t('books.budget.none')}</p> : null}
      {section('income', t('books.budget.income'))}
      {section('expense', t('books.budget.expenses'))}
      <dl className={styles.facts}>
        <dt>{t('books.budget.result')}</dt>
        <dd>
          {t('books.budget.budget')}:{' '}
          {formatEuros(budget.income.budgetCents - budget.expenses.budgetCents)} ·{' '}
          {t('books.budget.actual')}:{' '}
          {formatEuros(budget.income.actualCents - budget.expenses.actualCents)}
        </dd>
      </dl>
    </AppShell>
  );
};

export default BudgetPage;
