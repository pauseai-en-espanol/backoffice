import type { DB } from '@backoffice/db/generated/db';

import { sql, type Transaction } from 'kysely';

/**
 * The audit log (Registro), read in the admin's `withActor` transaction: RLS shows it to admins only, and the audit
 * trigger never writes personal data into it (PLAN R2). Newest first, a page at a time.
 */
export interface AuditEntry {
  id: string;
  at: string;
  /** Who did it, by their staff name; null for the owner or a job. */
  actor: { userId: string; displayName: string | null } | null;
  channel: 'web' | 'bot' | null;
  action: string;
  table: string;
  rowId: string;
  /** What changed: `old` and `new` values by column, without personal data, whose names go in `personal`. */
  diff: unknown;
}

export const AUDIT_PAGE = 50;
export const AUDIT_MAX_PAGE = 100;

const instant = (column: string) => sql<string>`to_json(${sql.ref(column)})#>>'{}'`;

export const listAudit = async (
  trx: Transaction<DB>,
  { before, limit = AUDIT_PAGE }: { before?: string; limit?: number },
): Promise<{ entries: AuditEntry[]; next: string | null }> => {
  const size = Math.min(Math.max(Math.trunc(limit), 1), AUDIT_MAX_PAGE);
  let query = trx
    .selectFrom('app.audit_log as a')
    .leftJoin('app.staff as s', 's.user_id', 'a.actor_id')
    .select([
      sql<string>`a.id::text`.as('id'),
      instant('a.at').as('at'),
      'a.actor_id',
      's.display_name',
      'a.channel',
      'a.action',
      'a.table_name',
      'a.row_id',
      'a.diff',
    ]);
  if (before !== undefined) {
    query = query.where(sql<boolean>`a.id < ${before}::bigint`);
  }
  const rows = await query
    .orderBy('a.id', 'desc')
    .limit(size + 1)
    .execute();
  const page = rows.slice(0, size);
  return {
    entries: page.map((row) => ({
      id: row.id,
      at: row.at,
      actor: row.actor_id === null ? null : { userId: row.actor_id, displayName: row.display_name },
      channel: row.channel === 'web' || row.channel === 'bot' ? row.channel : null,
      action: row.action,
      table: row.table_name,
      rowId: row.row_id,
      diff: row.diff,
    })),
    next: rows.length > size ? (page.at(-1)?.id ?? null) : null,
  };
};
