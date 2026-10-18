import { isStage, type Stage } from '@backoffice/domain/stages';

import { parseSummary, type PersonSummary } from '../types';

/** The Panel (docs/spec/staff-api.md, M4), as the API answers it, checked before the page shows it. */
export interface Panel {
  weeks: number;
  stages: Partial<Record<Stage, number>>;
  arrivals: { week: string; counts: Record<string, number> }[];
  /** The same arrivals by "Llegó por" (PLAN M5): each week's counts by an entry's id, `none` for not said. */
  arrivalsByChannel: {
    channels: { id: string; label: string }[];
    weeks: { week: string; counts: Record<string, number> }[];
  };
  /** People whose arrival nobody knows, left out of the weeks and the waits. */
  unknownArrival: number;
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
  // An older API sends neither: no breakdown, and nobody without a date.
  const byChannel = isRecord(value.arrivalsByChannel) ? value.arrivalsByChannel : {};
  const channels: Panel['arrivalsByChannel']['channels'] = [];
  for (const item of Array.isArray(byChannel.channels) ? byChannel.channels : []) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.label !== 'string') {
      return undefined;
    }
    channels.push({ id: item.id, label: item.label });
  }
  const channelWeeks: Panel['arrivalsByChannel']['weeks'] = [];
  for (const item of Array.isArray(byChannel.weeks) ? byChannel.weeks : []) {
    const weekCounts = isRecord(item) ? counts(item.counts) : undefined;
    if (!isRecord(item) || typeof item.week !== 'string' || !weekCounts) {
      return undefined;
    }
    channelWeeks.push({ week: item.week, counts: weekCounts });
  }
  const unknownArrival = value.unknownArrival === undefined ? 0 : value.unknownArrival;
  if (!count(unknownArrival)) {
    return undefined;
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
    arrivalsByChannel: { channels, weeks: channelWeeks },
    unknownArrival,
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

/**
 * The columns of "Altas por semana": the entries anyone came from in these weeks, in the list's order, then "not
 * said" (`none`) if anyone's isn't.
 */
export const channelsIn = (
  byChannel: Panel['arrivalsByChannel'],
): { id: string; label: string | null }[] => {
  const seen = new Set(byChannel.weeks.flatMap((week) => Object.keys(week.counts)));
  return [
    ...byChannel.channels.filter((channel) => seen.has(channel.id)),
    ...(seen.has('none') ? [{ id: 'none', label: null }] : []),
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

/**
 * A bar's length, as a share of the longest (PLAN R66): drawn to scale, so the stage with most people fills its row and
 * none is a bar of nothing. A percentage, 0 to 100.
 */
export const barShare = (count: number, most: number): number =>
  most <= 0 ? 0 : Math.round((Math.max(0, count) / most) * 1000) / 10;
