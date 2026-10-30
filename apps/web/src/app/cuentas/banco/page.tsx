import type { Metadata } from 'next';

import { formatIban } from '@backoffice/domain/accounting';
import { formatDay, madridToday } from '@backoffice/domain/days';
import { formatEuros } from '@backoffice/domain/money';
import { getTranslator, messages } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { BankLineActions, type BankLineText, UndoImport } from '@/accounting/BankActions';
import { BankImport } from '@/accounting/BankImport';
import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import { getBank, getYears } from '@/accounting/data';
import * as books from '@/accounting/styles';
import { bankErrors, canKeepBooks, canReadBooks } from '@/accounting/text';
import { type BankLine, LINE_STATES, type LineState } from '@/accounting/types';
import { isUnavailable } from '@/data';
import { formatInstantDay } from '@/onboarding/format';
import * as onboarding from '@/onboarding/styles';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.bank.title') };

const one = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

/** A message with its `{placeholders}`, for a client component to fill in. */
const raw = (key: Parameters<typeof t.raw>[0]): string => String(t.raw(key));

/** What a line says: the bank's text, or its common concept's name when it wrote none, and its references. */
const conceptOf = (line: BankLine): string =>
  line.description ||
  (messages.es.books.bank.concepts as Record<string, string>)[line.commonConcept] ||
  line.reference;

/**
 * Banco (accounting spec §6a): a treasury account's imported statements, its lines in a year (waiting for their
 * entry first, by default), and what the bank and the books say it held on the last statement's last day. Tesorería
 * imports a Norma 43 file (reviewed first, R17) and matches each line; admins read.
 */
const BankPage = async ({
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
  const thisYear = Number(madridToday().slice(0, 4));
  const asked = Number(one(params.ejercicio));
  const state = (LINE_STATES as readonly string[]).includes(one(params.estado))
    ? (one(params.estado) as LineState)
    : 'pending';
  const [bank, years] = await Promise.all([
    getBank({
      account: one(params.cuenta) || undefined,
      year: Number.isInteger(asked) && asked >= 2000 && asked <= 2999 ? asked : thisYear,
      state,
    }),
    getYears(),
  ]);
  if (isUnavailable(bank) || isUnavailable(years)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const keeper = canKeepBooks(me);
  const account = bank.accounts.find((each) => each.id === bank.account);
  const reconciliation = bank.reconciliation;
  const yearChoices = [...new Set([thisYear, bank.year, ...years.map((each) => each.year)])].sort(
    (a, b) => b - a,
  );
  const errors = bankErrors(t);
  const lineText: BankLineText = {
    matchWith: raw('books.bank.matchWith'),
    matchWithHint: raw('books.bank.matchWithHint'),
    record: t('books.bank.record'),
    recordLabel: raw('books.bank.recordLabel'),
    unmatchLabel: raw('books.bank.unmatchLabel'),
    byNumber: t('books.bank.byNumber'),
    byNumberLabel: t('books.bank.byNumberLabel'),
    byNumberYear: t('books.bank.byNumberYear'),
    byNumberButton: t('books.bank.byNumberButton'),
    byNumberMissing: t('books.bank.byNumberMissing'),
    matched: t('books.bank.matched'),
    unmatch: t('books.bank.unmatch'),
    unmatchText: {
      question: t('books.bank.unmatchQuestion'),
      confirm: t('books.bank.unmatchConfirm'),
      cancel: t('books.entry.cancel'),
      done: t('books.bank.unmatched'),
      errors,
    },
    errors,
  };

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('books.bank.title')}</h1>
      <p className={styles.text}>{t('books.bank.intro')}</p>
      {keeper ? null : <p className={styles.hint}>{t('books.bank.readOnly')}</p>}
      {!account ? (
        <p className={styles.notice}>{t('books.bank.noAccounts')}</p>
      ) : (
        <>
          <form method="get" action="/cuentas/banco" className={onboarding.filters}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="cuenta">
                {t('books.bank.account')}
              </label>
              <select
                id="cuenta"
                name="cuenta"
                className={onboarding.select}
                defaultValue={account.id}
              >
                {bank.accounts.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.code} · {each.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ejercicio">
                {t('books.bank.year')}
              </label>
              <select
                id="ejercicio"
                name="ejercicio"
                className={onboarding.select}
                defaultValue={String(bank.year)}
              >
                {yearChoices.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="estado">
                {t('books.bank.state')}
              </label>
              <select
                id="estado"
                name="estado"
                className={onboarding.select}
                defaultValue={bank.state}
              >
                {LINE_STATES.map((each) => (
                  <option key={each} value={each}>
                    {t(`books.bank.states.${each}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.rowActions} data-wide="">
              <button type="submit" className={styles.button}>
                {t('books.bank.apply')}
              </button>
            </div>
          </form>

          <section aria-labelledby="banco-y-libros" className={styles.card}>
            <h2 id="banco-y-libros" className={styles.h3}>
              {t('books.bank.summaryTitle')}
            </h2>
            {account.iban ? (
              <p className={styles.text}>{formatIban(account.iban)}</p>
            ) : (
              <p className={styles.notice}>{t('books.bank.noIban')}</p>
            )}
            {reconciliation?.asOf && reconciliation.bankCents !== null ? (
              <>
                <p className={styles.text}>
                  {t('books.bank.asOf', { date: formatDay(reconciliation.asOf) })}
                </p>
                <dl className={styles.facts}>
                  <dt>{t('books.bank.bankSays')}</dt>
                  <dd className={books.amount}>{formatEuros(reconciliation.bankCents)}</dd>
                  <dt>{t('books.bank.booksSay')}</dt>
                  <dd className={books.amount}>{formatEuros(reconciliation.booksCents ?? 0)}</dd>
                </dl>
                <p className={styles.text}>
                  <strong>
                    {reconciliation.bankCents === reconciliation.booksCents
                      ? t('books.bank.agree')
                      : t('books.bank.differ', {
                          amount: formatEuros(
                            Math.abs(reconciliation.bankCents - (reconciliation.booksCents ?? 0)),
                          ),
                        })}
                  </strong>
                </p>
              </>
            ) : (
              <p className={styles.text}>{t('books.bank.noStatements')}</p>
            )}
            <p className={styles.text}>
              {t('books.bank.pendingLines', { count: reconciliation?.pendingLines ?? 0 })}
            </p>
            {reconciliation && reconciliation.unmatchedEntries.length > 0 ? (
              <details>
                <summary>
                  {t('books.bank.unmatchedEntries', {
                    count: reconciliation.unmatchedEntries.length,
                  })}
                </summary>
                <p className={styles.hint}>{t('books.bank.unmatchedHint')}</p>
                <ul className={styles.linkList}>
                  {reconciliation.unmatchedEntries.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        className={styles.link}
                        href={`/cuentas/${encodeURIComponent(entry.id)}`}
                      >
                        {t('books.bank.matchedTo', { number: entry.number ?? 0, year: entry.year })}
                      </Link>{' '}
                      · {formatDay(entry.date)} · {entry.description}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          {keeper && account.iban ? (
            <BankImport
              text={{
                title: t('books.bank.importTitle'),
                file: t('books.bank.importFile'),
                hint: t('books.bank.importHint'),
                review: t('books.bank.review'),
                reviewTitle: t('books.bank.reviewTitle'),
                import: t('books.bank.import'),
                imported: t('books.bank.imported'),
                chooseFile: t('books.bank.chooseFile'),
                tooLarge: t('books.bank.tooLarge'),
                statementOf: raw('books.bank.statementOf'),
                goesTo: raw('books.bank.goesTo'),
                unknownAccount: t('books.bank.unknownAccount'),
                period: raw('books.bank.period'),
                balances: raw('books.bank.balances'),
                counts: raw('books.bank.counts'),
                closedYearCount: raw('books.bank.closedYearCount'),
                nothingNew: t('books.bank.nothingNew'),
                previewLabel: t('books.bank.previewLabel'),
                date: t('books.bank.date'),
                concept: t('books.bank.concept'),
                amount: t('books.bank.amount'),
                concepts: messages.es.books.bank.concepts,
                norma43: messages.es.books.bank.norma43,
                errors,
              }}
            />
          ) : null}

          <section aria-labelledby="movimientos-banco">
            <h2 id="movimientos-banco" className={styles.h2}>
              {t('books.bank.listLabel')} · {t(`books.bank.states.${bank.state}`)} · {bank.year}
            </h2>
            {bank.lines.length === 0 ? (
              <p className={styles.text}>{t('books.bank.none')}</p>
            ) : (
              <div className={styles.tableWrap}>
                {bank.lines.length >= 1000 ? (
                  <p className={styles.notice}>{t('books.bank.limit')}</p>
                ) : null}
                <table className={styles.table}>
                  <caption className={styles.srOnly}>{t('books.bank.listLabel')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('books.bank.date')}</th>
                      <th scope="col">{t('books.bank.concept')}</th>
                      <th scope="col" className={books.amount}>
                        {t('books.bank.amount')}
                      </th>
                      <th scope="col">{t('books.bank.match')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bank.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{formatDay(line.bookedOn)}</td>
                        <th scope="row" className={styles.breakAnywhere}>
                          {conceptOf(line)}
                          {line.description && line.reference ? (
                            <span className={`${styles.block} ${styles.hint}`}>
                              {line.reference}
                            </span>
                          ) : null}
                        </th>
                        <td className={books.amount}>{formatEuros(line.amountCents)}</td>
                        <td>
                          {line.entry ? (
                            <p>
                              <Link
                                className={styles.link}
                                href={`/cuentas/${encodeURIComponent(line.entry.id)}`}
                              >
                                {t('books.bank.matchedTo', {
                                  number: line.entry.number ?? 0,
                                  year: line.entry.year,
                                })}
                              </Link>
                              {line.entry.corrected ? (
                                <span className={styles.block}>{t('books.bank.corrected')}</span>
                              ) : null}
                            </p>
                          ) : (
                            <p>{t('books.bank.waiting')}</p>
                          )}
                          {keeper ? <BankLineActions line={line} text={lineText} /> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {bank.statements.length > 0 ? (
            <section aria-labelledby="extractos">
              <h2 id="extractos" className={styles.h2}>
                {t('books.bank.statementsTitle')}
              </h2>
              <ul className={styles.cardList}>
                {bank.statements.map((statement) => (
                  <li key={statement.id} className={styles.card}>
                    <p className={styles.text}>
                      {t('books.bank.statementRow', {
                        from: formatDay(statement.startsOn),
                        to: formatDay(statement.endsOn),
                        lines: statement.lines,
                        matched: statement.matched,
                        closing: formatEuros(statement.closingCents),
                      })}{' '}
                      {t('books.bank.importedBy', {
                        name: statement.importedBy ?? '—',
                        date: formatInstantDay(statement.importedAt),
                      })}
                    </p>
                    {keeper && statement.matched === 0 ? (
                      <UndoImport
                        statementId={statement.id}
                        short={t('books.bank.undoImport')}
                        label={`${t('books.bank.undoImport')}: ${t('books.bank.period', {
                          from: formatDay(statement.startsOn),
                          to: formatDay(statement.endsOn),
                        })}`}
                        text={{
                          question: t('books.bank.undoQuestion'),
                          confirm: t('books.bank.undoConfirm'),
                          cancel: t('books.entry.cancel'),
                          done: t('books.bank.undone'),
                          errors,
                        }}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
};

export default BankPage;
