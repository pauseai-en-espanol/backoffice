import { describe, expect, it } from 'vitest';

import { getFormatter, getTranslator, isLocale, LOCALES, messages } from './messages.js';

const values = (value: unknown): string[] =>
  value !== null && typeof value === 'object'
    ? Object.values(value).flatMap(values)
    : [String(value)];

describe('messages', () => {
  it('has Spanish, and only Spanish (D6)', () => {
    expect(LOCALES).toEqual(['es']);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(false);
  });

  it('has no empty string', () => {
    expect(values(messages.es).filter((text) => text.trim() === '')).toEqual([]);
  });

  it('formats an email with its values', () => {
    const t = getTranslator();
    expect(t('email.invitation.subject', { product: 'Backoffice de ejemplo' })).toBe(
      'Te invitan a Backoffice de ejemplo',
    );
  });

  it("shows times in Madrid's time zone whatever the process's", () => {
    const zone = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Auckland';
      // 23:30 UTC on 14 October is 01:30 on the 15th in Madrid (CEST).
      expect(
        getFormatter().dateTime(new Date('2026-10-14T23:30:00Z'), {
          day: 'numeric',
          hour: 'numeric',
        }),
      ).toMatch(/^15,? 1/u);
    } finally {
      process.env.TZ = zone;
    }
  });
});
