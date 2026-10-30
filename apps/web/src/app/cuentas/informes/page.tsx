import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { formatDay, madridToday, parseDay } from '@backoffice/domain/days';
import { formatEuros } from '@backoffice/domain/money';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import {
  getAccounts,
  getBalance,
  getIncomeAndExpenses,
  getJournal,
  getLedger,
  getProjectReport,
  getProjects,
  getYears,
  type ReportQuery,
  reportQuery,
} from '@/accounting/data';
import * as books from '@/accounting/styles';
import { canReadBooks } from '@/accounting/text';
import { type ReportGroup } from '@/accounting/types';
import { riskyDownload } from '@/auth/confirm';
import { isUnavailable } from '@/data';
import * as onboarding from '@/onboarding/styles';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.reports.title') };

/** Each report: its address here (Spanish) and the API's name for it. */
const REPORTS = [
  { slug: 'diario', api: 'journal', label: 'journal' },
  { slug: 'mayor', api: 'ledger', label: 'ledger' },
  { slug: 'ingresos-y-gastos', api: 'income-expenses', label: 'incomeExpenses' },
  { slug: 'balance', api: 'balance', label: 'balance' },
  { slug: 'proyecto', api: 'project', label: 'project' },
] as const;

const one = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** A report's groups as rows: each group with its total, its accounts indented under it. */
const GroupRows = ({ groups }: { groups: readonly ReportGroup[] }) =>
  groups.flatMap((group) => [
    <tr key={group.code} className={books.groupRow}>
      <th scope="row">
        <span className={books.code}>{group.code}</span> · {group.name}
      </th>
      <td className={books.amount}>{formatEuros(group.cents)}</td>
    </tr>,
    ...group.lines.map((line) => (
      <tr key={`${group.code}-${line.code}`}>
        <th scope="row" className={books.indented}>
          <span className={books.code}>{line.code}</span> · {line.name}
        </th>
        <td className={books.amount}>{formatEuros(line.cents)}</td>
      </tr>
    )),
  ]);

const Total = ({ label, cents }: { label: string; cents: number }) => (
  <tr className={books.totalRow}>
    <th scope="row">{label}</th>
    <td className={books.amount}>{formatEuros(cents)}</td>
  </tr>
);

const Section = ({ caption, children }: { caption: string; children: ReactNode }) => (
  <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption>{caption}</caption>
      <tbody>{children}</tbody>
    </table>
  </div>
);

/**
 * Informes (accounting spec §4), from posted entries only, for a range within a year: the journal, an account's
 * ledger, income and expenses, the balance sheet, and a project's report; each exported as CSV, one of the riskiest
 * actions (PLAN D23), so the link goes through "Confirma que eres tú" when the second factor is older than 12 hours.
 */
const ReportsPage = async ({
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
  const [years, accounts, projects] = await Promise.all([getYears(), getAccounts(), getProjects()]);
  if (isUnavailable(years) || isUnavailable(accounts) || isUnavailable(projects)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const report = REPORTS.find((each) => each.slug === one(params.informe)) ?? REPORTS[0];
  const thisYear = Number(madridToday().slice(0, 4));
  const asked = Number(one(params.ejercicio));
  const year = years.some((each) => each.year === asked)
    ? asked
    : ((years.find((each) => each.year === thisYear) ?? years[0])?.year ?? thisYear);
  const from = parseDay(one(params.desde));
  const to = parseDay(one(params.hasta));
  const account = one(params.cuenta) || undefined;
  const project = one(params.proyecto) || undefined;
  const query: ReportQuery = {
    year,
    ...(from?.startsWith(`${year}-`) ? { from } : {}),
    ...(to?.startsWith(`${year}-`) ? { to } : {}),
    ...(report.api === 'ledger' && account ? { account } : {}),
    ...(project ? { project } : {}),
  };
  const back = `/cuentas/informes?${new URLSearchParams(
    Object.entries({
      informe: report.slug,
      ejercicio: String(year),
      desde: from ?? '',
      hasta: to ?? '',
      cuenta: account ?? '',
      proyecto: project ?? '',
    }).filter(([, value]) => value !== ''),
  ).toString()}`;
  const needs =
    report.api === 'ledger' && !account
      ? t('books.reports.chooseAccount')
      : report.api === 'project' && !project
        ? t('books.reports.chooseProject')
        : undefined;

  let body: ReactNode = null;
  if (needs) {
    body = <p className={styles.text}>{needs}</p>;
  } else if (report.api === 'journal') {
    const found = await getJournal(query);
    body = isUnavailable(found) ? null : found.entries.length === 0 ? (
      <p className={styles.text}>{t('books.reports.empty')}</p>
    ) : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>{t('books.reports.journal')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('books.movements.date')}</th>
              <th scope="col">{t('books.entry.account')}</th>
              <th scope="col" className={books.amount}>
                {t('books.entry.debit')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.entry.credit')}
              </th>
            </tr>
          </thead>
          {found.entries.map((entry) => (
            <tbody key={entry.id}>
              <tr className={books.groupRow}>
                <td>{formatDay(entry.date)}</td>
                <th scope="rowgroup" colSpan={3}>
                  <Link className={styles.link} href={`/cuentas/${encodeURIComponent(entry.id)}`}>
                    {t('books.movements.number', { number: entry.number })} · {entry.description}
                  </Link>
                  {entry.counterparty ? ` · ${entry.counterparty}` : ''}
                </th>
              </tr>
              {entry.lines.map((line, index) => (
                // A line in the journal is its place in its entry.
                <tr key={`${entry.id}-${String(index)}`}>
                  <td colSpan={2} className={books.indented}>
                    <span className={books.code}>{line.code}</span> · {line.name}
                  </td>
                  <td className={books.amount}>
                    {line.debitCents ? formatEuros(line.debitCents) : ''}
                  </td>
                  <td className={books.amount}>
                    {line.creditCents ? formatEuros(line.creditCents) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    );
  } else if (report.api === 'ledger') {
    const found = await getLedger(query);
    body = isUnavailable(found) ? null : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>
            {found.account.code} · {found.account.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('books.movements.date')}</th>
              <th scope="col">{t('books.movements.concept')}</th>
              <th scope="col" className={books.amount}>
                {t('books.entry.debit')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.entry.credit')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.reports.balanceColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className={books.groupRow}>
              <th scope="row" colSpan={4}>
                {t('books.reports.opening')}
              </th>
              <td className={books.amount}>{formatEuros(found.openingCents)}</td>
            </tr>
            {found.movements.map((movement, index) => (
              <tr key={`${movement.entryId}-${String(index)}`}>
                <td>{formatDay(movement.date)}</td>
                <th scope="row">
                  <Link
                    className={styles.link}
                    href={`/cuentas/${encodeURIComponent(movement.entryId)}`}
                  >
                    {t('books.movements.number', { number: movement.number })} ·{' '}
                    {movement.description}
                  </Link>
                </th>
                <td className={books.amount}>
                  {movement.debitCents ? formatEuros(movement.debitCents) : ''}
                </td>
                <td className={books.amount}>
                  {movement.creditCents ? formatEuros(movement.creditCents) : ''}
                </td>
                <td className={books.amount}>{formatEuros(movement.balanceCents)}</td>
              </tr>
            ))}
            <tr className={books.totalRow}>
              <th scope="row" colSpan={4}>
                {t('books.reports.closingBalance')}
              </th>
              <td className={books.amount}>{formatEuros(found.closingCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  } else if (report.api === 'income-expenses') {
    const found = await getIncomeAndExpenses(query);
    body = isUnavailable(found) ? null : (
      <>
        <Section caption={t('books.reports.income')}>
          <GroupRows groups={found.income} />
          <Total label={t('books.reports.totalIncome')} cents={found.totalIncomeCents} />
        </Section>
        <Section caption={t('books.reports.expenses')}>
          <GroupRows groups={found.expenses} />
          <Total label={t('books.reports.totalExpenses')} cents={found.totalExpensesCents} />
        </Section>
        <Section caption={t('books.reports.result')}>
          <Total label={t('books.reports.result')} cents={found.resultCents} />
        </Section>
      </>
    );
  } else if (report.api === 'balance') {
    const found = await getBalance(query);
    body = isUnavailable(found) ? null : (
      <>
        <Section caption={t('books.reports.assets')}>
          <GroupRows groups={found.assets} />
          <Total label={t('books.reports.totalAssets')} cents={found.totalAssetsCents} />
        </Section>
        <Section caption={`${t('books.reports.equity')} · ${t('books.reports.liabilities')}`}>
          <GroupRows groups={found.equity} />
          <tr>
            <th scope="row">{t('books.reports.resultLine')}</th>
            <td className={books.amount}>{formatEuros(found.resultCents)}</td>
          </tr>
          <GroupRows groups={found.liabilities} />
          <Total
            label={t('books.reports.totalLiabilities')}
            cents={found.totalLiabilitiesAndEquityCents}
          />
        </Section>
        {found.totalAssetsCents === found.totalLiabilitiesAndEquityCents ? null : (
          <p className={styles.notice}>{t('books.reports.notBalanced')}</p>
        )}
      </>
    );
  } else {
    const found = await getProjectReport(query);
    body = isUnavailable(found) ? null : (
      <>
        {found.project.funder ? (
          <p className={styles.text}>{t('books.reports.funder', { name: found.project.funder })}</p>
        ) : null}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{found.project.name}</caption>
            <thead>
              <tr>
                <th scope="col">{t('books.movements.date')}</th>
                <th scope="col">{t('books.movements.concept')}</th>
                <th scope="col" className={books.amount}>
                  {t('books.reports.income')}
                </th>
                <th scope="col" className={books.amount}>
                  {t('books.reports.expenses')}
                </th>
                <th scope="col" className={styles.wideColumn}>
                  {t('books.reports.receiptsColumn')}
                </th>
              </tr>
            </thead>
            <tbody>
              {found.movements.map((movement, index) => (
                <tr key={`${movement.entryId}-${String(index)}`}>
                  <td>{formatDay(movement.date)}</td>
                  <th scope="row">
                    <Link
                      className={styles.link}
                      href={`/cuentas/${encodeURIComponent(movement.entryId)}`}
                    >
                      {movement.description}
                    </Link>
                    <span className={styles.block}>
                      {movement.code} · {movement.name}
                    </span>
                  </th>
                  <td className={books.amount}>
                    {movement.incomeCents ? formatEuros(movement.incomeCents) : ''}
                  </td>
                  <td className={books.amount}>
                    {movement.expenseCents ? formatEuros(movement.expenseCents) : ''}
                  </td>
                  <td className={styles.wideColumn}>{movement.receipts.join(', ')}</td>
                </tr>
              ))}
              <tr className={books.totalRow}>
                <th scope="row" colSpan={2}>
                  {t('books.reports.result')}
                </th>
                <td className={books.amount}>{formatEuros(found.totalIncomeCents)}</td>
                <td className={books.amount}>{formatEuros(found.totalExpensesCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('books.reports.title')}</h1>
      <p className={styles.text}>{t('books.reports.intro')}</p>
      <p>
        <Link className={styles.link} href={`/cuentas/presupuesto?ejercicio=${year}`}>
          {t('books.reports.budgetLink')}
        </Link>
      </p>
      <p className={styles.hint}>{t('books.reports.review')}</p>
      <form method="get" action="/cuentas/informes" className={onboarding.filters}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="informe">
            {t('books.reports.report')}
          </label>
          <select
            id="informe"
            name="informe"
            className={onboarding.select}
            defaultValue={report.slug}
          >
            {REPORTS.map((each) => (
              <option key={each.slug} value={each.slug}>
                {t(`books.reports.${each.label}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ejercicio">
            {t('books.reports.year')}
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
        <div className={styles.field}>
          <label className={styles.label} htmlFor="desde">
            {t('books.reports.from')}
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            className={styles.input}
            defaultValue={query.from ?? ''}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="hasta">
            {t('books.reports.to')}
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            className={styles.input}
            defaultValue={query.to ?? ''}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cuenta">
            {t('books.reports.account')}
          </label>
          <select
            id="cuenta"
            name="cuenta"
            className={onboarding.select}
            defaultValue={account ?? ''}
          >
            <option value="">{t('books.reports.chooseAccount')}</option>
            {accounts.map((each) => (
              <option key={each.id} value={each.id}>
                {each.code} · {each.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="proyecto">
            {t('books.reports.projectField')}
          </label>
          <select
            id="proyecto"
            name="proyecto"
            className={onboarding.select}
            defaultValue={project ?? ''}
          >
            <option value="">{t('books.reports.chooseProject')}</option>
            {projects.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.rowActions} data-wide="">
          <button type="submit" className={styles.button}>
            {t('books.reports.show')}
          </button>
        </div>
      </form>
      <h2 className={styles.h2}>
        {t(`books.reports.${report.label}`)} · {year}
      </h2>
      {body ?? <p className={styles.notice}>{t('web.unavailable.body')}</p>}
      {needs ? null : (
        <p>
          <a
            className={styles.secondaryButton}
            aria-describedby="exportar-pista"
            {...riskyDownload(
              me.recentSecondFactor,
              `/api/accounting/exports/${report.api}.csv${reportQuery(query)}`,
              back,
            )}
          >
            {t('books.reports.export')}
          </a>
          <span id="exportar-pista" className={`${styles.hint} ${styles.block}`}>
            {t('books.reports.exportHint')}
          </span>
        </p>
      )}
    </AppShell>
  );
};

export default ReportsPage;
