import type { Database } from '@backoffice/db/client';

import { sql } from 'kysely';

import { LinkKeyError, openLink } from './airtable-link.js';
import { AirtableError, mapSharedView, readSharedView } from './airtable.js';

/**
 * One run of the Airtable sync (ADR-0005), as the ingest role, which can do nothing else: the link admins set in
 * Ajustes, read only while the sync is on and opened with the deployment's key; the view, read and mapped; the records,
 * handed to private.ingest_airtable. Idempotent: the record id is the identity, so a run that finds nothing new changes
 * nothing; one run at a time (a run that finds another going answers `skipped`). Every run that reaches the link says
 * how it went in the settings (private.airtable_ran), a failure by its kind only. Rejects with AirtableError when the
 * sync is off (`off`), the link doesn't open (`key`), or the view can't be read or its columns changed: nothing is
 * imported then.
 */
export interface SyncOptions {
  /** As pauseai_backoffice_ingest. */
  ingest: Database;
  /** AIRTABLE_LINK_KEY, which opens the link admins set. */
  key: Buffer;
  /** Only rows with Global's chapter-share permission (PLAN R14). */
  requirePermission: boolean;
  fetch?: typeof globalThis.fetch;
}

export type SyncCounts = Record<string, number | boolean | string>;

/** How a run went, in the settings: a failure by its kind, or the counts. */
const ran = async (
  ingest: Database,
  outcome: { failure: string } | { counts: SyncCounts },
): Promise<void> => {
  const failure = 'failure' in outcome ? outcome.failure : null;
  const counts = 'counts' in outcome ? JSON.stringify(outcome.counts) : null;
  await sql`SELECT private.airtable_ran(${failure}, ${counts}::jsonb)`.execute(ingest);
};

export const runAirtableSync = async ({
  ingest,
  key,
  requirePermission,
  fetch,
}: SyncOptions): Promise<SyncCounts> => {
  const sealed = (
    await sql<{ link: string | null }>`SELECT private.airtable_link() AS link`.execute(ingest)
  ).rows[0]?.link;
  if (!sealed) {
    throw new AirtableError('off');
  }
  let link: string;
  try {
    link = openLink(sealed, key);
  } catch (error) {
    if (error instanceof LinkKeyError) {
      await ran(ingest, { failure: 'key' });
      throw new AirtableError('key');
    }
    throw error;
  }
  let mapped: ReturnType<typeof mapSharedView>;
  try {
    mapped = mapSharedView(await readSharedView(link, fetch === undefined ? {} : { fetch }), {
      requirePermission,
    });
  } catch (error) {
    if (error instanceof AirtableError) {
      await ran(ingest, { failure: error.reason });
    }
    throw error;
  }
  const { records, skipped } = mapped;
  let result;
  try {
    result = await sql<{ counts: SyncCounts }>`
      SELECT private.ingest_airtable(${JSON.stringify(records)}::jsonb) AS counts`.execute(ingest);
  } catch (error) {
    await ran(ingest, { failure: 'database' }).catch(() => undefined);
    throw error;
  }
  const counts: SyncCounts = {
    ...result.rows[0]?.counts,
    skippedNoPermission: skipped.noPermission,
    skippedDuplicate: skipped.duplicate,
    skippedInvalid: skipped.invalid,
  };
  // A run that found another going says nothing: the other one does.
  if (counts.skipped !== true) {
    await ran(ingest, { counts });
  }
  return counts;
};
