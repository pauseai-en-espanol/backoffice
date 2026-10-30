import { describe, expect, it } from 'vitest';

import { formatEuros, formatEurosPlain, MAX_CENTS, parseEuros } from './money.js';

describe('parseEuros', () => {
  it('reads amounts the Spanish way, as whole cents', () => {
    expect(parseEuros('1.234,56 €')).toBe(123_456);
    expect(parseEuros('1234,56')).toBe(123_456);
    expect(parseEuros('1.234')).toBe(123_400);
    expect(parseEuros('12,5')).toBe(1250);
    expect(parseEuros('0,05')).toBe(5);
    expect(parseEuros('€ 30')).toBe(3000);
    expect(parseEuros(' 1.000.000,00\u00a0€ ')).toBe(100_000_000);
    expect(parseEuros('0')).toBe(0);
  });

  it('refuses what isn’t Spanish, a sign, a third decimal, or more than the books take', () => {
    for (const text of [
      '12.34',
      '1,234.56',
      '1.23,45',
      '-5',
      '+5',
      '1,234',
      '',
      '€',
      'doce',
      '1.2345',
      ',5',
    ]) {
      expect({ text, cents: parseEuros(text) }).toEqual({ text, cents: undefined });
    }
    expect(parseEuros('999.999.999,99')).toBe(MAX_CENTS);
    expect(parseEuros('1.000.000.000,00')).toBeUndefined();
    expect(parseEuros('99999999999999999999')).toBeUndefined();
  });
});

describe('formatEuros', () => {
  it('writes cents the Spanish way, thousands always grouped', () => {
    expect(formatEuros(123_456)).toBe('1.234,56 €');
    expect(formatEuros(5)).toBe('0,05 €');
    expect(formatEuros(0)).toBe('0,00 €');
    expect(formatEuros(-100_000_000)).toBe('-1.000.000,00 €');
    expect(formatEuros(BigInt(MAX_CENTS))).toBe('999.999.999,99 €');
  });

  it('reads back what it writes', () => {
    for (const cents of [1, 99, 100, 123_456, 100_000_000, MAX_CENTS]) {
      expect(parseEuros(formatEuros(cents))).toBe(cents);
    }
  });

  it('writes a plain number for a spreadsheet set to Spanish', () => {
    expect(formatEurosPlain(123_456)).toBe('1234,56');
    expect(formatEurosPlain(-5)).toBe('-0,05');
  });
});
