/**
 * Calendar days the Spanish way (accounting spec §2): `30/10/2026`, kept as `2026-10-30`. A day is a day wherever it
 * is read: no time zone is involved.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/u;
const SPANISH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/u;

/** `2026-10-30` for the given year, month and day if that date exists; undefined otherwise (`31/02/2026`). */
const dayOf = (year: number, month: number, day: number): string | undefined => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined;
};

/**
 * The day a date written the Spanish way names, day first (`30/10/2026`, `30-10-2026` or `30.10.2026`, with a
 * four-digit year), or as a date field sends it (`2026-10-30`). Undefined if it isn't a real date.
 */
export const parseDay = (text: string): string | undefined => {
  const trimmed = text.trim();
  const iso = ISO.exec(trimmed);
  if (iso) {
    return dayOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const spanish = SPANISH.exec(trimmed);
  return spanish ? dayOf(Number(spanish[3]), Number(spanish[2]), Number(spanish[1])) : undefined;
};

/** `30/10/2026` for `2026-10-30`; anything that isn't a day, as it is. */
export const formatDay = (day: string): string => {
  const iso = ISO.exec(day);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : day;
};

/** Whether a day (`YYYY-MM-DD`) is a real date. */
export const isDay = (value: unknown): value is string =>
  typeof value === 'string' && ISO.test(value) && parseDay(value) === value;

const MADRID_DAY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Madrid',
});

/** Today in Madrid, where the association keeps its books, as `YYYY-MM-DD`. */
export const madridToday = (now: Date = new Date()): string => MADRID_DAY.format(now);
