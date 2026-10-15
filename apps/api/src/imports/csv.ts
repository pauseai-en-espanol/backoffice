import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
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

/** The stages an import may set (onboarding spec: existing members come in as these), by id or Spanish label. */
const STAGE_WORDS: Readonly<Record<string, IntakePayload['stage']>> = {
  to_triage: 'to_triage',
  'por clasificar': 'to_triage',
  new: 'new',
  nuevo: 'new',
  nueva: 'new',
  welcomed: 'welcomed',
  'bienvenida hecha': 'welcomed',
  active: 'active',
  activo: 'active',
  activa: 'active',
};

export interface MappedRows {
  rows: { payload: IntakePayload }[];
  /** 1-based, counting the header as row 1, as a spreadsheet numbers them. */
  invalid: { row: number; field: CsvField }[];
}

/**
 * Applies a mapping (column → field): emails and phones normalised, stages read in Spanish or English. A row without
 * a name, or with an email, phone or stage that isn't one, is left out and listed as invalid.
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
