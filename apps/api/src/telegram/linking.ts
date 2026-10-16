import type { Actor } from '@backoffice/db/actor';
import type { createAuthPool } from '@backoffice/db/auth-pool';
import type { Database } from '@backoffice/db/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { withActor } from '@backoffice/db/actor';
import { randomBytes } from 'node:crypto';

import { createRateLimiter } from '../rate-limit.js';
import { staffSelf } from '../staff/staff.js';
import { hashLinkCode } from './store.js';

type AuthPool = ReturnType<typeof createAuthPool>;

/** How long a link code works, once (ADR-0004); the database refuses longer. */
export const LINK_CODE_MINUTES = 10;

export interface TelegramLinking {
  /** The bot's @username, without the @. */
  botUsername: string;
  /** pauseai_backoffice_auth's pool: links and codes live in `auth`. */
  pool: AuthPool;
}

export interface LinkRoutesOptions {
  /** Undefined without the bot: the page says it isn't configured, and no code is made. */
  linking: TelegramLinking | undefined;
  app: Database | undefined;
  staffOrigin: string;
  /**
   * Who the request acts for (the signed-in staff member at aal2, through the web) and their session, or nothing: a
   * code belongs to the session that made it, and goes when it ends (a reset, a deactivation, signing out).
   */
  signedIn: (request: FastifyRequest) => Promise<{ actor: Actor; sessionId: string } | undefined>;
}

/** A code: 256 random bits, base64url (43 characters), so `/start <code>` fits Telegram's 64-character limit. */
export const makeLinkCode = (): string => randomBytes(32).toString('base64url');

/**
 * Linking a staff member's Telegram account (ADR-0004), under /api, signed in with the second factor: whether they
 * are linked; a one-time code, valid ten minutes and stored only as its hash, in a `t.me` deep link that opens the
 * bot with `/start <code>`; and unlinking. Only active staff get a code.
 */
export const telegramLinkRoutes =
  ({ linking, app, staffOrigin, signedIn }: LinkRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    // A few codes an hour per staff member: enough to try again, not to fill a table.
    const allowCode = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 });

    scope.get('/telegram/link', async (request, reply) => {
      const actor = (await signedIn(request))?.actor;
      if (!actor) {
        return reply.code(401).send({ error: 'signIn' });
      }
      if (!linking) {
        return { configured: false, linked: false, botUsername: null };
      }
      const { rows } = await linking.pool.query('SELECT 1 FROM telegram_links WHERE user_id = $1', [
        actor.userId,
      ]);
      return { configured: true, linked: rows.length > 0, botUsername: linking.botUsername };
    });

    scope.post('/telegram/link', async (request, reply) => {
      const signed = await signedIn(request);
      if (!signed) {
        return reply.code(401).send({ error: 'signIn' });
      }
      const { actor, sessionId } = signed;
      if (request.headers.origin !== staffOrigin) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!linking || !app) {
        return reply.code(503).send({ error: 'unavailable' });
      }
      if (!(await withActor(app, actor, (trx) => staffSelf(trx, actor.userId)))) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!allowCode(actor.userId)) {
        return reply.code(429).send({ error: 'limit' });
      }
      const code = makeLinkCode();
      const { rows } = await linking.pool.query<{ expires_at: Date }>(
        `INSERT INTO telegram_link_codes (code_hash, user_id, session_id, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4))
         RETURNING expires_at`,
        [hashLinkCode(code), actor.userId, sessionId, LINK_CODE_MINUTES],
      );
      return reply.code(201).send({
        url: `https://t.me/${linking.botUsername}?start=${code}`,
        expiresAt: rows[0]?.expires_at.toISOString(),
      });
    });

    scope.delete('/telegram/link', async (request, reply) => {
      const actor = (await signedIn(request))?.actor;
      if (!actor) {
        return reply.code(401).send({ error: 'signIn' });
      }
      if (request.headers.origin !== staffOrigin) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      if (!linking) {
        return reply.code(503).send({ error: 'unavailable' });
      }
      await linking.pool.query('DELETE FROM telegram_links WHERE user_id = $1', [actor.userId]);
      return reply.code(204).send();
    });
  };
