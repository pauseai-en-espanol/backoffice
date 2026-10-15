import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase, type Database } from '@backoffice/db/client';
import { captureException, flush } from '@sentry/node';

import { buildApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { endSessions } from './auth/cleanup.js';
import { createInvitedAccounts } from './auth/invited-accounts.js';
import { createPasswordLinks } from './auth/password-links.js';
import { createPasswordMail } from './auth/password-mail.js';
import { loadConfig } from './config.js';
import { logsInAs } from './database-roles.js';
import { initErrorTracking } from './error-tracking.js';
import { runAirtableSync } from './imports/airtable-sync.js';
import { createMailer, mailFailure } from './mail/mailer.js';
import { createInvitationSender } from './staff/invitations.js';

const config = loadConfig(process.env);
initErrorTracking(config.sentryDsn);

// Sign-in runs as pauseai_backoffice_auth, which reaches only Better Auth's tables; what a signed-in staff member does
// runs as pauseai_backoffice_app, through withActor (ADR-0002).
const authPool = config.auth
  ? createAuthPool({
      connectionString: config.auth.databaseUrl,
      applicationName: 'backoffice-api-auth',
    })
  : undefined;
const app = config.appDatabaseUrl
  ? createDatabase({
      connectionString: config.appDatabaseUrl,
      applicationName: 'backoffice-api-app',
    })
  : undefined;
// The Airtable sync, on demand (ADR-0005): its own pool, as the ingest role, which may only run the sync's function.
const ingest = config.airtable
  ? createDatabase({
      connectionString: config.airtable.ingestDatabaseUrl,
      maxConnections: 1,
      applicationName: 'backoffice-api-ingest',
    })
  : undefined;
// The backoffice's one sender. Without it, no invitation or password link goes out.
const mailer = config.mail ? createMailer(config.mail) : undefined;
const passwordMail =
  config.auth && mailer
    ? createPasswordMail({
        mailer,
        staffOrigin: config.auth.staffOrigin,
        productName: config.auth.totpIssuer,
      })
    : undefined;
const reportMailFailure = (error: unknown): void => {
  const failure = mailFailure(error);
  console.error(failure.message);
  captureException(failure);
};

// The app login must be the role its routes assume: pointed at the owner's, every policy would be skipped. One that
// isn't stops the server, before it listens unless the database is slow to answer. A database that can't be reached
// yet is checked again every 30 seconds until it can be; its routes fail meanwhile, as they would anyway.
const checkLogin = async (db: Database, role: string, variable: string): Promise<void> => {
  try {
    if (await logsInAs(db, role)) {
      return;
    }
  } catch (error) {
    console.error(`Could not check the login of ${variable}; trying again in 30 seconds`, error);
    setTimeout(() => void checkLogin(db, role, variable), 30_000).unref();
    return;
  }
  const error = new Error(`${variable} doesn't log in as ${role}: stopping`);
  console.error(error.message);
  captureException(error);
  await flush(2_000);
  process.exit(1);
};
const loginChecks = [
  ...(app ? [checkLogin(app, 'pauseai_backoffice_app', 'APP_DATABASE_URL')] : []),
  ...(ingest ? [checkLogin(ingest, 'pauseai_backoffice_ingest', 'INGEST_DATABASE_URL')] : []),
];

const server = buildApp({
  logger: { level: config.logLevel },
  api: {
    auth:
      config.auth && authPool
        ? {
            auth: createAuth({
              ...config.auth,
              pool: authPool,
              passwordMail,
              onMailError: reportMailFailure,
            }),
            staffOrigin: config.auth.staffOrigin,
          }
        : undefined,
    app,
    // Invitations need sign-in's accounts and the sender.
    invitations:
      config.auth && authPool && mailer
        ? {
            accounts: createInvitedAccounts({ ...config.auth, pool: authPool }),
            send: createInvitationSender({
              mailer,
              staffOrigin: config.auth.staffOrigin,
              productName: config.auth.totpIssuer,
            }),
          }
        : undefined,
    passwordLinks:
      config.auth && authPool && passwordMail
        ? createPasswordLinks({ ...config.auth, pool: authPool, passwordMail })
        : undefined,
    endSessions: authPool ? (userId) => endSessions(authPool, userId) : undefined,
    syncAirtable:
      config.airtable && ingest
        ? () =>
            runAirtableSync({
              ingest,
              link: config.airtable?.sharedViewUrl ?? '',
              requirePermission: config.airtable?.requirePermission ?? true,
            })
        : undefined,
  },
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  server.log.info({ signal }, 'Shutting down');
  await server.close();
  await app?.destroy();
  await ingest?.destroy();
  await authPool?.end();
  process.exit(0);
};

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void shutdown(signal));
}

// At most 5 seconds: a database slow to answer never keeps the liveness probe waiting (the check goes on regardless).
await Promise.race([
  Promise.all(loginChecks),
  new Promise((resolve) => setTimeout(resolve, 5_000).unref()),
]);
await server.listen({ host: config.host, port: config.port });
