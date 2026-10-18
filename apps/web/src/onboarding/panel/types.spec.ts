import { describe, expect, it } from 'vitest';

import { barShare, parsePanel, waitIn, weeksFrom, weekTotal } from './types';

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

  it('totals each week', () => {
    expect(weekTotal({ week: 'w', counts: { a: 2, b: 3 } })).toBe(5);
  });

  it('says a wait in hours, or in days from two days on', () => {
    expect(waitIn(5.4)).toEqual({ unit: 'hours', amount: 5 });
    expect(waitIn(47.9)).toEqual({ unit: 'hours', amount: 48 });
    expect(waitIn(72)).toEqual({ unit: 'days', amount: 3 });
  });
});

describe('the Panel draws its bars to scale (PLAN R66)', () => {
  it('fills the largest, halves the half, and leaves nothing for none', () => {
    expect(barShare(424, 424)).toBe(100);
    expect(barShare(212, 424)).toBe(50);
    expect(barShare(1, 3)).toBe(33.3);
    expect(barShare(0, 424)).toBe(0);
    expect(barShare(0, 0)).toBe(0);
  });
});
