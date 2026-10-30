import type { Metadata } from 'next';

import { formatDay, madridToday } from '@backoffice/domain/days';
import { formatEuros } from '@backoffice/domain/money';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import { getAccounts, getEntries, getProjects, getYears } from '@/accounting/data';
import * as books from '@/accounting/styles';
import { canKeepBooks, canReadBooks, kindNames, statusNames } from '@/accounting/text';
import { isUnavailable } from '@/data';
import * as onboarding from '@/onboarding/styles';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.movements.title') };

const one = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Movimientos (accounting spec §2): a year's entries, drafts first, then posted by number, newest first, each with its
 * amount, state and receipts; filtered by state, account or project, or searched in the concept and the counterparty.
 */
const MovementsPage = async ({
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
  const status = one(params.estado);
  const filters = {
    status: status === 'draft' || status === 'posted' ? status : undefined,
    account: one(params.cuenta) || undefined,
    project: one(params.proyecto) || undefined,
    q: one(params.buscar) || undefined,
  } as const;
  const [entries, accounts, projects] = await Promise.all([
    year === undefined ? Promise.resolve([]) : getEntries({ year, ...filters }),
    getAccounts(),
    getProjects(),
  ]);
  const kinds = kindNames(t);
  const statuses = statusNames(t);
  const filtered = Object.values(filters).some((value) => value !== undefined);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('books.movements.title')}</h1>
      <p className={styles.text}>{t('books.movements.intro')}</p>
      {canKeepBooks(me) ? (
        <p>
          <Link className={styles.button} href="/cuentas/nuevo">
            {t('books.movements.new')}
          </Link>
        </p>
      ) : null}
      {year === undefined ? (
        <p className={styles.notice}>{t('books.movements.noYears')}</p>
      ) : (
        <>
          <form method="get" action="/cuentas" className={onboarding.filters} role="search">
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ejercicio">
                {t('books.movements.year')}
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
              <label className={styles.label} htmlFor="estado">
                {t('books.movements.status')}
              </label>
              <select
                id="estado"
                name="estado"
                className={onboarding.select}
                defaultValue={filters.status ?? ''}
              >
                <option value="">{t('books.movements.anyStatus')}</option>
                <option value="draft">{statuses.draft}</option>
                <option value="posted">{statuses.posted}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cuenta">
                {t('books.movements.account')}
              </label>
              <select
                id="cuenta"
                name="cuenta"
                className={onboarding.select}
                defaultValue={filters.account ?? ''}
              >
                <option value="">{t('books.movements.anyAccount')}</option>
                {isUnavailable(accounts)
                  ? null
                  : accounts
                      .filter((account) => account.used)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="proyecto">
                {t('books.movements.project')}
              </label>
              <select
                id="proyecto"
                name="proyecto"
                className={onboarding.select}
                defaultValue={filters.project ?? ''}
              >
                <option value="">{t('books.movements.anyProject')}</option>
                {isUnavailable(projects)
                  ? null
                  : projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="buscar">
                {t('books.movements.search')}
              </label>
              <input
                id="buscar"
                className={styles.input}
                type="search"
                name="buscar"
                defaultValue={filters.q}
                maxLength={200}
                aria-describedby="buscar-pista"
              />
              <span id="buscar-pista" className={styles.hint}>
                {t('books.movements.searchHint')}
              </span>
            </div>
            <div className={styles.rowActions} data-wide="">
              <button type="submit" className={styles.button}>
                {t('books.movements.apply')}
              </button>
              {filtered ? (
                <Link className={styles.secondaryButton} href={`/cuentas?ejercicio=${year}`}>
                  {t('books.movements.clear')}
                </Link>
              ) : null}
            </div>
          </form>
          {isUnavailable(entries) ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : entries.length === 0 ? (
            <p className={styles.text}>{t('books.movements.none')}</p>
          ) : (
            <div className={styles.tableWrap}>
              {entries.length >= 1000 ? (
                <p className={styles.notice}>{t('books.movements.limit')}</p>
              ) : null}
              <table className={styles.table}>
                <caption className={styles.srOnly}>{t('books.movements.listLabel')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('books.movements.date')}</th>
                    <th scope="col">{t('books.movements.concept')}</th>
                    <th scope="col" className={styles.wideColumn}>
                      {t('books.movements.kind')}
                    </th>
                    <th scope="col" className={books.amount}>
                      {t('books.movements.amount')}
                    </th>
                    <th scope="col" className={styles.wideColumn}>
                      {t('books.movements.status')}
                    </th>
                    <th scope="col" className={styles.wideColumn}>
                      {t('books.movements.receipts')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDay(entry.date)}</td>
                      <th scope="row">
                        <Link
                          className={styles.link}
                          href={`/cuentas/${encodeURIComponent(entry.id)}`}
                        >
                          {entry.number === null
                            ? entry.description
                            : `${t('books.movements.number', { number: entry.number })} · ${entry.description}`}
                        </Link>
                        {entry.counterparty ? (
                          <span className={styles.block}>{entry.counterparty.name}</span>
                        ) : null}
                        <span className={styles.narrowOnly}>
                          {kinds[entry.kind]} · {statuses[entry.status]}
                        </span>
                      </th>
                      <td className={styles.wideColumn}>{kinds[entry.kind]}</td>
                      <td className={books.amount}>{formatEuros(entry.amountCents)}</td>
                      <td className={styles.wideColumn}>
                        {statuses[entry.status]}
                        {entry.reversedBy ? ` · ${t('books.movements.reversed')}` : ''}
                      </td>
                      <td className={styles.wideColumn}>{entry.receipts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
};

export default MovementsPage;
