import type { Metadata } from 'next';

import { formatDay } from '@backoffice/domain/days';
import { formatEuros } from '@backoffice/domain/money';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import { getEntry, getYears } from '@/accounting/data';
import { EntryActions } from '@/accounting/EntryActions';
import { Receipts } from '@/accounting/Receipts';
import * as books from '@/accounting/styles';
import { bookErrors, canKeepBooks, canReadBooks, kindNames, statusNames } from '@/accounting/text';
import { isUnavailable } from '@/data';
import { formatInstant } from '@/onboarding/format';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('books.movements.title') };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * An entry (accounting spec §1, §2): its date, concept, counterparty, project and lines, who wrote and posted it, the
 * entry it corrects or that corrects it, and its receipts. Tesorería posts, edits or deletes a draft, corrects a
 * posted entry, and attaches receipts while its year is open.
 */
const EntryPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const me = await requireStaff();
  if (!canReadBooks(me)) {
    return (
      <AppShell me={me}>
        <BooksOnly />
      </AppShell>
    );
  }
  const { id } = await params;
  if (!UUID.test(id)) {
    notFound();
  }
  const [entry, years] = await Promise.all([getEntry(id), getYears()]);
  if (isUnavailable(entry) || isUnavailable(years)) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const kinds = kindNames(t);
  const statuses = statusNames(t);
  const keeper = canKeepBooks(me);
  const open = years.find((year) => year.year === entry.fiscalYear)?.status === 'open';
  const draft = entry.status === 'draft';
  const debits = entry.lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credits = entry.lines.reduce((sum, line) => sum + line.creditCents, 0);
  const errors = bookErrors(t);
  const confirmText = (prefix: 'delete' | 'correct' | 'remove', done: string) => ({
    question: t(`books.entry.${prefix}Question`),
    confirm: t(`books.entry.${prefix}Confirm`),
    cancel: t('books.entry.cancel'),
    done,
    errors,
  });

  return (
    <AppShell me={me}>
      <p>
        <Link className={styles.link} href={`/cuentas?ejercicio=${entry.fiscalYear}`}>
          {t('books.entry.back')}
        </Link>
      </p>
      <h1 className={styles.h1}>
        {entry.number === null
          ? `${t('books.entry.draftTitle')}: ${entry.description}`
          : t('books.entry.title', { number: entry.number, year: entry.fiscalYear })}
      </h1>
      <dl className={styles.facts}>
        <dt>{t('books.entry.concept')}</dt>
        <dd>{entry.description}</dd>
        <dt>{t('books.entry.date')}</dt>
        <dd>{formatDay(entry.date)}</dd>
        <dt>{t('books.entry.kind')}</dt>
        <dd>{kinds[entry.kind]}</dd>
        <dt>{t('books.entry.status')}</dt>
        <dd>{statuses[entry.status]}</dd>
        {entry.counterparty ? (
          <>
            <dt>{t('books.entry.counterparty')}</dt>
            <dd>{entry.counterparty.name}</dd>
          </>
        ) : null}
        {entry.project ? (
          <>
            <dt>{t('books.entry.project')}</dt>
            <dd>{entry.project.name}</dd>
          </>
        ) : null}
      </dl>
      <p className={styles.muted}>
        {entry.createdBy ? t('books.entry.createdBy', { name: entry.createdBy }) : null}
        {entry.postedBy && entry.postedAt
          ? ` · ${t('books.entry.postedBy', { name: entry.postedBy, date: formatInstant(entry.postedAt) })}`
          : null}
      </p>
      {entry.reverses ? (
        <p>
          <Link className={styles.link} href={`/cuentas/${encodeURIComponent(entry.reverses)}`}>
            {t('books.entry.toOriginal')}
          </Link>
        </p>
      ) : null}
      {entry.reversedBy ? (
        <p>
          {t('books.entry.reversedBy')}:{' '}
          <Link className={styles.link} href={`/cuentas/${encodeURIComponent(entry.reversedBy)}`}>
            {t('books.entry.toReversal')}
          </Link>
        </p>
      ) : null}
      {entry.bankLines.length > 0 ? (
        <section aria-labelledby="en-el-banco">
          <h2 id="en-el-banco" className={styles.h2}>
            {t('books.entry.bankLines')}
          </h2>
          <ul className={styles.linkList}>
            {entry.bankLines.map((line) => (
              <li key={line.id}>
                {t('books.entry.bankLine', {
                  date: formatDay(line.bookedOn),
                  amount: formatEuros(line.amountCents),
                })}{' '}
                <Link
                  className={styles.link}
                  href={`/cuentas/banco?cuenta=${encodeURIComponent(line.accountId)}&ejercicio=${line.bookedOn.slice(0, 4)}&estado=all`}
                >
                  {t('books.entry.toBank')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <h2 className={styles.h2}>{t('books.entry.lines')}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t('books.entry.account')}</th>
              <th scope="col" className={books.amount}>
                {t('books.entry.debit')}
              </th>
              <th scope="col" className={books.amount}>
                {t('books.entry.credit')}
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id}>
                <th scope="row">
                  <span className={books.code}>{line.code}</span> · {line.name}
                </th>
                <td className={books.amount}>
                  {line.debitCents > 0 ? formatEuros(line.debitCents) : ''}
                </td>
                <td className={books.amount}>
                  {line.creditCents > 0 ? formatEuros(line.creditCents) : ''}
                </td>
              </tr>
            ))}
            <tr className={books.totalRow}>
              <th scope="row">{t('books.entry.total')}</th>
              <td className={books.amount}>{formatEuros(debits)}</td>
              <td className={books.amount}>{formatEuros(credits)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {keeper && open ? (
        <EntryActions
          entryId={entry.id}
          draft={draft}
          reversible={
            !draft &&
            entry.reversedBy === null &&
            (entry.kind === 'income' ||
              entry.kind === 'expense' ||
              entry.kind === 'transfer' ||
              entry.kind === 'manual')
          }
          text={{
            post: t('books.entry.post'),
            posted: t('books.entry.postedDone'),
            edit: t('books.entry.edit'),
            delete: t('books.entry.delete'),
            deleteText: confirmText('delete', t('books.entry.deleted')),
            correct: t('books.entry.correct'),
            correctHint: t('books.entry.correctHint'),
            correctText: confirmText('correct', t('books.entry.corrected')),
            errors,
          }}
        />
      ) : keeper && !open ? (
        <p className={styles.notice}>{t('books.entry.closedYear')}</p>
      ) : null}
      <Receipts
        entryId={entry.id}
        receipts={entry.receiptList}
        canAttach={keeper && open}
        canRemove={keeper && open && draft}
        text={{
          title: t('books.entry.receipts'),
          none: t('books.entry.noReceipts'),
          download: String(t.raw('books.entry.download')),
          remove: t('books.entry.remove'),
          removeText: confirmText('remove', t('books.entry.removed')),
          attach: t('books.entry.attach'),
          attachHint: t('books.entry.attachHint'),
          attachButton: t('books.entry.attachButton'),
          attached: t('books.entry.attached'),
          chooseFile: t('books.entry.chooseFile'),
          tooLarge: t('books.entry.tooLarge'),
          errors,
        }}
      />
    </AppShell>
  );
};

export default EntryPage;
