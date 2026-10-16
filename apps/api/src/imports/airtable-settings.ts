import type { DB } from '@backoffice/db/generated/db';

import { sql, type Transaction } from 'kysely';

/**
 * The Airtable sync's settings in Ajustes (ADR-0005): whether a link is set, by whom and when, whether the sync is on,
 * and how its last run went. Never the link: the app role can't select it (migration airtable_sync), so nothing here
 * could return it, nor its ciphertext.
 */
export interface AirtableSettings {
  link: { setAt: string; setBy: { displayName: string } | null } | null;
  enabled: boolean;
  lastRun: { at: string; failure: string | null; counts: Record<string, unknown> | null } | null;
}

export const readAirtableSettings = async (trx: Transaction<DB>): Promise<AirtableSettings> => {
  const { rows } = await sql<{
    enabled: boolean;
    link_set_at: string | null;
    set_by: string | null;
    last_run_at: string | null;
    last_run_failure: string | null;
    last_run_counts: Record<string, unknown> | null;
  }>`
    SELECT a.enabled, to_json(a.link_set_at)#>>'{}' AS link_set_at, s.display_name AS set_by,
           to_json(a.last_run_at)#>>'{}' AS last_run_at, a.last_run_failure, a.last_run_counts
      FROM app.airtable_sync a
      LEFT JOIN app.staff s ON s.user_id = a.link_set_by`.execute(trx);
  const [row] = rows;
  if (!row) {
    throw Object.assign(new Error('The Airtable settings are not visible to this actor'), {
      code: '42501',
    });
  }
  return {
    link:
      row.link_set_at === null
        ? null
        : {
            setAt: row.link_set_at,
            setBy: row.set_by === null ? null : { displayName: row.set_by },
          },
    enabled: row.enabled,
    lastRun:
      row.last_run_at === null
        ? null
        : { at: row.last_run_at, failure: row.last_run_failure, counts: row.last_run_counts },
  };
};

/** Whether the sync is on, for whoever may see it (Importar): false for anyone who may not. */
export const airtableEnabled = async (trx: Transaction<DB>): Promise<boolean> =>
  (await sql<{ enabled: boolean }>`SELECT enabled FROM app.airtable_sync`.execute(trx)).rows[0]
    ?.enabled ?? false;

/**
 * Sets the link, already sealed by the caller (airtable-link.ts), or removes it (null), which turns the sync off. Who
 * and when are the database's to record. Admins only (RLS): false when the row wasn't theirs to change.
 */
export const setAirtableLink = async (
  trx: Transaction<DB>,
  sealed: string | null,
): Promise<boolean> =>
  (await sql`UPDATE app.airtable_sync SET link_ciphertext = ${sealed} WHERE id`.execute(trx))
    .numAffectedRows === 1n;

/** Turns the sync on or off. Admins only (RLS); on needs a link: `no_link` otherwise. */
export const setAirtableEnabled = async (
  trx: Transaction<DB>,
  enabled: boolean,
): Promise<'done' | 'no_link' | 'forbidden'> => {
  if (enabled) {
    const { link } = await readAirtableSettings(trx);
    if (link === null) {
      return 'no_link';
    }
  }
  const { numAffectedRows } = await sql`
    UPDATE app.airtable_sync SET enabled = ${enabled} WHERE id`.execute(trx);
  return numAffectedRows === 1n ? 'done' : 'forbidden';
};
