import type { createAuthPool } from '@backoffice/db/auth-pool';
import type { Database } from '@backoffice/db/client';
import type { AttentionReason, Stage } from '@backoffice/domain/stages';

import { withActor } from '@backoffice/db/actor';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';

import type { Dialog } from './dialogs.js';

import { readDialog } from './dialogs.js';

type AuthPool = ReturnType<typeof createAuthPool>;

/** A person as the bot may show one (ADR-0004): never contact details. */
export interface PersonLine {
  personId: string;
  /** Null for someone saved without a name (PLAN R37). */
  name: string | null;
  stage: Stage;
  ownerName: string | null;
  reasons: AttentionReason[];
}

export interface Candidate {
  personId: string;
  name: string | null;
  stage: Stage;
  ownerName: string | null;
  /** Holds one of the arrival's phones or emails, rather than a similar name. */
  exact: boolean;
}

export interface Arrival {
  name?: string | undefined;
  phones: string[];
  emails: string[];
  chat?: string | undefined;
  note?: string | undefined;
}

export interface Submitted {
  intakeId: string;
  status: 'pending' | 'attached' | 'created' | 'review' | 'conflict' | 'discarded';
  personId: string | null;
}

/** What a post in the team group shows (ADR-0004, notifications). */
export interface TeamCard {
  personId: string;
  name: string | null;
  province: string | null;
  sources: string[];
  stage: Stage;
  ownerName: string | null;
}

/** Whether a staff member may use the bot: onboarding staff and admins may; other staff are told; anyone else isn't. */
export type BotAccess = 'onboarding' | 'staff' | 'none';

export type PeopleScope = 'mine' | 'unassigned' | 'search' | 'person';

/**
 * Everything the bot reads and writes, through the narrow functions the database keeps for it: as the linked staff
 * member through the bot channel, or, for its own state, the bot's private tables. An interface, so the bot's flows
 * are tested without a database (bot.spec.ts).
 */
export interface BotStore {
  /** The staff account a Telegram account is linked to. */
  linkedUser(telegramUserId: number): Promise<string | undefined>;
  /** Uses a one-time link code for a Telegram account: the account it linked, or undefined if the code is spent. */
  redeemCode(code: string, telegramUserId: number): Promise<string | undefined>;
  /**
   * What the bot may do for a linked account: `onboarding` only with the onboarding role (Dani, 2026-10-16: admin
   * alone isn't enough), `staff` for other active staff, who are told it isn't for them.
   */
  access(userId: string): Promise<BotAccess>;
  candidates(userId: string, arrival: Arrival): Promise<Candidate[]>;
  submit(
    userId: string,
    externalId: string,
    arrival: Arrival,
    decision: { kind: 'new' } | { kind: 'attach'; target: string },
  ): Promise<Submitted>;
  people(
    userId: string,
    scope: PeopleScope,
    query?: { text?: string; phones?: string[]; emails?: string[] },
  ): Promise<PersonLine[]>;
  claim(userId: string, personId: string): Promise<boolean>;
  leave(userId: string, personId: string): Promise<boolean>;
  summary(userId: string): Promise<{ unassigned: number; arrivedYesterday: number }>;
  /** Records an update as processed; false if it already was. */
  claimUpdate(updateId: number): Promise<boolean>;
  dialog(telegramUserId: number): Promise<Dialog | undefined>;
  saveDialog(telegramUserId: number, userId: string, dialog: Dialog): Promise<void>;
  /** Ends the conversation, and hands it back (to delete the messages in it that held contact details). */
  endDialog(telegramUserId: number): Promise<Dialog | undefined>;
  /** Ends every conversation past its hour, and hands them back, each once. */
  takeExpiredDialogs(): Promise<Dialog[]>;
  teamCard(personId: string): Promise<TeamCard | undefined>;
  teamUnposted(chatId: number): Promise<string[]>;
  /** Claims the right to post a person to a chat; false if someone already did. */
  reservePost(personId: string, chatId: number): Promise<boolean>;
  recordPost(personId: string, chatId: number, messageId: number): Promise<void>;
  releasePost(personId: string, chatId: number): Promise<void>;
  posts(personId: string): Promise<{ chatId: number; messageId: number }[]>;
  /** Forgets the posts about these people, once they are gone from the group. */
  forgetPosts(personIds: readonly string[]): Promise<void>;
}

/** A dialog lasts an hour from its last step (ADR-0004). */
export const DIALOG_MS = 60 * 60 * 1000;

export const hashLinkCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex');

const asBot = (userId: string) => ({ userId, aal: 2 as const, channel: 'bot' as const });

interface PersonRow {
  person_id: string;
  name: string | null;
  stage: Stage;
  owner_name: string | null;
  reasons: AttentionReason[];
}

const line = (row: PersonRow): PersonLine => ({
  personId: row.person_id,
  name: row.name,
  stage: row.stage,
  ownerName: row.owner_name,
  reasons: row.reasons,
});

const payload = (arrival: Arrival): Record<string, unknown> => ({
  ...(arrival.name ? { name: arrival.name } : {}),
  ...(arrival.phones.length > 0 ? { phones: arrival.phones } : {}),
  ...(arrival.emails.length > 0 ? { emails: arrival.emails } : {}),
  ...(arrival.chat ? { chat: arrival.chat } : {}),
  ...(arrival.note ? { note: arrival.note } : {}),
});

/** The bot's store on Postgres: the auth pool for links, the app pool (withActor, bot channel) for everything else. */
export const createBotStore = ({ app, auth }: { app: Database; auth: AuthPool }): BotStore => ({
  linkedUser: async (telegramUserId) => {
    const { rows } = await auth.query<{ user_id: string }>(
      'SELECT user_id FROM telegram_links WHERE telegram_user_id = $1',
      [telegramUserId],
    );
    return rows[0]?.user_id;
  },
  redeemCode: async (code, telegramUserId) => {
    const client = await auth.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ user_id: string }>(
        `UPDATE telegram_link_codes SET used_at = now()
          WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING user_id`,
        [hashLinkCode(code)],
      );
      const userId = rows[0]?.user_id;
      if (userId !== undefined) {
        // One link each way: this Telegram account stands for this account alone from now on.
        await client.query(
          'DELETE FROM telegram_links WHERE user_id = $1 OR telegram_user_id = $2',
          [userId, telegramUserId],
        );
        await client.query(
          'INSERT INTO telegram_links (user_id, telegram_user_id) VALUES ($1, $2)',
          [userId, telegramUserId],
        );
      }
      await client.query('COMMIT');
      return userId;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
  access: async (userId) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<{ onboarding: boolean; staff: boolean }>`
        SELECT private.bot_can('onboarding') AS onboarding,
               private.bot_can('admin', 'onboarding', 'outreach') AS staff`.execute(trx);
      const [row] = rows;
      return row?.onboarding ? 'onboarding' : row?.staff ? 'staff' : 'none';
    }),
  candidates: async (userId, arrival) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<Omit<PersonRow, 'reasons'> & { exact: boolean }>`
        SELECT person_id, name, stage, owner_name, exact
          FROM private.bot_candidates(${arrival.name ?? null}, NULL, ${arrival.phones}::text[],
                                      ${arrival.emails}::text[])`.execute(trx);
      return rows.map((row) => ({
        personId: row.person_id,
        name: row.name,
        stage: row.stage,
        ownerName: row.owner_name,
        exact: row.exact,
      }));
    }),
  submit: async (userId, externalId, arrival, decision) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<{
        intake_id: string;
        status: Submitted['status'];
        person_id: string | null;
      }>`
        SELECT intake_id, status, person_id
          FROM private.submit_intake('telegram', ${externalId}, ${JSON.stringify(payload(arrival))}::jsonb,
                                     ${decision.kind}, ${decision.kind === 'attach' ? decision.target : null}::uuid)`.execute(
        trx,
      );
      const [row] = rows;
      if (!row) {
        throw new Error('submit_intake answered nothing');
      }
      return { intakeId: row.intake_id, status: row.status, personId: row.person_id };
    }),
  people: async (userId, scope, query = {}) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<PersonRow>`
        SELECT person_id, name, stage, owner_name, reasons
          FROM private.bot_people(${scope}, ${query.text ?? null}, ${query.phones ?? []}::text[],
                                  ${query.emails ?? []}::text[])`.execute(trx);
      return rows.map(line);
    }),
  claim: async (userId, personId) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<{
        done: boolean;
      }>`SELECT private.claim_person(${personId}) AS done`.execute(trx);
      return rows[0]?.done === true;
    }),
  leave: async (userId, personId) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<{
        done: boolean;
      }>`SELECT private.report_leave(${personId}) AS done`.execute(trx);
      return rows[0]?.done === true;
    }),
  summary: async (userId) =>
    withActor(app, asBot(userId), async (trx) => {
      const { rows } = await sql<{ unassigned: number; arrived_yesterday: number }>`
        SELECT unassigned, arrived_yesterday FROM private.bot_summary()`.execute(trx);
      return {
        unassigned: rows[0]?.unassigned ?? 0,
        arrivedYesterday: rows[0]?.arrived_yesterday ?? 0,
      };
    }),
  claimUpdate: async (updateId) => {
    const result = await sql`
      INSERT INTO private.telegram_updates (update_id) VALUES (${updateId}) ON CONFLICT DO NOTHING`.execute(
      app,
    );
    return (result.numAffectedRows ?? 0n) > 0n;
  },
  dialog: async (telegramUserId) => {
    const { rows } = await sql<{ state: unknown }>`
      SELECT state FROM private.telegram_dialogs
       WHERE telegram_user_id = ${telegramUserId} AND expires_at > now()`.execute(app);
    return rows[0] ? readDialog(rows[0].state) : undefined;
  },
  saveDialog: async (telegramUserId, userId, dialog) => {
    await sql`
      INSERT INTO private.telegram_dialogs (telegram_user_id, user_id, state, expires_at)
      VALUES (${telegramUserId}, ${userId}, ${JSON.stringify(dialog)}::jsonb,
              now() + make_interval(secs => ${DIALOG_MS / 1000}))
      ON CONFLICT (telegram_user_id) DO UPDATE
        SET user_id = EXCLUDED.user_id, state = EXCLUDED.state, expires_at = EXCLUDED.expires_at`.execute(
      app,
    );
  },
  endDialog: async (telegramUserId) => {
    const { rows } = await sql<{ state: unknown }>`
      DELETE FROM private.telegram_dialogs WHERE telegram_user_id = ${telegramUserId}
      RETURNING state`.execute(app);
    return rows[0] ? readDialog(rows[0].state) : undefined;
  },
  takeExpiredDialogs: async () => {
    const { rows } = await sql<{ state: unknown }>`
      DELETE FROM private.telegram_dialogs WHERE expires_at < now() RETURNING state`.execute(app);
    return rows.flatMap((row) => {
      const dialog = readDialog(row.state);
      return dialog ? [dialog] : [];
    });
  },
  teamCard: async (personId) => {
    const { rows } = await sql<{
      person_id: string;
      name: string | null;
      province: string | null;
      sources: string[];
      stage: Stage;
      owner_name: string | null;
    }>`SELECT * FROM private.team_card(${personId})`.execute(app);
    const [row] = rows;
    return row
      ? {
          personId: row.person_id,
          name: row.name,
          province: row.province,
          sources: row.sources,
          stage: row.stage,
          ownerName: row.owner_name,
        }
      : undefined;
  },
  teamUnposted: async (chatId) => {
    const { rows } = await sql<{
      id: string;
    }>`SELECT id FROM private.team_unposted(${chatId}) AS id`.execute(app);
    return rows.map((row) => row.id);
  },
  reservePost: async (personId, chatId) => {
    const result = await sql`
      INSERT INTO private.telegram_posts (person_id, chat_id) VALUES (${personId}, ${chatId})
      ON CONFLICT DO NOTHING`.execute(app);
    return (result.numAffectedRows ?? 0n) > 0n;
  },
  recordPost: async (personId, chatId, messageId) => {
    await sql`
      UPDATE private.telegram_posts SET message_id = ${messageId}
       WHERE person_id = ${personId} AND chat_id = ${chatId}`.execute(app);
  },
  releasePost: async (personId, chatId) => {
    await sql`
      DELETE FROM private.telegram_posts
       WHERE person_id = ${personId} AND chat_id = ${chatId} AND message_id IS NULL`.execute(app);
  },
  posts: async (personId) => {
    const { rows } = await sql<{ chat_id: string; message_id: string }>`
      SELECT chat_id::text, message_id::text FROM private.telegram_posts
       WHERE person_id = ${personId} AND message_id IS NOT NULL`.execute(app);
    return rows.map((row) => ({ chatId: Number(row.chat_id), messageId: Number(row.message_id) }));
  },
  forgetPosts: async (personIds) => {
    await sql`DELETE FROM private.telegram_posts WHERE person_id = ANY (${personIds}::uuid[])`.execute(
      app,
    );
  },
});
