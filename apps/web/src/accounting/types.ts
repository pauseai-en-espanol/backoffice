/**
 * The books as the API answers them (apps/api/src/accounting), checked before a page renders from them: a body that
 * doesn't have the shape is no answer at all, and the page says it couldn't read it.
 */

export const ENTRY_KINDS = [
  'income',
  'expense',
  'transfer',
  'manual',
  'reversal',
  'opening',
  'closing',
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const FORM_KINDS = ['income', 'expense', 'transfer', 'manual'] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const ACCOUNT_KINDS = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export interface FiscalYear {
  year: number;
  status: 'open' | 'closed';
  assemblyOn: string | null;
  closedAt: string | null;
  closedBy: string | null;
  drafts: number;
  posted: number;
}

export interface LedgerAccount {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
  parentCode: string | null;
  treasury: boolean;
  iban: string | null;
  yearResult: boolean;
  active: boolean;
  used: boolean;
  group: boolean;
}

export interface Counterparty {
  id: string;
  kind: 'person' | 'organisation';
  name: string;
  taxId: string | null;
  province: string | null;
  iban: string | null;
  used: boolean;
}

export interface Project {
  id: string;
  name: string;
  funder: { id: string; name: string } | null;
  description: string | null;
  active: boolean;
  used: boolean;
}

export interface Named {
  id: string;
  name: string;
}

export interface EntrySummary {
  id: string;
  number: number | null;
  date: string;
  fiscalYear: number;
  description: string;
  kind: EntryKind;
  status: 'draft' | 'posted';
  amountCents: number;
  counterparty: Named | null;
  project: Named | null;
  reverses: string | null;
  reversedBy: string | null;
  receipts: number;
}

export interface EntryLine {
  id: string;
  accountId: string;
  code: string;
  name: string;
  kind: AccountKind;
  debitCents: number;
  creditCents: number;
  projectId: string | null;
}

export interface Receipt {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface EntryDetail extends EntrySummary {
  lines: EntryLine[];
  receiptList: Receipt[];
  createdBy: string | null;
  createdAt: string;
  postedBy: string | null;
  postedAt: string | null;
}

// Not @/data's: client components import this file, and that one reads the session on the server.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isNullable =
  <T>(check: (value: unknown) => value is T) =>
  (value: unknown): value is T | null =>
    value === null || check(value);
const isNullableString = isNullable(isString);
const isOneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value);
const isNamed = (value: unknown): value is Named =>
  isRecord(value) && isString(value.id) && isString(value.name);

/** A list under `key` whose every item passes `check`; undefined otherwise. */
const listOf =
  <T>(key: string, check: (value: unknown) => value is T) =>
  (body: unknown): T[] | undefined =>
    isRecord(body) && Array.isArray(body[key]) && body[key].every(check)
      ? (body[key] as T[])
      : undefined;

const isYear = (value: unknown): value is FiscalYear =>
  isRecord(value) &&
  isNumber(value.year) &&
  isOneOf(['open', 'closed'] as const)(value.status) &&
  isNullableString(value.assemblyOn) &&
  isNullableString(value.closedAt) &&
  isNullableString(value.closedBy) &&
  isNumber(value.drafts) &&
  isNumber(value.posted);

const isAccount = (value: unknown): value is LedgerAccount =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.code) &&
  isString(value.name) &&
  isOneOf(ACCOUNT_KINDS)(value.kind) &&
  isNullableString(value.parentCode) &&
  typeof value.treasury === 'boolean' &&
  isNullableString(value.iban) &&
  typeof value.yearResult === 'boolean' &&
  typeof value.active === 'boolean' &&
  typeof value.used === 'boolean' &&
  typeof value.group === 'boolean';

const isCounterparty = (value: unknown): value is Counterparty =>
  isRecord(value) &&
  isString(value.id) &&
  isOneOf(['person', 'organisation'] as const)(value.kind) &&
  isString(value.name) &&
  isNullableString(value.taxId) &&
  isNullableString(value.province) &&
  isNullableString(value.iban) &&
  typeof value.used === 'boolean';

const isProject = (value: unknown): value is Project =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isNullable(isNamed)(value.funder) &&
  isNullableString(value.description) &&
  typeof value.active === 'boolean' &&
  typeof value.used === 'boolean';

const isSummary = (value: unknown): value is EntrySummary =>
  isRecord(value) &&
  isString(value.id) &&
  isNullable(isNumber)(value.number) &&
  isString(value.date) &&
  isNumber(value.fiscalYear) &&
  isString(value.description) &&
  isOneOf(ENTRY_KINDS)(value.kind) &&
  isOneOf(['draft', 'posted'] as const)(value.status) &&
  isNumber(value.amountCents) &&
  isNullable(isNamed)(value.counterparty) &&
  isNullable(isNamed)(value.project) &&
  isNullableString(value.reverses) &&
  isNullableString(value.reversedBy) &&
  isNumber(value.receipts);

const isLine = (value: unknown): value is EntryLine =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.accountId) &&
  isString(value.code) &&
  isString(value.name) &&
  isOneOf(ACCOUNT_KINDS)(value.kind) &&
  isNumber(value.debitCents) &&
  isNumber(value.creditCents) &&
  isNullableString(value.projectId);

const isReceipt = (value: unknown): value is Receipt =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.fileName) &&
  isString(value.contentType) &&
  isNumber(value.byteSize) &&
  isString(value.createdAt);

export const parseYears = listOf('years', isYear);
export const parseAccounts = listOf('accounts', isAccount);
export const parseCounterparties = listOf('counterparties', isCounterparty);
export const parseProjects = listOf('projects', isProject);
export const parseEntries = listOf('entries', isSummary);

export const parseEntry = (body: unknown): EntryDetail | undefined => {
  const entry = isRecord(body) ? body.entry : undefined;
  return isSummary(entry) &&
    isRecord(entry) &&
    Array.isArray(entry.lines) &&
    entry.lines.every(isLine) &&
    Array.isArray(entry.receiptList) &&
    entry.receiptList.every(isReceipt) &&
    isNullableString(entry.createdBy) &&
    isString(entry.createdAt) &&
    isNullableString(entry.postedBy) &&
    isNullableString(entry.postedAt)
    ? (entry as unknown as EntryDetail)
    : undefined;
};

/** The id a create answered with (`{ id }`). */
export const createdId = (body: Record<string, unknown>): string | undefined =>
  isString(body.id) ? body.id : undefined;

// Reports ------------------------------------------------------------------------------------------------------------

export interface ReportLine {
  code: string;
  name: string;
  cents: number;
}

export interface ReportGroup extends ReportLine {
  lines: ReportLine[];
}

export interface Range {
  year: number;
  from: string;
  to: string;
}

export interface JournalEntry {
  id: string;
  number: number;
  date: string;
  description: string;
  kind: EntryKind;
  counterparty: string | null;
  lines: {
    code: string;
    name: string;
    debitCents: number;
    creditCents: number;
    project: string | null;
  }[];
}

export interface Ledger {
  account: { id: string; code: string; name: string; kind: AccountKind };
  openingCents: number;
  movements: {
    entryId: string;
    number: number;
    date: string;
    description: string;
    code: string;
    debitCents: number;
    creditCents: number;
    balanceCents: number;
  }[];
  closingCents: number;
}

export interface IncomeAndExpenses {
  income: ReportGroup[];
  expenses: ReportGroup[];
  totalIncomeCents: number;
  totalExpensesCents: number;
  resultCents: number;
}

export interface BalanceSheet {
  assets: ReportGroup[];
  liabilities: ReportGroup[];
  equity: ReportGroup[];
  resultCents: number;
  totalAssetsCents: number;
  totalLiabilitiesAndEquityCents: number;
}

export interface ProjectReport {
  project: { id: string; name: string; funder: string | null };
  movements: {
    entryId: string;
    number: number;
    date: string;
    fiscalYear: number;
    description: string;
    code: string;
    name: string;
    incomeCents: number;
    expenseCents: number;
    receipts: string[];
  }[];
  totalIncomeCents: number;
  totalExpensesCents: number;
}

const isReportLine = (value: unknown): value is ReportLine =>
  isRecord(value) && isString(value.code) && isString(value.name) && isNumber(value.cents);
const isGroup = (value: unknown): value is ReportGroup =>
  isReportLine(value) &&
  isRecord(value) &&
  Array.isArray(value.lines) &&
  value.lines.every(isReportLine);
const groups = (value: unknown): value is ReportGroup[] =>
  Array.isArray(value) && value.every(isGroup);
const isRange = (value: unknown): value is Range =>
  isRecord(value) && isNumber(value.year) && isString(value.from) && isString(value.to);

export const parseJournal = (
  body: unknown,
): { range: Range; entries: JournalEntry[] } | undefined =>
  isRecord(body) &&
  isRange(body.range) &&
  Array.isArray(body.entries) &&
  body.entries.every(
    (entry) =>
      isRecord(entry) && isString(entry.id) && isNumber(entry.number) && Array.isArray(entry.lines),
  )
    ? { range: body.range, entries: body.entries as JournalEntry[] }
    : undefined;

export const parseLedger = (body: unknown): Ledger | undefined =>
  isRecord(body) &&
  isRecord(body.ledger) &&
  isRecord(body.ledger.account) &&
  isNumber(body.ledger.openingCents) &&
  isNumber(body.ledger.closingCents) &&
  Array.isArray(body.ledger.movements)
    ? (body.ledger as unknown as Ledger)
    : undefined;

export const parseIncomeAndExpenses = (body: unknown): IncomeAndExpenses | undefined => {
  const report = isRecord(body) ? body.report : undefined;
  return isRecord(report) &&
    groups(report.income) &&
    groups(report.expenses) &&
    isNumber(report.totalIncomeCents) &&
    isNumber(report.totalExpensesCents) &&
    isNumber(report.resultCents)
    ? (report as unknown as IncomeAndExpenses)
    : undefined;
};

export const parseBalance = (body: unknown): BalanceSheet | undefined => {
  const report = isRecord(body) ? body.report : undefined;
  return isRecord(report) &&
    groups(report.assets) &&
    groups(report.liabilities) &&
    groups(report.equity) &&
    isNumber(report.resultCents) &&
    isNumber(report.totalAssetsCents) &&
    isNumber(report.totalLiabilitiesAndEquityCents)
    ? (report as unknown as BalanceSheet)
    : undefined;
};

export const parseProjectReport = (body: unknown): ProjectReport | undefined => {
  const report = isRecord(body) ? body.report : undefined;
  return isRecord(report) &&
    isRecord(report.project) &&
    Array.isArray(report.movements) &&
    isNumber(report.totalIncomeCents) &&
    isNumber(report.totalExpensesCents)
    ? (report as unknown as ProjectReport)
    : undefined;
};
