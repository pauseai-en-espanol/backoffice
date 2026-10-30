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

/** A bank line an entry is matched to (Banco). */
export interface EntryBankLine {
  id: string;
  accountId: string;
  bookedOn: string;
  amountCents: number;
}

export interface EntryDetail extends EntrySummary {
  lines: EntryLine[];
  receiptList: Receipt[];
  bankLines: EntryBankLine[];
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
    isNullableString(entry.postedAt) &&
    Array.isArray(entry.bankLines) &&
    entry.bankLines.every(
      (line) =>
        isRecord(line) &&
        isString(line.id) &&
        isString(line.accountId) &&
        isString(line.bookedOn) &&
        isNumber(line.amountCents),
    )
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

// The bank -------------------------------------------------------------------------------------------------------------

export interface TreasuryAccount {
  id: string;
  code: string;
  name: string;
  iban: string | null;
  active: boolean;
}

export interface StatementSummary {
  id: string;
  startsOn: string;
  endsOn: string;
  openingCents: number;
  closingCents: number;
  lines: number;
  matched: number;
  importedBy: string | null;
  importedAt: string;
}

export interface EntryRef {
  id: string;
  number: number | null;
  year: number;
  date: string;
  description: string;
}

export interface BankLine {
  id: string;
  statementId: string;
  bookedOn: string;
  valueOn: string;
  commonConcept: string;
  amountCents: number;
  description: string;
  reference: string;
  entry: (EntryRef & { corrected: boolean }) | null;
  suggestions: EntryRef[];
}

export interface Reconciliation {
  asOf: string | null;
  bankCents: number | null;
  booksCents: number | null;
  pendingLines: number;
  unmatchedEntries: EntryRef[];
}

export const LINE_STATES = ['pending', 'matched', 'all'] as const;
export type LineState = (typeof LINE_STATES)[number];

export interface Bank {
  accounts: TreasuryAccount[];
  /** The account shown; null when the chart has no treasury account. */
  account: string | null;
  year: number;
  state: LineState;
  statements: StatementSummary[];
  lines: BankLine[];
  reconciliation: Reconciliation | null;
}

const isEntryRef = (value: unknown): value is EntryRef =>
  isRecord(value) &&
  isString(value.id) &&
  isNullable(isNumber)(value.number) &&
  isNumber(value.year) &&
  isString(value.date) &&
  isString(value.description);

const isBankLine = (value: unknown): value is BankLine =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.statementId) &&
  isString(value.bookedOn) &&
  isString(value.valueOn) &&
  isString(value.commonConcept) &&
  isNumber(value.amountCents) &&
  isString(value.description) &&
  isString(value.reference) &&
  (value.entry === null ||
    (isEntryRef(value.entry) &&
      isRecord(value.entry) &&
      typeof value.entry.corrected === 'boolean')) &&
  Array.isArray(value.suggestions) &&
  value.suggestions.every(isEntryRef);

const isStatement = (value: unknown): value is StatementSummary =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.startsOn) &&
  isString(value.endsOn) &&
  isNumber(value.openingCents) &&
  isNumber(value.closingCents) &&
  isNumber(value.lines) &&
  isNumber(value.matched) &&
  isNullableString(value.importedBy) &&
  isString(value.importedAt);

const isReconciliation = (value: unknown): value is Reconciliation =>
  isRecord(value) &&
  isNullableString(value.asOf) &&
  isNullable(isNumber)(value.bankCents) &&
  isNullable(isNumber)(value.booksCents) &&
  isNumber(value.pendingLines) &&
  Array.isArray(value.unmatchedEntries) &&
  value.unmatchedEntries.every(isEntryRef);

const isTreasury = (value: unknown): value is TreasuryAccount =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.code) &&
  isString(value.name) &&
  isNullableString(value.iban) &&
  typeof value.active === 'boolean';

export const parseBank = (body: unknown): Bank | undefined => {
  if (
    !isRecord(body) ||
    !Array.isArray(body.accounts) ||
    !body.accounts.every(isTreasury) ||
    !isNullableString(body.account) ||
    !isNumber(body.year) ||
    !isOneOf(LINE_STATES)(body.state)
  ) {
    return undefined;
  }
  const base = {
    accounts: body.accounts,
    account: body.account,
    year: body.year,
    state: body.state,
  };
  if (body.account === null) {
    return { ...base, statements: [], lines: [], reconciliation: null };
  }
  return Array.isArray(body.statements) &&
    body.statements.every(isStatement) &&
    Array.isArray(body.lines) &&
    body.lines.every(isBankLine) &&
    isReconciliation(body.reconciliation)
    ? {
        ...base,
        statements: body.statements,
        lines: body.lines,
        reconciliation: body.reconciliation,
      }
    : undefined;
};

/** One line, as Nuevo movimiento starts from it ("Anotar"). */
export interface BankLineDetail {
  id: string;
  accountId: string;
  bookedOn: string;
  commonConcept: string;
  amountCents: number;
  description: string;
  reference: string;
  pending: boolean;
}

export const parseBankLine = (body: unknown): BankLineDetail | undefined => {
  const line = isRecord(body) ? body.line : undefined;
  return isRecord(line) &&
    isString(line.id) &&
    isString(line.accountId) &&
    isString(line.bookedOn) &&
    isString(line.commonConcept) &&
    isNumber(line.amountCents) &&
    isString(line.description) &&
    isString(line.reference) &&
    typeof line.pending === 'boolean'
    ? (line as unknown as BankLineDetail)
    : undefined;
};

/** A statement file's dry run (bank-routes.ts): each account in it, and the first new movements. */
export interface StatementReview {
  statements: {
    iban: string;
    account: { id: string; code: string; name: string } | null;
    startsOn: string;
    endsOn: string;
    openingCents: number;
    closingCents: number;
    lines: number;
    new: number;
    already: number;
    closedYear: number;
  }[];
  preview: {
    bookedOn: string;
    commonConcept: string;
    amountCents: number;
    description: string;
    reference: string;
  }[];
  canApply: boolean;
}

export const parseStatementReview = (body: unknown): StatementReview | undefined =>
  isRecord(body) &&
  Array.isArray(body.statements) &&
  body.statements.every(
    (each) =>
      isRecord(each) &&
      isString(each.iban) &&
      (each.account === null || isRecord(each.account)) &&
      isString(each.startsOn) &&
      isString(each.endsOn) &&
      isNumber(each.openingCents) &&
      isNumber(each.closingCents) &&
      isNumber(each.lines) &&
      isNumber(each.new) &&
      isNumber(each.already) &&
      isNumber(each.closedYear),
  ) &&
  Array.isArray(body.preview) &&
  typeof body.canApply === 'boolean'
    ? (body as unknown as StatementReview)
    : undefined;

// The budget ---------------------------------------------------------------------------------------------------------

export interface BudgetAccount {
  id: string;
  code: string;
  name: string;
  kind: 'income' | 'expense';
}

export interface BudgetLine {
  id: string;
  account: BudgetAccount;
  budgetCents: number;
  actualCents: number;
}

export interface Budget {
  year: number;
  status: 'open' | 'closed';
  lines: BudgetLine[];
  unbudgeted: { account: BudgetAccount; actualCents: number }[];
  income: { budgetCents: number; actualCents: number };
  expenses: { budgetCents: number; actualCents: number };
}

const isBudgetAccount = (value: unknown): value is BudgetAccount =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.code) &&
  isString(value.name) &&
  isOneOf(['income', 'expense'] as const)(value.kind);
const isTotals = (value: unknown): value is Budget['income'] =>
  isRecord(value) && isNumber(value.budgetCents) && isNumber(value.actualCents);

export const parseBudget = (body: unknown): Budget | undefined => {
  const budget = isRecord(body) ? body.budget : undefined;
  return isRecord(budget) &&
    isNumber(budget.year) &&
    isOneOf(['open', 'closed'] as const)(budget.status) &&
    Array.isArray(budget.lines) &&
    budget.lines.every(
      (line) =>
        isRecord(line) &&
        isString(line.id) &&
        isBudgetAccount(line.account) &&
        isNumber(line.budgetCents) &&
        isNumber(line.actualCents),
    ) &&
    Array.isArray(budget.unbudgeted) &&
    budget.unbudgeted.every(
      (each) => isRecord(each) && isBudgetAccount(each.account) && isNumber(each.actualCents),
    ) &&
    isTotals(budget.income) &&
    isTotals(budget.expenses)
    ? (budget as unknown as Budget)
    : undefined;
};
