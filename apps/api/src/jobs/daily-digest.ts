import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { readDsn } from '@backoffice/observability/dsn';
import { captureException, flush } from '@sentry/node';

import { readMail } from '../config.js';
import { initErrorTracking } from '../error-tracking.js';
import { createMailer } from '../mail/mailer.js';
import { createTelegramClient } from '../telegram/client.js';
import { readTelegramSend } from '../telegram/config.js';
import { botFailure } from '../telegram/failure.js';
import { createBotStore } from '../telegram/store.js';
import { sendDigests } from './digest.js';

/**
 * The daily digest (jobs/digest.ts), run by the API chart's CronJob at 09:00 Madrid time from the API's image:
 *
 *   node dist/jobs/daily-digest.js
 *
 * It needs APP_DATABASE_URL and AUTH_DATABASE_URL, STAFF_ORIGIN for the link, and the bot (TELEGRAM_BOT_TOKEN,
 * TELEGRAM_BOT_USERNAME) or mail (SMTP_URL, MAIL_FROM) or both. It prints counts only.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set`);
    process.exit(1);
  }
  return value;
};

initErrorTracking(readDsn(process.env));
const staffOrigin = required('STAFF_ORIGIN');
const telegram = readTelegramSend(process.env);
const mail = readMail(process.env);
if (!telegram && !mail) {
  console.error('Neither the bot nor mail is configured: there is no way to send a digest');
  process.exit(1);
}
const app = createDatabase({
  connectionString: required('APP_DATABASE_URL'),
  maxConnections: 1,
  applicationName: 'backoffice-daily-digest',
});
const auth = createAuthPool({
  connectionString: required('AUTH_DATABASE_URL'),
  maxConnections: 1,
  applicationName: 'backoffice-daily-digest-auth',
});
const mailer = mail ? createMailer(mail) : undefined;
// The mail's sender name: the product's, from configuration, never from code.
const productName = mail ? required('PRODUCT_NAME') : '';
const report = (error: unknown): void => {
  const failure = botFailure(error);
  console.error(failure.message);
  captureException(failure);
};
try {
  const counts = await sendDigests({
    auth,
    store: createBotStore({ app, auth }),
    client: telegram ? createTelegramClient(telegram) : undefined,
    sendMail: mailer
      ? (to, subject, text) => mailer.send({ to, subject, text, fromName: productName })
      : undefined,
    staffOrigin,
    onError: report,
  });
  console.log(JSON.stringify({ msg: 'Sent the daily digests', ...counts }));
  if (counts.failed > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  report(error);
  process.exitCode = 1;
} finally {
  await flush(2_000);
  await app.destroy();
  await auth.end();
}
