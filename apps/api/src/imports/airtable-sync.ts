import type { Database } from '@backoffice/db/client';

import { sql } from 'kysely';

import { mapSharedView, readSharedView } from './airtable.js';

/**
 * One run of the Airtable sync (ADR-0005): read the view, map it, and hand the records to the database's
 * private.ingest_airtable as the ingest role, which can do nothing else. Idempotent: the record id is the identity, so
 * a run that finds nothing new changes nothing; one run at a time (a run that finds another going answers
 * `skipped`). Rejects with AirtableError when the view can't be read or its columns changed: nothing is imported then.
 */
export interface SyncOptions {
  /** As pauseai_backoffice_ingest. */
  ingest: Database;
  /** The shared view link: a credential, from a sealed secret. */
  link: string;
  /** Only rows with Global's chapter-share permission (PLAN R14). */
  requirePermission: boolean;
  fetch?: typeof globalThis.fetch;
}

export type SyncCounts = Record<string, number | boolean | string>;

export const runAirtableSync = async ({
  ingest,
  link,
  requirePermission,
  fetch,
}: SyncOptions): Promise<SyncCounts> => {
  const view = await readSharedView(link, fetch === undefined ? {} : { fetch });
  const { records, skipped } = mapSharedView(view, { requirePermission });
  const result = await sql<{ counts: SyncCounts }>`
    SELECT private.ingest_airtable(${JSON.stringify(records)}::jsonb) AS counts`.execute(ingest);
  return {
    ...result.rows[0]?.counts,
    skippedNoPermission: skipped.noPermission,
    skippedDuplicate: skipped.duplicate,
    skippedInvalid: skipped.invalid,
  };
};
