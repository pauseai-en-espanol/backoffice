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
import { botFailure } from './telegram/failure.js';
import { createBot, webhookUrl } from './telegram/setup.js';

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
// The forms app's routes (ADR-0002 §7): their own pool, as the public role, which may only run the census form's two
// functions.
const publicDb = config.forms
  ? createDatabase({
      connectionString: config.forms.databaseUrl,
      maxConnections: 2,
      applicationName: 'backoffice-api-public',
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
  ...(publicDb ? [checkLogin(publicDb, 'pauseai_backoffice_public', 'PUBLIC_DATABASE_URL')] : []),
];

// The Telegram bot (ADR-0004): it links staff accounts and acts as them, so it needs sign-in and the app role. A
// failure is reported by its kind, never with what anyone wrote.
const reportBotFailure = (error: unknown): void => {
  const failure = botFailure(error);
  console.error(failure.message);
  captureException(failure);
};
// The Airtable sync on demand, from Importar and /sincronizar (ADR-0005), as the ingest role.
const syncAirtable =
  config.airtable && ingest
    ? () =>
        runAirtableSync({
          ingest,
          link: config.airtable?.sharedViewUrl ?? '',
          requirePermission: config.airtable?.requirePermission ?? true,
        })
    : undefined;
const bot =
  config.telegram && config.auth && authPool && app
    ? createBot({
        config: config.telegram,
        staffOrigin: config.auth.staffOrigin,
        app,
        auth: authPool,
        sync: syncAirtable,
        onError: reportBotFailure,
      })
    : undefined;
const team = bot?.team;

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
    syncAirtable,
    // New people and claims from the staff app reach the team group at once (ADR-0004, D11).
    onArrival: team ? (personId) => team.arrival(personId) : undefined,
    onClaim: team ? (personId) => team.claimed(personId) : undefined,
    census: config.census,
    telegram: bot?.linking,
  },
  telegram: bot?.webhook,
  forms:
    config.forms && publicDb
      ? {
          db: publicDb,
          token: config.forms.token,
          wordingVersion: config.census?.wordingVersion ?? 'v1',
        }
      : undefined,
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  server.log.info({ signal }, 'Shutting down');
  await server.close();
  await app?.destroy();
  await ingest?.destroy();
  await publicDb?.destroy();
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

if (bot && config.telegram && config.auth) {
  // Telegram is told where to send updates on every start: the same address and secret, so a restart changes nothing,
  // and a rotated secret takes effect with the pods that carry it (docs/runbooks/rotating-the-bot-token.md).
  bot.client
    .setWebhook(webhookUrl(config.auth.staffOrigin), config.telegram.webhookSecret)
    .then(() => server.log.info('Telegram webhook registered'), reportBotFailure);
  // Arrivals from every source reach the team group (D11): those the bot or the staff app made at once, the rest
  // (the hourly Airtable sync, CSV imports) within five minutes.
  const sweep = (): void => {
    bot.team?.sweep().catch(reportBotFailure);
  };
  if (bot.team) {
    sweep();
    setInterval(sweep, 5 * 60_000).unref();
  }
}
