import { describe, expect, it } from 'vitest';

import {
  type EntryLine,
  formatIban,
  isBalanced,
  isValidIban,
  isValidTaxId,
  linesOf,
  mirrorOf,
  normalBalance,
  normaliseIban,
  normaliseTaxId,
} from './accounting.js';

const BANK = 'banco';
const OTHER_BANK = 'otro-banco';

describe('linesOf', () => {
  it('debits the treasury account for an income, and credits its kind', () => {
    expect(
      linesOf({
        kind: 'income',
        amountCents: 1000,
        treasuryAccountId: BANK,
        accountId: 'donaciones',
        projectId: 'proyecto',
      }),
    ).toEqual([
      { accountId: BANK, debitCents: 1000, creditCents: 0, projectId: 'proyecto' },
      { accountId: 'donaciones', debitCents: 0, creditCents: 1000, projectId: 'proyecto' },
    ]);
  });

  it('debits the expense and credits the treasury account for an expense', () => {
    expect(
      linesOf({
        kind: 'expense',
        amountCents: 250,
        treasuryAccountId: BANK,
        accountId: 'servicios-bancarios',
        projectId: null,
      }),
    ).toEqual([
      { accountId: 'servicios-bancarios', debitCents: 250, creditCents: 0, projectId: null },
      { accountId: BANK, debitCents: 0, creditCents: 250, projectId: null },
    ]);
  });

  it('debits where a transfer went and credits where it came from', () => {
    expect(
      linesOf({
        kind: 'transfer',
        amountCents: 500,
        fromAccountId: BANK,
        toAccountId: OTHER_BANK,
        projectId: null,
      }),
    ).toEqual([
      { accountId: OTHER_BANK, debitCents: 500, creditCents: 0, projectId: null },
      { accountId: BANK, debitCents: 0, creditCents: 500, projectId: null },
    ]);
  });

  it('keeps a manual entry’s own lines', () => {
    const lines: EntryLine[] = [
      { accountId: 'a', debitCents: 10, creditCents: 0, projectId: null },
      { accountId: 'b', debitCents: 0, creditCents: 10, projectId: null },
    ];
    expect(linesOf({ kind: 'manual', lines })).toEqual(lines);
  });
});

describe('mirrorOf and isBalanced', () => {
  const lines: EntryLine[] = [
    { accountId: BANK, debitCents: 1000, creditCents: 0, projectId: null },
    { accountId: 'donaciones', debitCents: 0, creditCents: 600, projectId: null },
    { accountId: 'subvenciones', debitCents: 0, creditCents: 400, projectId: null },
  ];

  it('swaps each line’s sides for a reversal, which balances as its original does', () => {
    expect(mirrorOf(lines).map((each) => [each.debitCents, each.creditCents])).toEqual([
      [0, 1000],
      [600, 0],
      [400, 0],
    ]);
    expect(isBalanced(lines)).toBe(true);
    expect(isBalanced(mirrorOf(lines))).toBe(true);
  });

  it('refuses one line, unequal sides, a line on both sides or neither, and fractions of a cent', () => {
    expect(isBalanced(lines.slice(0, 1))).toBe(false);
    expect(isBalanced(lines.slice(0, 2))).toBe(false);
    expect(
      isBalanced([
        { accountId: 'a', debitCents: 10, creditCents: 10, projectId: null },
        { accountId: 'b', debitCents: 0, creditCents: 0, projectId: null },
      ]),
    ).toBe(false);
    expect(
      isBalanced([
        { accountId: 'a', debitCents: 0.5, creditCents: 0, projectId: null },
        { accountId: 'b', debitCents: 0, creditCents: 0.5, projectId: null },
      ]),
    ).toBe(false);
  });
});

describe('normalBalance', () => {
  it('reads assets and expenses by their debits, the rest by their credits', () => {
    expect(normalBalance('asset', 1000n, 250n)).toBe(750n);
    expect(normalBalance('expense', 1000n, 0n)).toBe(1000n);
    expect(normalBalance('income', 0n, 1000n)).toBe(1000n);
    expect(normalBalance('equity', 100n, 0n)).toBe(-100n);
  });
});

describe('tax IDs', () => {
  it('checks the control character of a Spanish NIF, NIE or entity’s NIF', () => {
    expect(isValidTaxId(normaliseTaxId('00000000-t'))).toBe(true);
    expect(isValidTaxId('00000000R')).toBe(false);
    expect(isValidTaxId('X0000000T')).toBe(true);
    expect(isValidTaxId('Y0000000Z')).toBe(true);
    expect(isValidTaxId('Y0000000T')).toBe(false);
    // An association's NIF (G), with a digit or a letter as its control.
    expect(isValidTaxId('G00000000')).toBe(true);
    expect(isValidTaxId('G0000000J')).toBe(true);
    expect(isValidTaxId('G00000001')).toBe(false);
  });

  it('takes a foreign funder’s own number, but not a mistyped Spanish one or anything else', () => {
    expect(isValidTaxId('981234567')).toBe(true);
    expect(isValidTaxId('EIN123456789')).toBe(true);
    expect(isValidTaxId('1234567AB')).toBe(true);
    expect(isValidTaxId('12345678A')).toBe(false);
    expect(isValidTaxId('')).toBe(false);
    expect(isValidTaxId('ABC-123')).toBe(false);
    expect(isValidTaxId('A'.repeat(21))).toBe(false);
  });
});

describe('IBANs', () => {
  it('checks the digits, and a Spanish one’s length', () => {
    expect(isValidIban(normaliseIban('es55 0000 0000 0000 0000 0001'))).toBe(true);
    expect(isValidIban('ES5600000000000000000001')).toBe(false);
    expect(isValidIban('ES550000000000000000001')).toBe(false);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    expect(isValidIban('GB82WEST1234569876543')).toBe(false);
    expect(isValidIban('no es un iban')).toBe(false);
  });

  it('writes one in groups of four', () => {
    expect(formatIban('ES5500000000000000000001')).toBe('ES55 0000 0000 0000 0000 0001');
  });
});
