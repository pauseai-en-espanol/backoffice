import type { Metadata } from 'next';

import { formatDay, madridToday } from '@backoffice/domain/days';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import { getYears } from '@/accounting/data';
import { canKeepBooks, canReadBooks, yearErrors } from '@/accounting/text';
import { CloseYear, OpenYear } from '@/accounting/YearActions';
import { isUnavailable } from '@/data';
import { formatInstantDay } from '@/onboarding/format';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.years.title') };

/**
 * Ejercicios (accounting spec §1, §3): each calendar year, open or closed, how many drafts and posted entries it has;
 * tesorería opens the next one, and closes a year once the assembly has approved its accounts, which posts its closing
 * entry and the next year's opening entry.
 */
const YearsPage = async () => {
  const me = await requireStaff();
  if (!canReadBooks(me)) {
    return (
      <AppShell me={me}>
        <BooksOnly />
      </AppShell>
    );
  }
  const years = await getYears();
  if (isUnavailable(years)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const keeper = canKeepBooks(me);
  const today = madridToday();
  const thisYear = Number(today.slice(0, 4));
  const next = years.length === 0 ? thisYear : Math.max(...years.map((year) => year.year)) + 1;
  const errors = yearErrors(t);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('books.years.title')}</h1>
      <p className={styles.text}>{t('books.years.intro')}</p>
      {keeper ? null : <p className={styles.hint}>{t('books.years.readOnly')}</p>}
      {keeper && next <= thisYear + 1 ? (
        <OpenYear
          year={next}
          text={{
            label: t('books.years.openYear', { year: next }),
            hint: t('books.years.openHint'),
            done: t('books.years.opened'),
            errors,
          }}
        />
      ) : null}
      {years.length === 0 ? (
        <p className={styles.text}>{t('books.years.none')}</p>
      ) : (
        <ul className={styles.cardList}>
          {years.map((year) => (
            <li key={year.year} className={styles.card}>
              <h2 className={styles.h2}>
                <Link className={styles.link} href={`/cuentas?ejercicio=${year.year}`}>
                  {year.year}
                </Link>{' '}
                · {year.status === 'open' ? t('books.years.open') : t('books.years.closed')}
              </h2>
              <p className={styles.text}>
                {t('books.years.posted', { count: year.posted })} ·{' '}
                {t('books.years.drafts', { count: year.drafts })}
              </p>
              <p>
                <Link className={styles.link} href={`/cuentas/presupuesto?ejercicio=${year.year}`}>
                  {t('books.years.budgetLink', { year: year.year })}
                </Link>
              </p>
              {year.status === 'closed' && year.closedAt && year.assemblyOn ? (
                <p className={styles.text}>
                  {t('books.years.closedOn', {
                    name: year.closedBy ?? '—',
                    date: formatInstantDay(year.closedAt),
                    assembly: formatDay(year.assemblyOn),
                  })}
                </p>
              ) : null}
              {keeper && year.status === 'open' && year.year < thisYear ? (
                <CloseYear
                  year={year.year}
                  today={today}
                  text={{
                    title: t('books.years.closeTitle', { year: year.year }),
                    assemblyOn: t('books.years.assemblyOn'),
                    close: t('books.years.close'),
                    hint: t('books.years.closeHint', { year: year.year }),
                    done: t('books.years.closedDone'),
                    errors,
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
};

export default YearsPage;
