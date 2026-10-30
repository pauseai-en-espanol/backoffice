/**
 * Norma 43 (the AEB's Cuaderno 43): the statement file Spanish banks give for an account's movements, which tesorería
 * downloads and imports (accounting spec §6, step 2; ADR-0006 decision 2). Records of 80 characters: 11 opens an
 * account's statement, 22 is a movement, 23 its concept lines (up to five), 24 its amount in another currency, 33
 * closes the account with its totals and final balance, and 88 ends the file with how many records it has. Every
 * total is checked, so a file cut short or edited by hand is refused whole, never imported in part.
 */

import { MAX_CENTS } from './money.js';

/** A movement: days as `2026-10-30`, money in positive and out negative, in cents. */
export interface Norma43Line {
  bookedOn: string;
  valueOn: string;
  /** Norma 43's common concept, `01` to `99` (`04`, transfers; `17`, fees): COMMON_CONCEPTS names them. */
  commonConcept: string;
  /** The bank's own concept code. */
  ownConcept: string;
  amountCents: number;
  document: string;
  reference1: string;
  reference2: string;
  /** The text of its 23 records, which names whoever paid or was paid. */
  concepts: string[];
  /** Its records as the file has them, one after the other: what tells it apart from any other line. */
  records: string;
}

/** An account's statement: its bank, branch and account number, period, balances (signed) and movements. */
export interface Norma43Account {
  bank: string;
  branch: string;
  account: string;
  startsOn: string;
  endsOn: string;
  openingCents: number;
  closingCents: number;
  /** ISO 4217's number: `978` for the euro. */
  currency: string;
  /** The account's holder, as the bank names it. */
  holder: string;
  lines: Norma43Line[];
}

export type Norma43Problem =
  /** Nothing in it, or no account. */
  | 'empty'
  /** A record that isn't one of Norma 43's, or longer than 80 characters. */
  | 'record'
  /** A record where it can't be: a movement before its account, a concept before its movement. */
  | 'order'
  /** A day that doesn't exist, or a period that ends before it starts. */
  | 'date'
  /** An amount or a sign that isn't one. */
  | 'amount'
  /** An account's totals or final balance that don't add up, or a closing record of another account. */
  | 'totals'
  /** The file's record count that isn't its own. */
  | 'count'
  /** Cut short: an account without its closing record, or a file without its end. */
  | 'unfinished';

export class Norma43Error extends Error {
  constructor(
    readonly problem: Norma43Problem,
    /** The line of the file it was found at, from 1. */
    readonly line: number,
  ) {
    super(`Norma 43: ${problem} at line ${line}`);
    this.name = 'Norma43Error';
  }
}

/** The common concepts the standard lists, which the staff app names in words (packages/i18n, books.bank.concepts). */
export const COMMON_CONCEPTS = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '98',
  '99',
] as const;

const RECORD = 80;

/** `260115` as `2026-01-15`, if that day exists. */
const dayOf = (text: string, line: number): string => {
  if (!/^\d{6}$/u.test(text)) {
    throw new Norma43Error('date', line);
  }
  const year = 2000 + Number(text.slice(0, 2));
  const month = Number(text.slice(2, 4));
  const day = Number(text.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Norma43Error('date', line);
  }
  return date.toISOString().slice(0, 10);
};

/** Fourteen digits, two of them decimals, as cents: no more than the books keep. */
const centsOf = (text: string, line: number): number => {
  if (!/^\d{14}$/u.test(text)) {
    throw new Norma43Error('amount', line);
  }
  const cents = Number(text);
  if (cents > MAX_CENTS) {
    throw new Norma43Error('amount', line);
  }
  return cents;
};

/** `1` is a debit (out, or an overdrawn balance), `2` a credit. */
const signOf = (text: string, line: number): 1 | -1 => {
  if (text === '1') {
    return -1;
  }
  if (text === '2') {
    return 1;
  }
  throw new Norma43Error('amount', line);
};

const countOf = (text: string, line: number, problem: Norma43Problem): number => {
  if (!/^\d+$/u.test(text)) {
    throw new Norma43Error(problem, line);
  }
  return Number(text);
};

/** Characters `from` to `to` of a record, counted from 1 as the standard does. */
const field = (record: string, from: number, to: number): string => record.slice(from - 1, to);

/**
 * The file's records, each padded to 80 characters (banks may trim the spaces at the end), with their line numbers.
 * A file with no line breaks at all is cut every 80 characters.
 */
const recordsOf = (text: string): { record: string; line: number }[] => {
  let lines = text.split(/\r\n|\n|\r/u);
  const only = lines.length === 1 ? (lines[0] ?? '') : '';
  if (only.length > RECORD && only.length % RECORD === 0) {
    lines = only.match(/[\s\S]{80}/gu) ?? [];
  }
  const records: { record: string; line: number }[] = [];
  lines.forEach((raw, index) => {
    const record = raw.trimEnd();
    if (record === '') {
      return;
    }
    if (record.length > RECORD) {
      throw new Norma43Error('record', index + 1);
    }
    records.push({ record: record.padEnd(RECORD, ' '), line: index + 1 });
  });
  return records;
};

/**
 * The accounts' statements in a Norma 43 file, already decoded (banks write it in ISO-8859-1). Refuses the whole file,
 * with the problem and the line it was found at, if anything in it doesn't hold.
 */
export const parseNorma43 = (text: string): Norma43Account[] => {
  const records = recordsOf(text);
  const accounts: Norma43Account[] = [];
  let account: Norma43Account | undefined;
  let movement: Norma43Line | undefined;
  let finished = false;
  let counted = 0;

  for (const { record, line } of records) {
    const type = record.slice(0, 2);
    if (finished) {
      throw new Norma43Error('order', line);
    }
    switch (type) {
      case '11': {
        if (account) {
          throw new Norma43Error('order', line);
        }
        const startsOn = dayOf(field(record, 21, 26), line);
        const endsOn = dayOf(field(record, 27, 32), line);
        if (endsOn < startsOn) {
          throw new Norma43Error('date', line);
        }
        account = {
          bank: field(record, 3, 6),
          branch: field(record, 7, 10),
          account: field(record, 11, 20),
          startsOn,
          endsOn,
          openingCents: signOf(field(record, 33, 33), line) * centsOf(field(record, 34, 47), line),
          currency: field(record, 48, 50),
          holder: field(record, 52, 77).trim(),
          closingCents: 0,
          lines: [],
        };
        if (!/^\d{18}$/u.test(account.bank + account.branch + account.account)) {
          throw new Norma43Error('record', line);
        }
        movement = undefined;
        break;
      }
      case '22': {
        if (!account) {
          throw new Norma43Error('order', line);
        }
        const commonConcept = field(record, 23, 24);
        if (!/^\d{2}$/u.test(commonConcept)) {
          throw new Norma43Error('record', line);
        }
        const amountCents =
          signOf(field(record, 28, 28), line) * centsOf(field(record, 29, 42), line);
        if (amountCents === 0) {
          throw new Norma43Error('amount', line);
        }
        movement = {
          bookedOn: dayOf(field(record, 11, 16), line),
          valueOn: dayOf(field(record, 17, 22), line),
          commonConcept,
          ownConcept: field(record, 25, 27).trim(),
          amountCents,
          document: field(record, 43, 52).trim(),
          reference1: field(record, 53, 64).trim(),
          reference2: field(record, 65, 80).trim(),
          concepts: [],
          records: record,
        };
        account.lines.push(movement);
        break;
      }
      case '23': {
        // Two concepts a record, five records a movement at most.
        if (!movement || movement.concepts.length >= 10) {
          throw new Norma43Error('order', line);
        }
        movement.concepts.push(field(record, 5, 42).trim(), field(record, 43, 80).trim());
        movement.records += record;
        break;
      }
      case '24': {
        if (!movement) {
          throw new Norma43Error('order', line);
        }
        movement.records += record;
        break;
      }
      case '33': {
        if (!account) {
          throw new Norma43Error('order', line);
        }
        if (
          field(record, 3, 6) !== account.bank ||
          field(record, 7, 10) !== account.branch ||
          field(record, 11, 20) !== account.account
        ) {
          throw new Norma43Error('totals', line);
        }
        const debits = account.lines.filter((each) => each.amountCents < 0);
        const credits = account.lines.filter((each) => each.amountCents > 0);
        const debitCents = debits.reduce((sum, each) => sum - each.amountCents, 0);
        const creditCents = credits.reduce((sum, each) => sum + each.amountCents, 0);
        const closingCents =
          signOf(field(record, 59, 59), line) * centsOf(field(record, 60, 73), line);
        if (
          countOf(field(record, 21, 25), line, 'totals') !== debits.length ||
          centsOf(field(record, 26, 39), line) !== debitCents ||
          countOf(field(record, 40, 44), line, 'totals') !== credits.length ||
          centsOf(field(record, 45, 58), line) !== creditCents ||
          closingCents !== account.openingCents + creditCents - debitCents
        ) {
          throw new Norma43Error('totals', line);
        }
        account.closingCents = closingCents;
        for (const each of account.lines) {
          each.concepts = each.concepts.filter((concept) => concept !== '');
        }
        accounts.push(account);
        account = undefined;
        movement = undefined;
        break;
      }
      case '88': {
        if (account || accounts.length === 0) {
          throw new Norma43Error(account ? 'unfinished' : 'empty', line);
        }
        // The records before it; a file that counts this one too is taken as well.
        const count = countOf(field(record, 21, 26), line, 'count');
        if (count !== counted && count !== counted + 1) {
          throw new Norma43Error('count', line);
        }
        finished = true;
        break;
      }
      default:
        throw new Norma43Error('record', line);
    }
    counted += 1;
  }

  const last = records.at(-1)?.line ?? 1;
  if (records.length === 0) {
    throw new Norma43Error('empty', 1);
  }
  if (!finished) {
    throw new Norma43Error('unfinished', last);
  }
  return accounts;
};

/**
 * What tells each line apart, in order: its records, and how many lines with the same records came before it in the
 * statement (two equal fees on one day are two). The same movement in two overlapping statements has the same key.
 */
export const lineKeys = (account: Norma43Account): string[] => {
  const seen = new Map<string, number>();
  return account.lines.map((line) => {
    const before = seen.get(line.records) ?? 0;
    seen.set(line.records, before + 1);
    return `${line.records}#${before}`;
  });
};

/** A line's words as the books keep them: its concept lines joined, and its references, both trimmed to fit. */
export const lineText = (line: Norma43Line): { description: string; reference: string } => ({
  description: line.concepts.join(' ').replaceAll(/\s+/gu, ' ').trim().slice(0, 1000),
  reference: [line.document, line.reference1, line.reference2]
    .filter((each) => each !== '' && !/^0+$/u.test(each))
    .join(' · ')
    .slice(0, 200),
});

/** The control digits of a Spanish account number (CCC): of `00` and the bank and branch, then of the account. */
const cccControl = (digits: string): number => {
  const weights = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const control = 11 - (sum % 11);
  return control === 11 ? 0 : control === 10 ? 1 : control;
};

/** ISO 13616's mod 97 of an IBAN rearranged, letters as numbers. */
const mod97 = (text: string): number => {
  let remainder = 0;
  for (const char of text) {
    const value = /\d/u.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of value) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
};

/** The IBAN of a statement's account, which Norma 43 gives without its control digits. */
export const ibanOf = (account: Pick<Norma43Account, 'bank' | 'branch' | 'account'>): string => {
  const control = `${cccControl(`00${account.bank}${account.branch}`)}${cccControl(account.account)}`;
  const bban = `${account.bank}${account.branch}${control}${account.account}`;
  const check = 98 - mod97(`${bban}ES00`);
  return `ES${String(check).padStart(2, '0')}${bban}`;
};

/** Whether a Spanish IBAN (normalised) is the statement's account: its bank, branch and account number. */
export const isAccountOf = (
  iban: string,
  account: Pick<Norma43Account, 'bank' | 'branch' | 'account'>,
): boolean =>
  iban.length === 24 &&
  iban.startsWith('ES') &&
  iban.slice(4, 8) === account.bank &&
  iban.slice(8, 12) === account.branch &&
  iban.slice(14, 24) === account.account;
