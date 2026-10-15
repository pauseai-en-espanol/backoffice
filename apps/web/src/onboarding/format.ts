/**
 * Dates as the onboarding pages show them, in Spanish and Madrid's time (staff work in Spain), from server and client
 * code alike: plain Intl, no message formatter. A calendar day (`YYYY-MM-DD`, a next action's due date) is the same
 * day wherever it is shown; an instant is shown in Madrid's time.
 */

export const TIME_ZONE = 'Europe/Madrid';

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

const dayFormats = {
  long: new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeZone: 'UTC' }),
  medium: new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' }),
};

/** "20 de octubre de 2026" for `2026-10-20`; anything that isn't a day, as it is. */
export const formatDay = (day: string, style: 'long' | 'medium' = 'long'): string => {
  if (!DAY.test(day)) {
    return day;
  }
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : dayFormats[style].format(date);
};

const instantFormat = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

const instantDayFormat = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeZone: TIME_ZONE,
});

/** "15 oct 2026, 23:30" in Madrid's time; anything that isn't an instant, as it is. */
export const formatInstant = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : instantFormat.format(date);
};

/** The day an instant falls on in Madrid: "15 de octubre de 2026". */
export const formatInstantDay = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : instantDayFormat.format(date);
};

const isoDay = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: TIME_ZONE,
});

/** Today's date in Madrid, `YYYY-MM-DD`. */
export const madridToday = (now: Date = new Date()): string => isoDay.format(now);

/** Whether a due date has passed, is today, or is still ahead (dates compare as text in this form). */
export const dueState = (due: string, today: string): 'overdue' | 'today' | 'later' =>
  due < today ? 'overdue' : due === today ? 'today' : 'later';
