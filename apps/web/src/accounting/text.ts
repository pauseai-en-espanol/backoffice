import { type getTranslator, messages } from '@backoffice/i18n/messages';

import type { Staff } from '@/session';

import { ACCOUNT_KINDS, type AccountKind, ENTRY_KINDS, type EntryKind } from './types';

/**
 * Who sees the books (ADR-0006 decision 5): tesorería records, admins read. The pages ask so they can say it in words;
 * the API and the database refuse anyone else anyway.
 */
export const canReadBooks = (me: Staff): boolean =>
  me.staff.roles.includes('tesoreria') || me.staff.roles.includes('admin');

export const canKeepBooks = (me: Staff): boolean => me.staff.roles.includes('tesoreria');

type T = ReturnType<typeof getTranslator>;

export const kindNames = (t: T): Readonly<Record<EntryKind, string>> =>
  Object.fromEntries(ENTRY_KINDS.map((kind) => [kind, t(`books.kinds.${kind}`)])) as Record<
    EntryKind,
    string
  >;

export const accountKindNames = (t: T): Readonly<Record<AccountKind, string>> =>
  Object.fromEntries(
    ACCOUNT_KINDS.map((kind) => [kind, t(`books.accountKinds.${kind}`)]),
  ) as Record<AccountKind, string>;

export const statusNames = (t: T): Readonly<Record<'draft' | 'posted', string>> => ({
  draft: t('books.statuses.draft'),
  posted: t('books.statuses.posted'),
});

/** The refusals' words for the books' forms, by the API's code or the field it named (write.ts). */
export const bookErrors = (t: T): Readonly<Record<string, string>> => ({
  ...messages.es.books.errors,
  invalid: t('errors.invalid'),
  stale: t('books.errors.posted'),
  incomplete: t('books.errors.unbalanced'),
  limit: t('errors.limit'),
  network: t('errors.network'),
  signIn: t('errors.signIn'),
});

export const chartErrors = (t: T): Readonly<Record<string, string>> => ({
  ...messages.es.books.chart.errors,
  invalid: t('errors.invalid'),
  network: t('errors.network'),
  linked: t('books.chart.errors.inUse'),
});

export const yearErrors = (t: T): Readonly<Record<string, string>> => ({
  ...messages.es.books.years.errors,
  invalid: t('errors.invalid'),
  network: t('errors.network'),
  incomplete: t('books.years.errors.assemblyDate'),
});
