import type { createAuthPool } from '@backoffice/db/auth-pool';

import type { TelegramClient } from '../telegram/client.js';
import type { BotStore } from '../telegram/store.js';

import { botText, digest } from '../telegram/replies.js';

/** What a digest run did: messages sent each way, and staff skipped for having nothing pending. */
export interface DigestCounts {
  telegram: number;
  mail: number;
  nothingPending: number;
  failed: number;
}

/**
 * The daily digest (onboarding spec, notifications): to each onboarding staff member and admin with something
 * pending (people of theirs needing attention, or anyone unassigned), their people needing attention, the unassigned
 * queue and yesterday's arrivals; by Telegram if they linked it, else by mail. Nothing is sent when nothing is
 * pending.
 *
 * It reads each person's digest as that person, through the bot's channel and its narrow functions (bot_people,
 * bot_summary): the database gives each digest exactly what that staff member's own /mios would, and nobody else's.
 * Who may get one is the database's answer too (bot_can); accounts come from the auth role, the only one that knows
 * emails and Telegram links.
 */
export const sendDigests = async ({
  auth,
  store,
  client,
  sendMail,
  staffOrigin,
  onError = () => undefined,
}: {
  auth: ReturnType<typeof createAuthPool>;
  store: BotStore;
  client: TelegramClient | undefined;
  sendMail: ((to: string, subject: string, text: string) => Promise<void>) | undefined;
  staffOrigin: string;
  onError?: (error: unknown) => void;
}): Promise<DigestCounts> => {
  const counts: DigestCounts = { telegram: 0, mail: 0, nothingPending: 0, failed: 0 };
  const { rows: accounts } = await auth.query<{
    id: string;
    email: string;
    telegram_user_id: string | null;
  }>(
    `SELECT u.id, u.email, l.telegram_user_id::text
       FROM users u LEFT JOIN telegram_links l ON l.user_id = u.id
      WHERE coalesce(u.two_factor_enabled, false)`,
  );
  for (const account of accounts) {
    try {
      if ((await store.access(account.id)) !== 'onboarding') {
        continue;
      }
      const mine = await store.people(account.id, 'mine');
      const summary = await store.summary(account.id);
      if (mine.length === 0 && summary.unassigned === 0) {
        counts.nothingPending += 1;
        continue;
      }
      const text = digest(staffOrigin, mine, summary);
      if (account.telegram_user_id !== null && client) {
        // A private chat's id is the person's own Telegram id.
        await client.sendMessage(Number(account.telegram_user_id), text);
        counts.telegram += 1;
      } else if (sendMail) {
        await sendMail(account.email, botText('bot.digest.subject'), text);
        counts.mail += 1;
      }
    } catch (error) {
      counts.failed += 1;
      onError(error);
    }
  }
  return counts;
};
