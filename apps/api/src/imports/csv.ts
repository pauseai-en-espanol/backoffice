import { normalizeDiscord, normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { parse } from 'csv-parse/sync';

import type { IntakePayload } from '../people/intake.js';

/**
 * CSV imports (onboarding spec, web and CSV): any one-off list, and Airtable whenever the shared-view sync breaks (its
 * CSV download). The staff app uploads the text; the API reads it, suggests a mapping, previews it and, on apply,
 * hands the mapped rows to the database. Nothing here keeps the file.
 */

export const CSV_FIELDS = [
  'name',
  'preferredName',
  'email',
  'phone',
  'province',
  'town',
  'chat',
  'note',
  'stage',
  'discord',
  'arrival',
  'arrivedOn',
] as const;
export type CsvField = (typeof CSV_FIELDS)[number];

/** The most rows one import takes (the database's limit too). */
export const MAX_ROWS = 5000;

export class CsvError extends Error {
  constructor(readonly reason: 'empty' | 'unreadable' | 'tooManyRows') {
    super(reason);
  }
}

export interface ParsedCsv {
  columns: string[];
  rows: string[][];
}

/** Reads CSV as people export it: comma, semicolon or tab, a byte-order mark or none, a header row. */
export const parseCsv = (text: string): ParsedCsv => {
  let records: string[][];
  try {
    records = parse(text, {
      bom: true,
      delimiter: [',', ';', '\t'],
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new CsvError('unreadable');
  }
  const [header, ...rows] = records;
  if (!header || header.every((cell) => cell === '')) {
    throw new CsvError('empty');
  }
  if (rows.length > MAX_ROWS) {
    throw new CsvError('tooManyRows');
  }
  return { columns: header, rows };
};

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, ' ')
    .trim();

/** Header words for each field, folded, in Spanish and English (Airtable's and Global's own included). */
const SYNONYMS: Readonly<Record<CsvField, readonly string[]>> = {
  name: ['nombre', 'nombre completo', 'nombre y apellidos', 'name', 'full name'],
  preferredName: [
    'apodo',
    'nombre preferido',
    'como quiere que le llamen',
    'preferred name',
    'nickname',
  ],
  email: ['email', 'e mail', 'correo', 'correo electronico', 'mail'],
  phone: ['telefono', 'movil', 'phone', 'whatsapp', 'numero', 'telefono movil', 'mobile'],
  province: ['provincia', 'province'],
  town: ['ciudad', 'localidad', 'municipio', 'pueblo', 'city', 'town'],
  chat: ['chat', 'grupo', 'grupo de whatsapp'],
  note: ['nota', 'notas', 'comentario', 'comentarios', 'observaciones', 'note', 'notes'],
  stage: ['estado', 'etapa', 'stage'],
  discord: ['discord', 'usuario de discord', 'discord username'],
  arrival: ['llego por', 'por donde llego', 'canal', 'via', 'origen'],
  arrivedOn: ['llego el', 'fecha de llegada', 'llegada', 'fecha de alta', 'arrived', 'arrived on'],
};

/** A first guess at which column is which field: each field at most once, the first matching column. */
export const suggestMapping = (columns: readonly string[]): Record<string, CsvField> => {
  const mapping: Record<string, CsvField> = {};
  const taken = new Set<CsvField>();
  for (const column of columns) {
    const folded = fold(column);
    const field = CSV_FIELDS.find(
      (candidate) => !taken.has(candidate) && SYNONYMS[candidate].includes(folded),
    );
    if (field) {
      mapping[column] = field;
      taken.add(field);
    }
  }
  return mapping;
};

/**
 * The stages an import may set (onboarding spec: existing members come in as these), by id or Spanish label. "Por
 * clasificar" is no longer a stage (PLAN M5): someone so marked comes in as new.
 */
const STAGE_WORDS: Readonly<Record<string, IntakePayload['stage']>> = {
  to_triage: 'new',
  'por clasificar': 'new',
  new: 'new',
  nuevo: 'new',
  nueva: 'new',
  welcomed: 'welcomed',
  'bienvenida hecha': 'welcomed',
  active: 'active',
  activo: 'active',
  activa: 'active',
};

/**
 * "Llegó el" as spreadsheets write it: day/month/year (Spain's way, with `/`, `-` or `.`, a two-digit year in this
 * century) or year-month-day. Undefined if it isn't a real date.
 */
export const readDate = (raw: string): string | undefined => {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(text);
  const spanish = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/u.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : spanish
      ? [
          Number(spanish[3]) + (spanish[3]?.length === 2 ? 2000 : 0),
          Number(spanish[2]),
          Number(spanish[1]),
        ]
      : [Number.NaN, Number.NaN, Number.NaN];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined;
};

export interface MappedRows {
  rows: { payload: IntakePayload }[];
  /** 1-based, counting the header as row 1, as a spreadsheet numbers them. */
  invalid: { row: number; field: CsvField }[];
}

/**
 * Applies a mapping (column → field): emails, phones and Discord usernames normalised, stages read in Spanish or
 * English, "Llegó el" as a date (an empty cell, when the column is there: nobody knows; PLAN M5) and "Llegó por" as
 * written (the database matches it to the list, or leaves it empty). A row without a name, or with an email, phone,
 * Discord username, stage or date that isn't one, is left out and listed as invalid.
 */
export const mapRows = (
  parsed: ParsedCsv,
  mapping: Readonly<Record<string, CsvField>>,
): MappedRows => {
  const index = new Map<CsvField, number[]>();
  parsed.columns.forEach((column, at) => {
    const field = mapping[column];
    if (field) {
      index.set(field, [...(index.get(field) ?? []), at]);
    }
  });
  const values = (row: string[], field: CsvField): string[] =>
    (index.get(field) ?? []).map((at) => (row[at] ?? '').trim()).filter((value) => value !== '');
  const rows: MappedRows['rows'] = [];
  const invalid: MappedRows['invalid'] = [];
  parsed.rows.forEach((row, at) => {
    const line = at + 2;
    const name = values(row, 'name').join(' ');
    if (name === '') {
      invalid.push({ row: line, field: 'name' });
      return;
    }
    const emails = values(row, 'email').map((raw) => normalizeEmail(raw));
    const phones = values(row, 'phone').map((raw) => normalizePhone(raw));
    if (emails.some((email) => email === undefined)) {
      invalid.push({ row: line, field: 'email' });
      return;
    }
    if (phones.some((phone) => phone === undefined)) {
      invalid.push({ row: line, field: 'phone' });
      return;
    }
    const discords = values(row, 'discord').map((raw) => normalizeDiscord(raw));
    if (discords.some((discord) => discord === undefined)) {
      invalid.push({ row: line, field: 'discord' });
      return;
    }
    const arrivedWord = values(row, 'arrivedOn')[0];
    const arrivedOn = arrivedWord === undefined ? undefined : readDate(arrivedWord);
    if (arrivedWord !== undefined && arrivedOn === undefined) {
      invalid.push({ row: line, field: 'arrivedOn' });
      return;
    }
    const stageWord = values(row, 'stage')[0];
    const stage =
      stageWord === undefined
        ? undefined
        : (STAGE_WORDS[fold(stageWord).replaceAll(' ', '_')] ?? STAGE_WORDS[fold(stageWord)]);
    if (stageWord !== undefined && stage === undefined) {
      invalid.push({ row: line, field: 'stage' });
      return;
    }
    const first = (field: CsvField) => values(row, field)[0];
    const payload: IntakePayload = {
      name: name.slice(0, 200),
      ...(first('preferredName') ? { preferred_name: first('preferredName') } : {}),
      ...(emails.length > 0 ? { emails: [...new Set(emails as string[])] } : {}),
      ...(phones.length > 0 ? { phones: [...new Set(phones as string[])] } : {}),
      ...(discords.length > 0 ? { discords: [...new Set(discords as string[])] } : {}),
      ...(index.has('arrivedOn') ? { arrived_on: arrivedOn ?? null } : {}),
      ...(first('arrival') ? { arrival: first('arrival') } : {}),
      ...(first('province') ? { province: first('province') } : {}),
      ...(first('town') ? { town: first('town') } : {}),
      ...(first('chat') ? { chat: first('chat') } : {}),
      ...(values(row, 'note').length > 0
        ? { note: values(row, 'note').join('. ').slice(0, 4000) }
        : {}),
      ...(stage ? { stage } : {}),
    };
    rows.push({ payload });
  });
  return { rows, invalid };
};
