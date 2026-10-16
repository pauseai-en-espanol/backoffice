import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';

import { formText } from '@/auth/client';

import type { PersonChange } from './actions';
import type { PersonDetail, Settings } from './types';

import { isMappingField, type MappingField, suggestMapping } from './csv-mapping';
import { countsOf } from './types';

/** What the onboarding forms send: only what changed, trimmed, in the API's shapes. Pure, so it is tested here. */

/** A list typed with a separator, without blanks or repeats: "castellano, catalán", or one chat a line. */
export const listFrom = (value: string, separator: string | RegExp): string[] => [
  ...new Set(
    value
      .split(separator)
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  ),
];

/** A text field as the API takes it: trimmed, and null when emptied. */
const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export type Profile = Pick<
  PersonDetail,
  | 'id'
  | 'fullName'
  | 'preferredName'
  | 'province'
  | 'town'
  | 'languages'
  | 'pronouns'
  | 'availability'
  | 'howHeard'
>;

/** A profile's changes (every change goes to the timeline, so nothing is sent for nothing). */
export const profileChange = (profile: Profile, read: (name: string) => string): PersonChange => {
  const change: PersonChange = {};
  // Someone without a name yet (PLAN R37) may stay so; a name, once there, is only ever changed, never emptied.
  const fullName = read('fullName').trim();
  if (fullName !== (profile.fullName ?? '')) {
    change.fullName = fullName;
  }
  for (const key of ['preferredName', 'province', 'town', 'pronouns', 'howHeard'] as const) {
    const value = optional(read(key));
    if (value !== profile[key]) {
      change[key] = value;
    }
  }
  const availability = optional(read('availability'));
  if (availability !== profile.availability) {
    change.availability = availability;
  }
  const languages = listFrom(read('languages'), ',');
  if (languages.join('\n') !== profile.languages.join('\n')) {
    change.languages = languages;
  }
  return change;
};

/** Reads a form's text fields for profileChange and settingsChange. */
export const fieldsOf = (form: HTMLFormElement) => (name: string) => formText(form, name);

export const SETTINGS_NUMBERS = [
  ['followUpDays', 1, 60, 1],
  ['unresponsiveAttempts', 1, 20, 1],
  ['unresponsiveDays', 1, 180, 1],
  ['unassignedAlertHours', 1, 720, 1],
  ['matchThreshold', 0.3, 1, 0.05],
] as const;

/** The settings' changes; a number left empty or not a number is left as it was. A decimal comma is a point. */
export const settingsChange = (
  settings: Settings,
  read: (name: string) => string,
): Partial<Settings> => {
  const change: Partial<Settings> = {};
  for (const [key] of SETTINGS_NUMBERS) {
    const raw = read(key).trim().replace(',', '.');
    const value = Number(raw);
    if (raw !== '' && Number.isFinite(value) && value !== settings[key]) {
      change[key] = value;
    }
  }
  const chats = listFrom(read('communityChats'), '\n');
  if (chats.join('\n') !== settings.communityChats.join('\n')) {
    change.communityChats = chats;
  }
  return change;
};

/** What a typed phone or email will be stored as, for the hint under its field; undefined if it isn't one. */
export const normalised = (kind: 'email' | 'phone', value: string): string | undefined =>
  value.trim() === ''
    ? undefined
    : kind === 'email'
      ? normalizeEmail(value)
      : normalizePhone(value);

/** The stages a quick-add may start someone in (onboarding spec: existing members come in as these). */
export const QUICK_ADD_STAGES = ['new', 'to_triage', 'welcomed', 'active'] as const;

export type QuickAddProblem = 'contact' | 'phone' | 'email' | 'choice';

/**
 * A quick-add's problems before it is sent, in the order they're said. The name is optional: most arrivals come with
 * only a phone (PLAN R37), and staff add the name later.
 */
export const quickAddProblems = (values: {
  name: string;
  phone: string;
  email: string;
  candidates: number;
  choice: string;
}): QuickAddProblem[] => {
  const problems: QuickAddProblem[] = [];
  if (values.phone.trim() === '' && values.email.trim() === '') {
    problems.push('contact');
  }
  if (values.phone.trim() !== '' && normalizePhone(values.phone) === undefined) {
    problems.push('phone');
  }
  if (values.email.trim() !== '' && normalizeEmail(values.email) === undefined) {
    problems.push('email');
  }
  if (values.candidates > 0 && values.choice === '') {
    problems.push('choice');
  }
  return problems;
};

/** At most what the API takes for one import (docs/spec/staff-api.md: a CSV import's body is at most 1 MB). */
export const MAX_CSV_BYTES = 1024 * 1024;

export interface CsvAnalysis {
  columns: string[];
  mapping: Record<string, MappingField | 'ignore'>;
  preview: Record<string, unknown>[];
  invalid: { row: string; field: string }[];
  counts: Record<string, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const word = (value: unknown, fallback: string): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;

/**
 * A CSV dry run's answer: the columns, the API's mapping when it gives one (a column it leaves out is ignored) or else
 * a guess from the headers, the first rows mapped, the rows with values that don't do, and what applying would do.
 */
export const parseAnalysis = (body: Record<string, unknown>): CsvAnalysis | undefined => {
  if (!Array.isArray(body.columns) || !body.columns.every((column) => typeof column === 'string')) {
    return undefined;
  }
  const columns = body.columns as string[];
  const given = body.mapping;
  const mapping: Record<string, MappingField | 'ignore'> =
    isRecord(given) && Object.keys(given).length > 0
      ? Object.fromEntries(
          columns.map((column) => {
            const field = given[column];
            return [column, isMappingField(field) ? field : 'ignore'];
          }),
        )
      : suggestMapping(columns);
  return {
    columns,
    mapping,
    preview: Array.isArray(body.preview) ? body.preview.filter(isRecord).slice(0, 20) : [],
    invalid: Array.isArray(body.invalid)
      ? body.invalid
          .filter(isRecord)
          .map((entry) => ({ row: word(entry.row, '?'), field: word(entry.field, '') }))
      : [],
    counts: countsOf(body.counts),
  };
};
