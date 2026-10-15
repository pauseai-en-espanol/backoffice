import { describe, expect, it } from 'vitest';

import { type Panel, parsePanel, sourcesIn, waitIn, weeksFrom, weekTotal } from './types';

const PANEL = {
  weeks: 2,
  stages: { new: 3, active: 1 },
  arrivals: [
    { week: '2026-10-05', counts: {} as Record<string, number> },
    { week: '2026-10-12', counts: { telegram: 2, airtable: 1 } },
  ],
  firstContact: { arrived: 3, contacted: 2, medianHours: 5.5, p90Hours: 30 },
  unassigned: {
    count: 1,
    people: [
      {
        id: 'p1',
        name: 'Ana',
        fullName: 'Ana Ejemplo',
        stage: 'new',
        owner: null,
        province: null,
        nextAction: null,
        nextActionDue: null,
        reasons: ['unassigned'],
        inCommunity: false,
        sources: ['telegram'],
        createdAt: '2026-10-10T10:00:00Z',
      },
    ],
  },
};

describe('the Panel', () => {
  it('reads what the API answers, and refuses anything else', () => {
    expect(parsePanel(PANEL)).toMatchObject({ weeks: 2, unassigned: { count: 1 } });
    expect(
      parsePanel({
        ...PANEL,
        firstContact: { ...PANEL.firstContact, medianHours: null, p90Hours: null },
      })?.firstContact.medianHours,
    ).toBeNull();
    expect(parsePanel({ ...PANEL, stages: { nope: 1 } })).toBeUndefined();
    expect(
      parsePanel({ ...PANEL, arrivals: [{ week: '2026-10-05', counts: { x: -1 } }] }),
    ).toBeUndefined();
    expect(parsePanel({ ...PANEL, unassigned: { count: 1, people: [{ id: 1 }] } })).toBeUndefined();
    expect(parsePanel(null)).toBeUndefined();
  });

  it('offers a few spans of weeks, twelve by default', () => {
    expect(weeksFrom('26')).toBe(26);
    expect(weeksFrom(['4', '52'])).toBe(4);
    expect(weeksFrom('7')).toBe(12);
    expect(weeksFrom(undefined)).toBe(12);
  });

  it('lists the sources seen, in the usual order, and totals each week', () => {
    const arrivals: Panel['arrivals'] = PANEL.arrivals;
    expect(sourcesIn(arrivals, ['airtable', 'telegram', 'manual'])).toEqual([
      'airtable',
      'telegram',
    ]);
    expect(sourcesIn([{ week: 'w', counts: { zeta: 1, alfa: 1 } }], [])).toEqual(['alfa', 'zeta']);
    expect(weekTotal({ week: 'w', counts: { a: 2, b: 3 } })).toBe(5);
  });

  it('says a wait in hours, or in days from two days on', () => {
    expect(waitIn(5.4)).toEqual({ unit: 'hours', amount: 5 });
    expect(waitIn(47.9)).toEqual({ unit: 'hours', amount: 48 });
    expect(waitIn(72)).toEqual({ unit: 'days', amount: 3 });
  });
});
