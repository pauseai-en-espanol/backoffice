import type { FastifyInstance } from 'fastify';

import { createHash, timingSafeEqual } from 'node:crypto';

import { type BotDeps, handleUpdate } from './bot.js';
import { updateSchema } from './updates.js';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Whether a header carries the secret, in constant time: both sides hashed first, so neither
 * their lengths nor their contents leak through the comparison. A missing header, or several, never matches.
 */
export const headerMatches = (header: string | string[] | undefined, secret: string): boolean =>
  typeof header === 'string' && timingSafeEqual(digest(header), digest(secret));

export interface WebhookOptions {
  /** The staff host's origin: the only host the webhook answers on. */
  staffOrigin: string;
  /** What Telegram sends back with every update, as setWebhook was given it (ADR-0004). */
  secret: string;
  deps: BotDeps;
}

/** An update is a few kilobytes; nothing larger is read. */
const BODY_LIMIT = 64 * 1024;

/**
 * The bot's webhook (ADR-0004): POST /telegram/webhook on the staff host, outside /api. Refused (401) without the
 * secret, compared in constant time. Each update is processed once (private.telegram_updates), and acknowledged with
 * 200 once accepted, so Telegram never sends it again, even when processing it failed (that is reported instead).
 * Without the bot configured it answers 503, so Telegram keeps the updates and tries later. Bodies are never logged.
 */
export const telegramWebhookRoutes =
  (options: WebhookOptions | undefined) =>
  async (scope: FastifyInstance): Promise<void> => {
    scope.post('/telegram/webhook', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      if (!options) {
        return reply.code(503).send({ error: 'unavailable' });
      }
      if (request.headers.host !== new URL(options.staffOrigin).host) {
        return reply.code(404).send({ error: 'notFound' });
      }
      if (!headerMatches(request.headers['x-telegram-bot-api-secret-token'], options.secret)) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        // Not an update we can read: acknowledged, so Telegram doesn't send it again and again.
        return reply.send({});
      }
      const update = parsed.data;
      if (!(await options.deps.store.claimUpdate(update.update_id))) {
        return reply.send({});
      }
      await handleUpdate(update, options.deps);
      return reply.send({});
    });
  };
