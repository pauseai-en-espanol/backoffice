import { type Kysely, sql, type Transaction } from 'kysely';

import type { DB } from './generated/db.js';

/**
 * The staff member a transaction acts for (ADR-0002), and how they came: through the staff app (`web`), where `aal`
 * is 2 only after the second factor, or through the Telegram bot (`bot`, ADR-0004), as a linked account. The database
 * admits the bot only where a policy names it on purpose.
 */
export interface Actor {
  userId: string;
  aal: 1 | 2;
  channel: 'web' | 'bot';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `fn` in a transaction that acts for `actor` (ADR-0002). The settings are transaction-local, so they can never
 * leak to the next user of the pooled connection. Every staff and bot query must go through here.
 */
export const withActor = async <T>(
  db: Kysely<DB>,
  actor: Actor,
  fn: (trx: Transaction<DB>) => Promise<T>,
): Promise<T> => {
  if (!UUID.test(actor.userId)) {
    throw new Error('withActor: userId must be a UUID');
  }
  if (actor.aal !== 1 && actor.aal !== 2) {
    throw new Error('withActor: aal must be 1 or 2');
  }
  if (actor.channel !== 'web' && actor.channel !== 'bot') {
    throw new Error('withActor: channel must be web or bot');
  }
  return db.transaction().execute(async (trx) => {
    await sql`select set_config('app.user_id', ${actor.userId}, true), set_config('app.aal', ${String(actor.aal)}, true),
                     set_config('app.channel', ${actor.channel}, true)`.execute(trx);
    return fn(trx);
  });
};
