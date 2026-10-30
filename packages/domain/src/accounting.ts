/**
 * The books' pure logic (ADR-0006; accounting spec §2): what each form writes as double entry, a reversal's lines,
 * and the identifiers a counterparty or a bank account carries. Account ids come from the chart, which is data: no
 * account number is named here.
 */

/** One line of an entry: an account debited or credited, never both, in whole cents. */
export interface EntryLine {
  accountId: string;
  debitCents: number;
  creditCents: number;
  projectId: string | null;
}

/** The forms tesorería fills (accounting spec §2), and the database's own kinds. */
export const FORM_KINDS = ['income', 'expense', 'transfer', 'manual'] as const;
export type FormKind = (typeof FORM_KINDS)[number];
export const ENTRY_KINDS = [...FORM_KINDS, 'reversal', 'opening', 'closing'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const isFormKind = (value: unknown): value is FormKind =>
  typeof value === 'string' && (FORM_KINDS as readonly string[]).includes(value);

/** What a form says, before it becomes lines. Amounts in cents, more than zero; accounts by id. */
export type EntryForm =
  | {
      kind: 'income' | 'expense';
      amountCents: number;
      /** Where the money came into or went out of: a treasury account. */
      treasuryAccountId: string;
      /** The income account (its kind, "Donaciones") or the expense account ("Servicios bancarios"). */
      accountId: string;
      projectId: string | null;
    }
  | {
      kind: 'transfer';
      amountCents: number;
      fromAccountId: string;
      toAccountId: string;
      projectId: string | null;
    }
  | { kind: 'manual'; lines: readonly EntryLine[] };

const line = (
  accountId: string,
  side: 'debit' | 'credit',
  cents: number,
  projectId: string | null,
): EntryLine => ({
  accountId,
  debitCents: side === 'debit' ? cents : 0,
  creditCents: side === 'credit' ? cents : 0,
  projectId,
});

/**
 * The lines a form writes: an income debits the treasury account and credits the income account; an expense debits
 * the expense account and credits the treasury account; a transfer debits where the money went and credits where it
 * came from; a manual entry is its own lines.
 */
export const linesOf = (form: EntryForm): EntryLine[] => {
  switch (form.kind) {
    case 'income':
      return [
        line(form.treasuryAccountId, 'debit', form.amountCents, form.projectId),
        line(form.accountId, 'credit', form.amountCents, form.projectId),
      ];
    case 'expense':
      return [
        line(form.accountId, 'debit', form.amountCents, form.projectId),
        line(form.treasuryAccountId, 'credit', form.amountCents, form.projectId),
      ];
    case 'transfer':
      return [
        line(form.toAccountId, 'debit', form.amountCents, form.projectId),
        line(form.fromAccountId, 'credit', form.amountCents, form.projectId),
      ];
    case 'manual':
      return form.lines.map((each) => ({ ...each }));
  }
};

/** A reversal's lines (the "Corregir" of a posted entry): each line's debit becomes its credit and back. */
export const mirrorOf = (lines: readonly EntryLine[]): EntryLine[] =>
  lines.map((each) => ({ ...each, debitCents: each.creditCents, creditCents: each.debitCents }));

/** Whether lines would post: two or more, each to one side by more than zero, debits equal to credits. */
export const isBalanced = (lines: readonly EntryLine[]): boolean => {
  if (lines.length < 2) {
    return false;
  }
  let debits = 0;
  let credits = 0;
  for (const each of lines) {
    if (
      !Number.isSafeInteger(each.debitCents) ||
      !Number.isSafeInteger(each.creditCents) ||
      each.debitCents < 0 ||
      each.creditCents < 0 ||
      each.debitCents > 0 === each.creditCents > 0
    ) {
      return false;
    }
    debits += each.debitCents;
    credits += each.creditCents;
  }
  return debits === credits;
};

/** An account's balance as the books show it: debits less credits for assets and expenses, the other way round else. */
export const ACCOUNT_KINDS = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const isAccountKind = (value: unknown): value is AccountKind =>
  typeof value === 'string' && (ACCOUNT_KINDS as readonly string[]).includes(value);

export const normalBalance = (
  kind: AccountKind,
  debitCents: bigint,
  creditCents: bigint,
): bigint =>
  kind === 'asset' || kind === 'expense' ? debitCents - creditCents : creditCents - debitCents;

// Identifiers -------------------------------------------------------------------------------------------------------

/** Upper case, without spaces, dots or dashes: `00000000-t` is `00000000T`. */
export const normaliseTaxId = (raw: string): string => raw.toUpperCase().replace(/[\s.\-/]+/gu, '');

const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const PERSON = /^(?<lead>[0-9XYZ])(?<digits>\d{7})(?<letter>[A-Z])$/u;
const ENTITY = /^[A-HJNP-SUVW](?<digits>\d{7})(?<control>[0-9A-J])$/u;

/** A CIF's control: the sum of its digits in even places, plus each odd place's double, digit by digit. */
const entityControl = (digits: string): number => {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (index % 2 === 1) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    }
  }
  return (10 - (sum % 10)) % 10;
};

/**
 * Whether a tax ID is acceptable as the modelo 182 would read it (D24): a Spanish NIF, NIE or an entity's NIF with
 * the right control character, or anything else of 1 to 20 letters and digits, a foreign funder's own number, which
 * nothing here can check. Takes it normalised.
 */
export const isValidTaxId = (taxId: string): boolean => {
  if (!/^[0-9A-Z]{1,20}$/u.test(taxId)) {
    return false;
  }
  const person = PERSON.exec(taxId)?.groups;
  if (person) {
    // A NIE's X, Y or Z stands for 0, 1 or 2.
    const lead = person.lead ?? '';
    const prefix = 'XYZ'.includes(lead) ? String('XYZ'.indexOf(lead)) : lead;
    return NIF_LETTERS[Number(`${prefix}${person.digits ?? ''}`) % 23] === person.letter;
  }
  const entity = ENTITY.exec(taxId)?.groups;
  if (entity) {
    const control = entityControl(entity.digits ?? '');
    return entity.control === String(control) || entity.control === 'JABCDEFGHI'[control];
  }
  // Not shaped like a Spanish one: a foreign funder's (a Dutch RSIN has nine digits), taken as given.
  return true;
};

/** Upper case, without spaces: `es55 0000 …` is `ES550000…`. */
export const normaliseIban = (raw: string): string => raw.toUpperCase().replace(/\s+/gu, '');

/** Whether an IBAN's check digits are right (ISO 13616, mod 97), and a Spanish one is 24 characters. */
export const isValidIban = (iban: string): boolean => {
  if (
    !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(iban) ||
    (iban.startsWith('ES') && iban.length !== 24)
  ) {
    return false;
  }
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const char of rearranged) {
    const value = /\d/u.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
};

/** `ES55 0000 0000 0000 0000 0001`: an IBAN in groups of four, as banks print it. */
export const formatIban = (iban: string): string => iban.replace(/(.{4})(?=.)/gu, '$1 ');
