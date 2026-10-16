import type { createAuthPool } from '@backoffice/db/auth-pool';
import type { Database } from '@backoffice/db/client';

import type { TelegramConfig } from './config.js';
import type { TelegramLinking } from './linking.js';
import type { WebhookOptions } from './webhook.js';

import { createRateLimiter } from '../rate-limit.js';
import { type BotDeps, forgetExpiredDialogs } from './bot.js';
import { createTelegramClient, type TelegramClient } from './client.js';
import { createTeamNotifier, noopNotifier, type TeamNotifier } from './notify.js';
import { createBotStore } from './store.js';

/** Where Telegram is told to send updates: the staff host, outside /api. */
export const webhookUrl = (staffOrigin: string): string => `${staffOrigin}/telegram/webhook`;

export interface Bot {
  client: TelegramClient;
  /** For app.ts: the webhook's route. */
  webhook: WebhookOptions;
  /** For the /api scope: linking accounts. */
  linking: TelegramLinking;
  /** The team group, when one is configured; the API sweeps it every few minutes. */
  team: TeamNotifier | undefined;
  /** Forgets the conversations past their hour and deletes their contact messages; the API runs it every few minutes. */
  forgetExpired: () => Promise<number>;
}

/**
 * The bot as the API runs it (ADR-0004): its client, store, team group and webhook, from its configuration, the
 * staff origin, and the app and auth pools. `sync` runs the Airtable sync for /sync (/sincronizar), when it is
 * configured.
 */
export const createBot = ({
  config,
  staffOrigin,
  app,
  auth,
  sync,
  onError,
}: {
  config: TelegramConfig;
  staffOrigin: string;
  app: Database;
  auth: ReturnType<typeof createAuthPool>;
  sync?: BotDeps['sync'];
  onError: (error: unknown) => void;
}): Bot => {
  const client = createTelegramClient(config);
  const store = createBotStore({ app, auth });
  const team =
    config.teamChatId === undefined
      ? undefined
      : createTeamNotifier({ store, client, chatId: config.teamChatId, staffOrigin, onError });
  const deps: BotDeps = {
    store,
    client,
    staffOrigin,
    notifier: team ?? noopNotifier,
    sync,
    // As the staff app's button: enough for a person, too few to hammer Airtable with the shared view's link.
    allowSync: createRateLimiter({ limit: 10, windowMs: 60 * 60_000 }),
    onError,
  };
  return {
    client,
    webhook: { staffOrigin, secret: config.webhookSecret, deps },
    linking: { botUsername: config.botUsername, pool: auth },
    team,
    forgetExpired: () => forgetExpiredDialogs(deps),
  };
};
