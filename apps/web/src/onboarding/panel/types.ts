import { isStage, type Stage } from '@backoffice/domain/stages';

import { parseSummary, type PersonSummary } from '../types';

/** The Panel (docs/spec/staff-api.md, M4), as the API answers it, checked before the page shows it. */
export interface Panel {
  weeks: number;
  stages: Partial<Record<Stage, number>>;
  arrivals: { week: string; counts: Record<string, number> }[];
  firstContact: {
    arrived: number;
    contacted: number;
    medianHours: number | null;
    p90Hours: number | null;
  };
  unassigned: { count: number; people: PersonSummary[] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const hours = (value: unknown): number | null | undefined =>
  value === null ? null : typeof value === 'number' && value >= 0 ? value : undefined;

const counts = (value: unknown): Record<string, number> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(value)) {
    if (!count(n)) {
      return undefined;
    }
    out[key] = n;
  }
  return out;
};

export const parsePanel = (value: unknown): Panel | undefined => {
  if (!isRecord(value) || !count(value.weeks) || !Array.isArray(value.arrivals)) {
    return undefined;
  }
  const byStage = counts(value.stages);
  const first = isRecord(value.firstContact) ? value.firstContact : {};
  const median = hours(first.medianHours);
  const p90 = hours(first.p90Hours);
  const unassigned = isRecord(value.unassigned) ? value.unassigned : {};
  if (
    !byStage ||
    !Object.keys(byStage).every(isStage) ||
    !count(first.arrived) ||
    !count(first.contacted) ||
    median === undefined ||
    p90 === undefined ||
    !count(unassigned.count) ||
    !Array.isArray(unassigned.people)
  ) {
    return undefined;
  }
  const arrivals: Panel['arrivals'] = [];
  for (const item of value.arrivals) {
    const weekCounts = isRecord(item) ? counts(item.counts) : undefined;
    if (!isRecord(item) || typeof item.week !== 'string' || !weekCounts) {
      return undefined;
    }
    arrivals.push({ week: item.week, counts: weekCounts });
  }
  const people: PersonSummary[] = [];
  for (const item of unassigned.people) {
    const person = parseSummary(item);
    if (!person) {
      return undefined;
    }
    people.push(person);
  }
  return {
    weeks: value.weeks,
    stages: byStage,
    arrivals,
    firstContact: {
      arrived: first.arrived,
      contacted: first.contacted,
      medianHours: median,
      p90Hours: p90,
    },
    unassigned: { count: unassigned.count, people },
  };
};

/** The weeks the page offers, and the default. */
export const PANEL_WEEKS = [4, 12, 26, 52] as const;
export const DEFAULT_WEEKS = 12;

/** The weeks asked for in the address, if they're one the page offers. */
export const weeksFrom = (value: string | string[] | undefined): number => {
  const asked = Number(Array.isArray(value) ? value[0] : value);
  return (PANEL_WEEKS as readonly number[]).includes(asked) ? asked : DEFAULT_WEEKS;
};

/** The sources that brought anyone in these weeks, in the order given, then any other. */
export const sourcesIn = (arrivals: Panel['arrivals'], order: readonly string[]): string[] => {
  const seen = new Set(arrivals.flatMap((week) => Object.keys(week.counts)));
  return [
    ...order.filter((source) => seen.has(source)),
    ...[...seen].filter((s) => !order.includes(s)).sort(),
  ];
};

/** A week's arrivals from every source. */
export const weekTotal = (week: Panel['arrivals'][number]): number =>
  Object.values(week.counts).reduce((sum, n) => sum + n, 0);

/** Hours as a person reads them: under two days in hours, then in days, rounded. */
export const waitIn = (value: number): { unit: 'hours' | 'days'; amount: number } =>
  value < 48
    ? { unit: 'hours', amount: Math.round(value) }
    : { unit: 'days', amount: Math.round(value / 24) };
