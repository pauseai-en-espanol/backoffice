import { createDatabase } from '@backoffice/db/client';
import { readDsn } from '@backoffice/observability/dsn';
import { captureException, flush } from '@sentry/node';

import { initErrorTracking } from '../error-tracking.js';
import { runAirtableSync } from '../imports/airtable-sync.js';
import { AirtableError } from '../imports/airtable.js';

/**
 * The hourly Airtable sync (ADR-0005), run by the API chart's CronJob from the API's image. It connects as
 * pauseai_backoffice_ingest, which may only execute the sync's function, and prints counts only: never a record, never
 * the link. A run that can't read the view fails, so the CronJob's failure and GlitchTip tell the admins.
 *
 *   node dist/jobs/airtable-sync.js
 */
const url = process.env.INGEST_DATABASE_URL;
const link = process.env.AIRTABLE_SHARED_VIEW_URL;
if (!url || !link) {
  console.error('INGEST_DATABASE_URL and AIRTABLE_SHARED_VIEW_URL must be set');
  process.exit(1);
}
initErrorTracking(readDsn(process.env));
const ingest = createDatabase({
  connectionString: url,
  maxConnections: 1,
  applicationName: 'backoffice-airtable-sync',
});
try {
  const counts = await runAirtableSync({
    ingest,
    link,
    requirePermission: process.env.AIRTABLE_REQUIRE_CHAPTER_PERMISSION === 'true',
  });
  console.log(JSON.stringify({ msg: 'Airtable sync done', ...counts }));
} catch (error) {
  const reason = error instanceof AirtableError ? error.reason : 'database';
  console.error(`The Airtable sync failed (${reason})`);
  captureException(
    error instanceof AirtableError ? error : new Error(`The Airtable sync failed (${reason})`),
  );
  await flush(2_000);
  process.exitCode = 1;
} finally {
  await ingest.destroy();
}
