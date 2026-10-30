import { describe, expect, it } from 'vitest';

import { formatDay, isDay, madridToday, parseDay } from './days.js';

describe('parseDay', () => {
  it('reads a day written day first, or as a date field sends it', () => {
    expect(parseDay('30/10/2026')).toBe('2026-10-30');
    expect(parseDay('1-2-2026')).toBe('2026-02-01');
    expect(parseDay(' 29.02.2028 ')).toBe('2028-02-29');
    expect(parseDay('2026-10-30')).toBe('2026-10-30');
  });

  it('refuses dates that don’t exist, two-digit years and month-first dates', () => {
    for (const text of [
      '31/02/2026',
      '29/02/2027',
      '30/10/26',
      '10/30/2026',
      '2026-10-3',
      '',
      'hoy',
    ]) {
      expect({ text, day: parseDay(text) }).toEqual({ text, day: undefined });
    }
  });
});

describe('formatDay', () => {
  it('writes a day the Spanish way', () => {
    expect(formatDay('2026-10-30')).toBe('30/10/2026');
    expect(parseDay(formatDay('2026-01-05'))).toBe('2026-01-05');
    expect(formatDay('mañana')).toBe('mañana');
  });
});

describe('isDay', () => {
  it('takes only real days in ISO form', () => {
    expect(isDay('2026-10-30')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('30/10/2026')).toBe(false);
    expect(isDay(20_261_030)).toBe(false);
  });
});

describe('madridToday', () => {
  it("is Madrid's day, whatever the server's", () => {
    // 23:30 UTC on 30 October 2026 is already the 31st in Madrid (CET, UTC+1).
    expect(madridToday(new Date('2026-10-30T23:30:00Z'))).toBe('2026-10-31');
    expect(madridToday(new Date('2026-10-30T22:30:00Z'))).toBe('2026-10-30');
  });
});
