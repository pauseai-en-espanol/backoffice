import { isNullableString, isRecord, isString, readFromApi } from '@/data';

export interface AuditDiff {
  old?: Record<string, unknown>;
  new?: Record<string, unknown>;
  /** Columns holding personal data that changed: named only, never their values (PLAN R2). */
  personal?: string[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: { userId: string; displayName: string } | null;
  channel: 'web' | 'bot' | null;
  action: string;
  table: string;
  rowId: string;
  diff: AuditDiff | null;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** The cursor for older entries, or null when these are the oldest. */
  next: string | null;
}

/** Entries per page. */
export const AUDIT_PAGE_SIZE = 50;

const isDiff = (value: unknown): value is AuditDiff =>
  isRecord(value) &&
  (value.old === undefined || isRecord(value.old)) &&
  (value.new === undefined || isRecord(value.new)) &&
  (value.personal === undefined ||
    (Array.isArray(value.personal) && value.personal.every(isString)));

const isEntry = (value: unknown): value is AuditEntry =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.at) &&
  (value.actor === null ||
    (isRecord(value.actor) && isString(value.actor.userId) && isString(value.actor.displayName))) &&
  (value.channel === null || value.channel === 'web' || value.channel === 'bot') &&
  isString(value.action) &&
  isString(value.table) &&
  isString(value.rowId) &&
  (value.diff === null || isDiff(value.diff));

/** `GET /api/audit`'s body, or undefined if it isn't one. */
export const parseAuditPage = (body: unknown): AuditPage | undefined =>
  isRecord(body) &&
  Array.isArray(body.entries) &&
  body.entries.every(isEntry) &&
  isNullableString(body.next)
    ? { entries: body.entries, next: body.next }
    : undefined;

/** A cursor as the address carries it: an entry's id, digits only; anything else is the first page. */
export const cursorFrom = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' && /^[1-9]\d{0,18}$/u.test(value) ? value : undefined;

/** The newest entries, or those older than `before`. Admins only (the API refuses anyone else). */
export const getAuditPage = (before: string | undefined) =>
  readFromApi(
    `/api/audit?limit=${AUDIT_PAGE_SIZE}${before === undefined ? '' : `&before=${before}`}`,
    parseAuditPage,
  );

/** The fields an entry changed: those whose values the log keeps, and the personal ones it only names. */
export const changedFields = (diff: AuditDiff | null): { fields: string[]; personal: string[] } => {
  if (!diff) {
    return { fields: [], personal: [] };
  }
  const personal = diff.personal ?? [];
  const fields = [...new Set([...Object.keys(diff.old ?? {}), ...Object.keys(diff.new ?? {})])]
    .filter((field) => !personal.includes(field))
    .sort();
  return { fields, personal: [...personal].sort() };
};
