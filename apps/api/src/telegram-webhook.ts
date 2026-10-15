import { loadConfig } from './config.js';
import { createTelegramClient, TelegramError } from './telegram/client.js';
import { webhookUrl } from './telegram/setup.js';

/**
 * The owner's command that points Telegram at the bot's webhook (ADR-0004; docs/runbooks/rotating-the-bot-token.md).
 * The API does it on every start; this is for doing it by hand, after rotating the secret or the token. Run inside an
 * API pod, which has the bot's settings:
 *
 *   kubectl exec -n backoffice deploy/backoffice-api -- node dist/telegram-webhook.js
 *
 * It prints whether it worked, and Telegram's reason if not: never the token or the secret.
 */
const config = loadConfig(process.env);
if (!config.telegram || !config.auth) {
  console.error(
    'The bot or sign-in is not configured here (TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, STAFF_ORIGIN, …)',
  );
  process.exit(1);
}
try {
  await createTelegramClient(config.telegram).setWebhook(
    webhookUrl(config.auth.staffOrigin),
    config.telegram.webhookSecret,
  );
  console.log(`ok: Telegram sends updates to ${webhookUrl(config.auth.staffOrigin)}`);
} catch (error) {
  console.error(`failed: ${error instanceof TelegramError ? error.message : 'the request failed'}`);
  process.exitCode = 1;
}
