import { afterEach, describe, expect, it } from 'vitest';

import { dueState, formatDay, formatInstant, formatInstantDay, madridToday } from './format';

const zone = process.env.TZ;

afterEach(() => {
  process.env.TZ = zone;
});

describe('dates in Spanish and Madrid time', () => {
  it('shows a calendar day as that day, wherever the server is', () => {
    process.env.TZ = 'Pacific/Auckland';
    expect(formatDay('2026-10-20')).toBe('20 de octubre de 2026');
    expect(formatDay('2026-01-01', 'medium')).toBe('1 ene 2026');
    expect(formatDay('mañana')).toBe('mañana');
  });

  it("shows an instant in Madrid's time", () => {
    // 23:30 UTC on 14 October is 01:30 on the 15th in Madrid (CEST).
    expect(formatInstant('2026-10-14T23:30:00Z')).toMatch(/^15 oct 2026, 1:30$/u);
    expect(formatInstantDay('2026-10-14T23:30:00Z')).toBe('15 de octubre de 2026');
    expect(formatInstant('no-es-fecha')).toBe('no-es-fecha');
  });

  it("knows today's date in Madrid", () => {
    expect(madridToday(new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-15');
    expect(madridToday(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
  });

  it('says whether a due date has passed', () => {
    expect(dueState('2026-10-14', '2026-10-15')).toBe('overdue');
    expect(dueState('2026-10-15', '2026-10-15')).toBe('today');
    expect(dueState('2026-10-16', '2026-10-15')).toBe('later');
  });
});
