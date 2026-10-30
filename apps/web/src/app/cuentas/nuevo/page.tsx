import type { Metadata } from 'next';

import { madridToday } from '@backoffice/domain/days';
import { formatEurosPlain } from '@backoffice/domain/money';
import { getTranslator, messages } from '@backoffice/i18n/messages';

import { BooksOnly, BooksUnavailable } from '@/accounting/BooksOnly';
import {
  getAccounts,
  getBankLine,
  getCounterparties,
  getEntry,
  getProjects,
} from '@/accounting/data';
import {
  type EntryChoices,
  EntryForm,
  type EntryFormText,
  type EntryStart,
} from '@/accounting/EntryForm';
import { bookErrors, canKeepBooks, canReadBooks } from '@/accounting/text';
import {
  type BankLineDetail,
  type EntryDetail,
  FORM_KINDS,
  type FormKind,
  type LedgerAccount,
} from '@/accounting/types';
import { isUnavailable } from '@/data';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.nav.newMovement') };

const one = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value : '';

const choice = (account: LedgerAccount) => ({
  id: account.id,
  code: account.code,
  name: account.name,
});

/** The accounts each field offers: active, without sub-accounts, of the field's kind. */
const choicesOf = (
  accounts: readonly LedgerAccount[],
  counterparties: EntryChoices['counterparties'],
  projects: EntryChoices['projects'],
): EntryChoices => {
  const postable = accounts.filter((account) => account.active && !account.group);
  return {
    treasury: postable.filter((account) => account.treasury).map(choice),
    income: postable.filter((account) => account.kind === 'income').map(choice),
    expense: postable.filter((account) => account.kind === 'expense').map(choice),
    all: postable.map(choice),
    counterparties,
    projects,
  };
};

const amountOf = (cents: number) => formatEurosPlain(cents);

/** What a form starts with from an entry: a draft as it is, or a corrected entry's values dated today. */
const startOf = (entry: EntryDetail, date: string): EntryStart => {
  const kind: FormKind = (FORM_KINDS as readonly string[]).includes(entry.kind)
    ? (entry.kind as FormKind)
    : 'manual';
  const debit = entry.lines.find((line) => line.debitCents > 0);
  const credit = entry.lines.find((line) => line.creditCents > 0);
  return {
    kind,
    date,
    description: entry.description,
    amount: amountOf(entry.amountCents),
    treasuryAccountId: (kind === 'income' ? debit : credit)?.accountId ?? '',
    accountId: (kind === 'income' ? credit : debit)?.accountId ?? '',
    fromAccountId: credit?.accountId ?? '',
    toAccountId: debit?.accountId ?? '',
    lines: entry.lines.map((line) => ({
      accountId: line.accountId,
      ...(line.debitCents > 0 ? { debit: amountOf(line.debitCents) } : {}),
      ...(line.creditCents > 0 ? { credit: amountOf(line.creditCents) } : {}),
    })),
    counterpartyId: entry.counterparty?.id ?? '',
    projectId: entry.project?.id ?? '',
  };
};

/**
 * What a form starts with from a bank line (Banco's "Anotar"): money in an income, money out an expense, its day,
 * amount and account, and the bank's text as the concept (or its common concept's name); a transfer starts from it too.
 */
const startOfLine = (line: BankLineDetail): EntryStart => {
  const income = line.amountCents > 0;
  return {
    kind: income ? 'income' : 'expense',
    date: line.bookedOn,
    description: (
      line.description ||
      (messages.es.books.bank.concepts as Record<string, string>)[line.commonConcept] ||
      line.reference
    ).slice(0, 500),
    amount: amountOf(Math.abs(line.amountCents)),
    treasuryAccountId: line.accountId,
    accountId: '',
    fromAccountId: income ? '' : line.accountId,
    toAccountId: income ? line.accountId : '',
    lines: [],
    counterpartyId: '',
    projectId: '',
  };
};

/**
 * Nuevo movimiento (accounting spec §2): Ingreso, Gasto, Traspaso or Asiento manual, for tesorería. Also a draft
 * written again (`?borrador=<id>`); after Corregir, a new entry with the corrected one's values (`?desde=<id>`); and
 * from Banco, the entry that records a bank line (`?extracto=<id>`), matched to it once posted. Only ids travel in the
 * address: what the bank wrote may name someone, and is read from the API.
 */
const NewMovementPage = async ({
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
  if (!canKeepBooks(me)) {
    return (
      <AppShell me={me}>
        <h1 className={styles.h1}>{t('web.nav.newMovement')}</h1>
        <p className={styles.text}>{t('books.form.readOnly')}</p>
      </AppShell>
    );
  }
  const params = await searchParams;
  const draftId = one(params.borrador);
  const fromId = one(params.desde);
  const lineId = one(params.extracto);
  const today = madridToday();
  const [accounts, counterparties, projects, entry, line] = await Promise.all([
    getAccounts(),
    getCounterparties(),
    getProjects(),
    draftId || fromId ? getEntry(draftId || fromId) : Promise.resolve(undefined),
    lineId ? getBankLine(lineId) : Promise.resolve(undefined),
  ]);
  if (
    isUnavailable(accounts) ||
    isUnavailable(counterparties) ||
    isUnavailable(projects) ||
    isUnavailable(entry)
  ) {
    return (
      <AppShell me={me}>
        <BooksUnavailable />
      </AppShell>
    );
  }
  const editing = draftId !== '' && entry?.status === 'draft' ? entry : undefined;
  const correcting = fromId !== '' && entry ? entry : undefined;
  // A line not found reads as unavailable, as when the API is down; then the reads above would have failed too.
  const recording = line && !isUnavailable(line) && line.pending ? line : undefined;
  const start = editing
    ? startOf(editing, editing.date)
    : correcting
      ? startOf(correcting, today)
      : recording
        ? startOfLine(recording)
        : undefined;
  const text: EntryFormText = {
    kind: t('books.form.kind'),
    kinds: {
      income: t('books.kinds.income'),
      expense: t('books.kinds.expense'),
      transfer: t('books.kinds.transfer'),
      manual: t('books.kinds.manual'),
    },
    date: t('books.form.date'),
    amount: t('books.form.amount'),
    amountHint: t('books.form.amountHint'),
    treasury: t('books.form.treasury'),
    incomeAccount: t('books.form.incomeAccount'),
    expenseAccount: t('books.form.expenseAccount'),
    from: t('books.form.from'),
    to: t('books.form.to'),
    counterparty: t('books.form.counterparty'),
    counterpartyHint: t('books.form.counterpartyHint'),
    noCounterparty: t('books.form.noCounterparty'),
    project: t('books.form.project'),
    noProject: t('books.form.noProject'),
    choose: t('books.form.choose'),
    description: t('books.form.description'),
    descriptionHint: t('books.form.descriptionHint'),
    lines: t('books.form.lines'),
    line: String(t.raw('books.form.line')),
    lineAccount: t('books.form.lineAccount'),
    lineDebit: t('books.form.lineDebit'),
    lineCredit: t('books.form.lineCredit'),
    addLine: t('books.form.addLine'),
    removeLine: String(t.raw('books.form.removeLine')),
    balance: String(t.raw('books.form.balance')),
    unbalancedHint: t('books.form.unbalancedHint'),
    saveDraft: t('books.form.saveDraft'),
    post: t('books.form.post'),
    save: t('books.form.save'),
    noTreasury: t('books.form.noTreasury'),
    errors: bookErrors(t),
  };

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{editing ? t('books.entry.edit') : t('web.nav.newMovement')}</h1>
      {correcting ? <p className={styles.notice}>{t('books.form.correcting')}</p> : null}
      {recording ? <p className={styles.notice}>{t('books.form.fromBank')}</p> : null}
      {lineId !== '' && !recording ? (
        <p className={styles.notice}>{t('books.form.bankLineGone')}</p>
      ) : null}
      <EntryForm
        text={text}
        choices={choicesOf(
          accounts,
          counterparties.map(({ id, name }) => ({ id, name })),
          projects
            .filter((project) => project.active || project.id === start?.projectId)
            .map(({ id, name }) => ({ id, name })),
        )}
        today={today}
        {...(start ? { start } : {})}
        {...(editing ? { entryId: editing.id } : {})}
        {...(recording
          ? {
              bankLineId: recording.id,
              after: `/cuentas/banco?cuenta=${encodeURIComponent(recording.accountId)}&ejercicio=${recording.bookedOn.slice(0, 4)}`,
            }
          : {})}
      />
    </AppShell>
  );
};

export default NewMovementPage;
