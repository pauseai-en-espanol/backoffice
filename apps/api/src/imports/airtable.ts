import { normalizeAirtableId, normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { normalizeCountry } from '@backoffice/domain/places';

import type { IntakePayload } from '../people/intake.js';

/**
 * Global's Airtable view of Spain's signups, read through its shared link (ADR-0005, D2). The link is all we have, so
 * this reads the view the way its page does: the page embeds a signed URL for the view's data, which answers JSON with
 * the columns and rows. Undocumented, so it may break: every failure is loud and imports nothing, and the CSV import is
 * the fallback. The link is a credential: never logged, never in an error.
 *
 * Checked on 2026-10-15 against the real view (structure only, no values read): the page loads without a browser,
 * the data answers with `data.table.columns` and `data.table.rows`, and the share allows `downloadCsv`.
 */

/**
 * Why a run imported nothing: the link isn't a shared view's, its page or data couldn't be read, or its columns changed;
 * `key`, the link admins set doesn't open with this deployment's key; `off`, the sync is off or has no link.
 */
export type AirtableFailure = 'link' | 'page' | 'data' | 'columns' | 'key' | 'off';

export class AirtableError extends Error {
  constructor(readonly reason: AirtableFailure) {
    super(`The Airtable view could not be read (${reason})`);
  }
}

interface Column {
  id: string;
  name: string;
  type: string;
  typeOptions?: { choices?: Record<string, { id: string; name: string }> };
}

interface Row {
  id: string;
  /** When the signup was made, if the view says (Airtable's own field on each record). */
  createdTime?: unknown;
  cellValuesByColumnId: Record<string, unknown>;
}

export interface SharedView {
  columns: Column[];
  rows: Row[];
}

/** Like a browser's: the page refuses clients it doesn't recognise. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const TIMEOUT_MS = 20_000;

/** A shared view's address: https://airtable.com/app…/shr… (with or without a trailing view id or query). */
export const isSharedViewUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.host === 'airtable.com' &&
      /\/shr[A-Za-z0-9]{14}/u.test(url.pathname)
    );
  } catch {
    return false;
  }
};

/** Reads the view's columns and rows. Rejects with AirtableError, whose message never holds the link. */
export const readSharedView = async (
  link: string,
  { fetch: send = globalThis.fetch }: { fetch?: typeof globalThis.fetch } = {},
): Promise<SharedView> => {
  if (!isSharedViewUrl(link)) {
    throw new AirtableError('link');
  }
  let html: string;
  try {
    const page = await send(link, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html',
        'accept-language': 'es-ES,es;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!page.ok) {
      throw new AirtableError('page');
    }
    html = await page.text();
  } catch (error) {
    throw error instanceof AirtableError ? error : new AirtableError('page');
  }
  const at = html.indexOf('urlWithParams');
  const found = /urlWithParams"?\s*:\s*"([^"]+)"/u.exec(html.slice(at, at + 4000));
  if (at === -1 || !found?.[1]) {
    throw new AirtableError('page');
  }
  let dataUrl: URL;
  let applicationId: string;
  try {
    dataUrl = new URL(JSON.parse(`"${found[1]}"`) as string, 'https://airtable.com');
    applicationId =
      (JSON.parse(dataUrl.searchParams.get('accessPolicy') ?? '{}') as { applicationId?: string })
        .applicationId ?? '';
  } catch {
    throw new AirtableError('page');
  }
  if (
    dataUrl.host !== 'airtable.com' ||
    !/^\/v0\.3\/view\/viw[A-Za-z0-9]+\/readSharedViewData$/u.test(dataUrl.pathname)
  ) {
    throw new AirtableError('page');
  }
  let body: unknown;
  try {
    const data = await send(dataUrl, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-airtable-application-id': applicationId,
        'x-time-zone': 'Europe/Madrid',
        'x-user-locale': 'es',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!data.ok) {
      throw new AirtableError('data');
    }
    body = await data.json();
  } catch (error) {
    throw error instanceof AirtableError ? error : new AirtableError('data');
  }
  const table = (body as { data?: { table?: { columns?: unknown; rows?: unknown } } }).data?.table;
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
    throw new AirtableError('data');
  }
  return { columns: table.columns as Column[], rows: table.rows as Row[] };
};

/** The columns the sync reads, by their names in Global's view; the first two must be there. */
export const COLUMNS = {
  name: 'Full name',
  email: 'Email',
  email2: 'Email 2',
  phone: 'Phone',
  city: 'City',
  country: 'Country',
  languages: 'Languages',
  discovery: 'Discovery method of PAI',
  chapterPermission: 'GDPR chapter share permission',
  duplicate: 'duplicate',
} as const;

const REQUIRED: readonly (keyof typeof COLUMNS)[] = ['name', 'email'];

/** Global's language options, in Spanish; "Other" and unknown ones are left out. */
const LANGUAGES: Readonly<Record<string, string>> = {
  english: 'Inglés',
  spanish: 'Español',
  español: 'Español',
  espacian: 'Español',
  french: 'Francés',
  français: 'Francés',
  italian: 'Italiano',
  português: 'Portugués',
  portuguese: 'Portugués',
  nederlands: 'Neerlandés',
  dutch: 'Neerlandés',
  deutsch: 'Alemán',
  german: 'Alemán',
  čeština: 'Checo',
  catalan: 'Catalán',
  català: 'Catalán',
  galician: 'Gallego',
  galego: 'Gallego',
  basque: 'Euskera',
  euskara: 'Euskera',
};

export interface MappedView {
  records: { external_id: string; payload: IntakePayload }[];
  skipped: { noPermission: number; duplicate: number; invalid: number };
}

/** The day, in Madrid, of an Airtable timestamp; undefined if it isn't one. */
const madridDay = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
  return /^\d{4}-\d{2}-\d{2}$/u.test(parts) ? parts : undefined;
};

/**
 * Turns the view into intake records, copying only the mapped fields (ADR-0005): the name, emails, phone, town,
 * country, languages and how they heard of PauseAI; where they came from is always Global's form, and they arrived the day
 * they signed up, when the row says (PLAN M5). A row Global marks as a duplicate is left out; so is one without the
 * chapter-share permission, if `requirePermission` is set (by default it isn't: PLAN R14).
 */
export const mapSharedView = (
  view: SharedView,
  { requirePermission }: { requirePermission: boolean },
): MappedView => {
  const byName = new Map(view.columns.map((column) => [column.name, column]));
  const missing = REQUIRED.filter((key) => !byName.has(COLUMNS[key]));
  if (missing.length > 0) {
    throw new AirtableError('columns');
  }
  const cell = (row: Row, key: keyof typeof COLUMNS): unknown => {
    const column = byName.get(COLUMNS[key]);
    return column ? row.cellValuesByColumnId[column.id] : undefined;
  };
  const choiceName = (key: keyof typeof COLUMNS, id: unknown): string | undefined => {
    const column = byName.get(COLUMNS[key]);
    return typeof id === 'string'
      ? (column?.typeOptions?.choices?.[id]?.name ?? undefined)
      : undefined;
  };
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

  const skipped = { noPermission: 0, duplicate: 0, invalid: 0 };
  const records: MappedView['records'] = [];
  for (const row of view.rows) {
    const id = normalizeAirtableId(row.id);
    const name = text(cell(row, 'name'));
    if (!id || !name) {
      skipped.invalid += 1;
      continue;
    }
    if (cell(row, 'duplicate') === true) {
      skipped.duplicate += 1;
      continue;
    }
    if (requirePermission && cell(row, 'chapterPermission') !== true) {
      skipped.noPermission += 1;
      continue;
    }
    const emails = [text(cell(row, 'email')), text(cell(row, 'email2'))]
      .map((raw) => (raw === undefined ? undefined : normalizeEmail(raw)))
      .filter((email): email is string => email !== undefined);
    const phone = text(cell(row, 'phone'));
    const phones =
      phone === undefined
        ? []
        : [normalizePhone(phone)].filter((p): p is string => p !== undefined);
    const languagesCell = cell(row, 'languages');
    const languages = [
      ...new Set(
        (Array.isArray(languagesCell) ? languagesCell : [])
          .map((choice) => choiceName('languages', choice)?.trim().toLowerCase())
          .map((language) => (language === undefined ? undefined : LANGUAGES[language]))
          .filter((language): language is string => language !== undefined),
      ),
    ];
    const town = text(cell(row, 'city'));
    // Global's country, a choice or text, by its name ("Spain"): kept as its code (PLAN R74).
    const countryCell = cell(row, 'country');
    const countryWord = choiceName('country', countryCell) ?? text(countryCell);
    const country = countryWord === undefined ? undefined : normalizeCountry(countryWord);
    const discovery = choiceName('discovery', cell(row, 'discovery'));
    const signedUp = madridDay(row.createdTime);
    records.push({
      external_id: id,
      payload: {
        name: name.slice(0, 200),
        airtable_id: id,
        arrival: 'airtable',
        ...(signedUp ? { arrived_on: signedUp } : {}),
        ...(emails.length > 0 ? { emails: [...new Set(emails)] } : {}),
        ...(phones.length > 0 ? { phones } : {}),
        ...(town ? { town: town.slice(0, 100) } : {}),
        ...(country ? { country } : {}),
        ...(languages.length > 0 ? { languages } : {}),
        ...(discovery ? { how_heard: discovery.slice(0, 500) } : {}),
      },
    });
  }
  return { records, skipped };
};
