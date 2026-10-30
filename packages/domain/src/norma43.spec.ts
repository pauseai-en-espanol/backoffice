import { describe, expect, it } from 'vitest';

import { isValidIban } from './accounting.js';
import { MAX_CENTS } from './money.js';
import {
  ibanOf,
  isAccountOf,
  lineKeys,
  lineText,
  type Norma43Account,
  Norma43Error,
  type Norma43Problem,
  parseNorma43,
} from './norma43.js';

// Fictional files, built record by record as the standard lays them out: bank and branch 0000, account 0000000001
// (the IBAN of the database fixtures, ES55 0000 0000 0000 0000 0001), an invented holder and invented movements.

const pad = (text: string, length: number): string => text.padEnd(length, ' ').slice(0, length);
const digits = (value: number, length: number): string => String(value).padStart(length, '0');

const ACCOUNT = { bank: '0000', branch: '0000', account: '0000000001' };
const IDENTITY = `${ACCOUNT.bank}${ACCOUNT.branch}${ACCOUNT.account}`;

interface Movement {
  day?: string;
  value?: string;
  concept?: string;
  own?: string;
  cents: number;
  document?: number;
  reference1?: string;
  reference2?: string;
  lines?: readonly string[];
}

const header = (opening: number, from = '260101', to = '260131', identity = IDENTITY): string =>
  `11${identity}${from}${to}${opening < 0 ? '1' : '2'}${digits(Math.abs(opening), 14)}9783${pad('ASOCIACION DE EJEMPLO', 26)}${pad('', 3)}`;

const movement = (each: Movement): string[] => {
  const main = `22${pad('', 4)}0000${each.day ?? '260115'}${each.value ?? each.day ?? '260115'}${each.concept ?? '04'}${pad(each.own ?? '000', 3)}${each.cents < 0 ? '1' : '2'}${digits(Math.abs(each.cents), 14)}${digits(each.document ?? 0, 10)}${pad(each.reference1 ?? '', 12)}${pad(each.reference2 ?? '', 16)}`;
  const concepts: string[] = [];
  const texts = each.lines ?? [];
  for (let index = 0; index < texts.length; index += 2) {
    concepts.push(
      `23${digits(index / 2 + 1, 2)}${pad(texts[index] ?? '', 38)}${pad(texts[index + 1] ?? '', 38)}`,
    );
  }
  return [main, ...concepts];
};

const footer = (opening: number, movements: readonly Movement[], identity = IDENTITY): string => {
  const debits = movements.filter((each) => each.cents < 0);
  const credits = movements.filter((each) => each.cents > 0);
  const debitCents = debits.reduce((sum, each) => sum - each.cents, 0);
  const creditCents = credits.reduce((sum, each) => sum + each.cents, 0);
  const closing = opening + creditCents - debitCents;
  return `33${identity}${digits(debits.length, 5)}${digits(debitCents, 14)}${digits(credits.length, 5)}${digits(creditCents, 14)}${closing < 0 ? '1' : '2'}${digits(Math.abs(closing), 14)}978${pad('', 4)}`;
};

const end = (count: number): string => `88${'9'.repeat(18)}${digits(count, 6)}${pad('', 54)}`;

/** An account's records: its header, movements and footer. */
const statement = (opening: number, movements: readonly Movement[], from?: string, to?: string) => [
  header(opening, from, to),
  ...movements.flatMap(movement),
  footer(opening, movements),
];

/** A whole file of these records, with its end record counting them. */
const file = (...records: readonly string[]): string =>
  [...records, end(records.length)].join('\n');

const DONATION: Movement = {
  day: '260115',
  value: '260116',
  concept: '04',
  own: '102',
  cents: 123_456,
  document: 0,
  reference1: '000000000000',
  reference2: 'REF EJEMPLO',
  lines: ['TRANSFERENCIA DE PERSONA DONANTE', 'DE EJEMPLO', 'DONACION'],
};
const FEE: Movement = {
  day: '260131',
  concept: '17',
  cents: -250,
  lines: ['COMISION MANTENIMIENTO'],
};

const refused = (text: string): { problem: Norma43Problem; line: number } | undefined => {
  try {
    parseNorma43(text);
    return undefined;
  } catch (error) {
    if (error instanceof Norma43Error) {
      return { problem: error.problem, line: error.line };
    }
    throw error;
  }
};

describe('parseNorma43', () => {
  it('reads an account: its number, period, balances, and each movement with its sign, days, concept and references', () => {
    const [account, ...rest] = parseNorma43(file(...statement(500_000, [DONATION, FEE])));
    expect(rest).toEqual([]);
    expect(account).toMatchObject({
      ...ACCOUNT,
      startsOn: '2026-01-01',
      endsOn: '2026-01-31',
      openingCents: 500_000,
      closingCents: 623_206,
      currency: '978',
      holder: 'ASOCIACION DE EJEMPLO',
    });
    expect(account?.lines).toHaveLength(2);
    expect(account?.lines[0]).toMatchObject({
      bookedOn: '2026-01-15',
      valueOn: '2026-01-16',
      commonConcept: '04',
      ownConcept: '102',
      amountCents: 123_456,
      document: '0000000000',
      reference1: '000000000000',
      reference2: 'REF EJEMPLO',
      concepts: ['TRANSFERENCIA DE PERSONA DONANTE', 'DE EJEMPLO', 'DONACION'],
    });
    expect(account?.lines[0]?.records).toHaveLength(80 * 3);
    expect(account?.lines[1]).toMatchObject({ amountCents: -250, commonConcept: '17' });
  });

  it('reads an overdrawn balance as negative, and several accounts in one file', () => {
    const second = '1111222200000000002';
    const records = [
      ...statement(-1000, [{ cents: 5000 }]),
      header(0, '260101', '260131', second.slice(0, 18)),
      ...movement({ cents: -100 }),
      footer(0, [{ cents: -100 }], second.slice(0, 18)),
    ];
    const accounts = parseNorma43(file(...records));
    expect(accounts.map((each) => [each.bank, each.openingCents, each.closingCents])).toEqual([
      ['0000', -1000, 4000],
      ['1111', 0, -100],
    ]);
  });

  it('takes the line breaks of any system, records whose trailing spaces were trimmed, or no line breaks at all', () => {
    const records = [...statement(0, [FEE]), end(4)];
    const expected = parseNorma43(records.join('\n'));
    expect(parseNorma43(records.map((each) => each.trimEnd()).join('\r\n'))).toEqual(expected);
    expect(parseNorma43(`${records.join('\r')}\r\n\r\n`)).toEqual(expected);
    expect(parseNorma43(records.join(''))).toEqual(expected);
  });

  it('takes an end record that counts itself too', () => {
    const records = statement(0, [FEE]);
    expect(parseNorma43([...records, end(records.length + 1)].join('\n'))).toHaveLength(1);
    expect(refused([...records, end(records.length + 2)].join('\n'))).toEqual({
      problem: 'count',
      line: 5,
    });
  });

  it('refuses a file with nothing in it, or a record it doesn’t know', () => {
    expect(refused('')).toEqual({ problem: 'empty', line: 1 });
    expect(refused('\n\n')).toEqual({ problem: 'empty', line: 1 });
    expect(refused(end(0))).toEqual({ problem: 'empty', line: 1 });
    expect(refused(file(...statement(0, [FEE]), `99${pad('', 78)}`))).toEqual({
      problem: 'record',
      line: 5,
    });
    expect(refused(file(`${header(0)}X`))).toEqual({ problem: 'record', line: 1 });
    expect(refused('fecha;concepto;importe\n15/01/2026;Donación;1234,56')).toEqual({
      problem: 'record',
      line: 1,
    });
  });

  it('refuses a record out of its place', () => {
    const [head = '', main = '', concept = '', foot = ''] = statement(0, [
      { cents: 100, lines: ['UNO'] },
    ]);
    expect(refused(file(main, head, foot))).toEqual({ problem: 'order', line: 1 });
    expect(refused(file(head, concept, main, foot))).toEqual({ problem: 'order', line: 2 });
    expect(refused(file(head, head, main, foot))).toEqual({ problem: 'order', line: 2 });
    expect(refused(file(foot))).toEqual({ problem: 'order', line: 1 });
    expect(refused(`${file(head, main, concept, foot)}\n${head}`)).toEqual({
      problem: 'order',
      line: 6,
    });
    const six = movement({
      cents: 100,
      lines: Array.from({ length: 12 }, (_, index) => `L${index}`),
    });
    expect(refused(file(head, ...six, footer(0, [{ cents: 100 }])))).toEqual({
      problem: 'order',
      line: 8,
    });
  });

  it('refuses a day that doesn’t exist, or a period that ends before it starts', () => {
    expect(refused(file(...statement(0, [{ cents: 100, day: '260230' }])))).toEqual({
      problem: 'date',
      line: 2,
    });
    expect(refused(file(...statement(0, [], '260201', '260131')))).toEqual({
      problem: 'date',
      line: 1,
    });
    expect(refused(file(...statement(0, [], '26AB01')))).toEqual({ problem: 'date', line: 1 });
  });

  it('refuses an amount, a sign or a count that isn’t one, a movement of nothing, and more than the books keep', () => {
    const [head = '', main = '', foot = ''] = statement(0, [{ cents: 100 }]);
    const at = (record: string, from: number, text: string) =>
      `${record.slice(0, from - 1)}${text}${record.slice(from - 1 + text.length)}`;
    expect(refused(file(head, at(main, 28, '3'), foot))).toEqual({ problem: 'amount', line: 2 });
    expect(refused(file(head, at(main, 29, '0000000000001,'), foot))).toEqual({
      problem: 'amount',
      line: 2,
    });
    expect(refused(file(at(head, 33, '0'), main, foot))).toEqual({ problem: 'amount', line: 1 });
    expect(refused(file(...statement(0, [{ cents: 0 }])))).toEqual({ problem: 'amount', line: 2 });
    expect(refused(file(...statement(0, [{ cents: MAX_CENTS + 1 }])))).toEqual({
      problem: 'amount',
      line: 2,
    });
    expect(refused(file(head, main, at(foot, 21, 'ABCDE')))).toEqual({
      problem: 'totals',
      line: 3,
    });
  });

  it('refuses an account whose totals or final balance don’t add up, or closed as another', () => {
    const movements = [DONATION, FEE];
    const [head = '', ...body] = statement(500_000, movements);
    const foot = body.pop() ?? '';
    const at = (from: number, text: string) =>
      `${foot.slice(0, from - 1)}${text}${foot.slice(from - 1 + text.length)}`;
    const line = body.length + 2;
    for (const wrong of [
      at(21, '00002'),
      at(26, digits(251, 14)),
      at(40, '00000'),
      at(45, digits(123_457, 14)),
      at(59, '1'),
      at(60, digits(623_207, 14)),
      at(3, '9999'),
      at(11, '0000000002'),
    ]) {
      expect(refused(file(head, ...body, wrong))).toEqual({ problem: 'totals', line });
    }
    // A movement dropped from the middle of the file is noticed.
    expect(refused(file(head, ...body.slice(3), foot))).toEqual({ problem: 'totals', line: 4 });
  });

  it('refuses a file cut short: an account without its closing record, or no end record', () => {
    const [head = '', main = ''] = statement(0, [FEE]);
    expect(refused([head, main].join('\n'))).toEqual({ problem: 'unfinished', line: 2 });
    expect(refused([head, main, end(2)].join('\n'))).toEqual({ problem: 'unfinished', line: 3 });
    expect(refused(statement(0, [FEE]).join('\n'))).toEqual({ problem: 'unfinished', line: 4 });
  });

  it('refuses a record longer than 80 characters', () => {
    expect(
      refused(file(...statement(0, [FEE]).map((each, index) => (index === 1 ? `${each}X` : each)))),
    ).toEqual({
      problem: 'record',
      line: 2,
    });
  });
});

describe('lineKeys', () => {
  it('tells two equal movements apart by order, and finds the same ones in an overlapping statement', () => {
    const [january] = parseNorma43(file(...statement(0, [FEE, FEE, DONATION])));
    const [overlap] = parseNorma43(file(...statement(-500, [FEE, DONATION, { cents: 100 }])));
    const keys = lineKeys(january as Norma43Account);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]?.endsWith('#0')).toBe(true);
    expect(keys[1]?.endsWith('#1')).toBe(true);
    const again = lineKeys(overlap as Norma43Account);
    expect(again[0]).toBe(keys[0]);
    expect(again[1]).toBe(keys[2]);
    expect(keys).not.toContain(again[2]);
  });
});

describe('lineText', () => {
  it('joins the concept lines, and keeps the references that say something', () => {
    const [account] = parseNorma43(file(...statement(0, [DONATION])));
    const line = account?.lines[0];
    expect(line && lineText(line)).toEqual({
      description: 'TRANSFERENCIA DE PERSONA DONANTE DE EJEMPLO DONACION',
      reference: 'REF EJEMPLO',
    });
    const [plain] = parseNorma43(file(...statement(0, [{ cents: 100, document: 42 }])));
    expect(plain?.lines[0] && lineText(plain.lines[0])).toEqual({
      description: '',
      reference: '0000000042',
    });
  });
});

describe('ibanOf and isAccountOf', () => {
  it('rebuilds a statement account’s IBAN, control digits included', () => {
    // The fixtures' fictional IBAN has 00 for control digits, which the CCC's rule doesn't give: matching an account
    // goes by its bank, branch and number alone (isAccountOf), and a rebuilt IBAN is a valid one.
    expect(isValidIban(ibanOf(ACCOUNT))).toBe(true);
    // The IBAN standard's published Spanish example, ES91 2100 0418 4502 0005 1332: its 45 are the CCC's control digits.
    expect(ibanOf({ bank: '2100', branch: '0418', account: '0200051332' })).toBe(
      'ES9121000418450200051332',
    );
  });

  it('knows an IBAN by its bank, branch and account number', () => {
    expect(isAccountOf('ES5500000000000000000001', ACCOUNT)).toBe(true);
    expect(isAccountOf('ES5500000000000000000002', ACCOUNT)).toBe(false);
    expect(isAccountOf('ES5500010000000000000001', ACCOUNT)).toBe(false);
    expect(isAccountOf('ES5500000001000000000001', ACCOUNT)).toBe(false);
    expect(isAccountOf('NL91ABNA0417164300', ACCOUNT)).toBe(false);
  });
});
