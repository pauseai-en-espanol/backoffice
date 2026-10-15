import { createDatabase, type Database } from '@backoffice/db/client';
import { readDsn } from '@backoffice/observability/dsn';
import { captureException, flush } from '@sentry/node';
import { sql } from 'kysely';

import { initErrorTracking } from '../error-tracking.js';

/** How long a processed update is remembered: far longer than Telegram ever redelivers one. */
export const UPDATES_KEEP_DAYS = 7;

/**
 * Deletes the bot's state once it serves nothing (ADR-0004): conversations past their hour, which may hold a phone or
 * email typed into them, and processed updates' ids after a week. As pauseai_backoffice_app, on the bot's private
 * tables alone. Link codes are Better Auth's role's, deleted by the session clean-up.
 */
export const cleanUpDialogs = async (
  app: Database,
): Promise<{ dialogs: number; updates: number }> => {
  const dialogs = await sql`DELETE FROM private.telegram_dialogs WHERE expires_at < now()`.execute(
    app,
  );
  const updates = await sql`
    DELETE FROM private.telegram_updates
     WHERE received_at < now() - make_interval(days => ${UPDATES_KEEP_DAYS})`.execute(app);
  return {
    dialogs: Number(dialogs.numAffectedRows ?? 0n),
    updates: Number(updates.numAffectedRows ?? 0n),
  };
};

/**
 * Run by the API chart's hourly CronJob from the API's image, with APP_DATABASE_URL only:
 *
 *   node dist/jobs/dialog-cleanup.js
 */
const main = async (): Promise<void> => {
  const url = process.env.APP_DATABASE_URL;
  if (!url) {
    console.error('APP_DATABASE_URL is not set');
    process.exit(1);
  }
  initErrorTracking(readDsn(process.env));
  const app = createDatabase({
    connectionString: url,
    maxConnections: 1,
    applicationName: 'backoffice-dialog-cleanup',
  });
  try {
    console.log(
      JSON.stringify({ msg: "Deleted the bot's spent state", ...(await cleanUpDialogs(app)) }),
    );
  } catch (error) {
    const { code } = (error ?? {}) as { code?: unknown };
    console.error(
      `Deleting the bot's spent state failed${typeof code === 'string' ? `: SQLSTATE ${code}` : ''}`,
    );
    captureException(
      new Error(
        `Dialog clean-up failed: ${typeof code === 'string' ? code : 'not a database error'}`,
      ),
    );
    await flush(2_000);
    process.exitCode = 1;
  } finally {
    await app.destroy();
  }
};

// Only when run as the job, so the tests can import cleanUpDialogs.
if (process.argv[1]?.endsWith('dialog-cleanup.js')) {
  await main();
}
