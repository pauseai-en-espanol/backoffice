import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { PEOPLE, USERS } from './fixtures.js';

const CODE = 'a'.repeat(64);

/** A session of `userId`, as Better Auth writes one: at aal2 only behind a second factor. Superuser only. */
const sessionOf = async (client: pg.Client, userId: string, aal: 1 | 2 = 2): Promise<string> => {
  if (aal === 2) {
    await client.query(
      `INSERT INTO auth.two_factors (secret, backup_codes, user_id) VALUES ('secreto-de-ejemplo', '[]', $1)`,
      [userId],
    );
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO auth.sessions (expires_at, token, updated_at, user_id, aal)
     VALUES (now() + interval '12 hours', gen_random_uuid()::text, now(), $1, $2) RETURNING id`,
    [userId, aal],
  );
  return rows[0]?.id ?? '';
};

describe('Telegram links and their codes (ADR-0004)', () => {
  it('keep a code ten minutes at most, used once, only as Better Auth’s role', async () => {
    await inRolledBackTransaction(async (client) => {
      const session = await sessionOf(client, USERS.onboarder);
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      expect(
        await errorCode(
          client,
          `INSERT INTO auth.telegram_link_codes (code_hash, user_id, session_id, expires_at)
           VALUES ($1, $2, $3, now() + interval '11 minutes')`,
          [CODE, USERS.onboarder, session],
        ),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `INSERT INTO auth.telegram_link_codes (code_hash, user_id, session_id, expires_at)
           VALUES ('not-a-hash', $1, $2, now() + interval '5 minutes')`,
          [USERS.onboarder, session],
        ),
      ).toBe('23514');
      await client.query(
        `INSERT INTO auth.telegram_link_codes (code_hash, user_id, session_id, expires_at)
         VALUES ($1, $2, $3, now() + interval '10 minutes')`,
        [CODE, USERS.onboarder, session],
      );
      expect(
        await errorCode(client, 'UPDATE auth.telegram_link_codes SET user_id = $1', [USERS.adminA]),
      ).toBe('42501');
      expect(
        await errorCode(client, 'UPDATE auth.telegram_link_codes SET used_at = now()'),
      ).toBeNull();
      await client.query('RESET ROLE');
      await client.query('SET LOCAL ROLE pauseai_backoffice_app');
      expect(await errorCode(client, 'SELECT 1 FROM auth.telegram_link_codes')).toBe('42501');
    });
  });

  it('make a code only from its own account’s signed-in session, and lose it when that session ends', async () => {
    await inRolledBackTransaction(async (client) => {
      const theirs = await sessionOf(client, USERS.adminA);
      const halfway = await sessionOf(client, USERS.onboarder, 1);
      const own = await sessionOf(client, USERS.onboarder);
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      const make = (session: string, hash: string) =>
        errorCode(
          client,
          `INSERT INTO auth.telegram_link_codes (code_hash, user_id, session_id, expires_at)
           VALUES ($1, $2, $3, now() + interval '10 minutes')`,
          [hash, USERS.onboarder, session],
        );
      expect(await make(theirs, 'b'.repeat(64))).toBe('42501');
      expect(await make(halfway, 'c'.repeat(64))).toBe('42501');
      expect(await make(own, CODE)).toBeNull();
      // A password reset, the owner's authenticator reset and deactivation all end the sessions: the codes go with them.
      await client.query('DELETE FROM auth.sessions WHERE user_id = $1', [USERS.onboarder]);
      const { rows } = await client.query(
        'SELECT 1 FROM auth.telegram_link_codes WHERE code_hash = $1',
        [CODE],
      );
      expect(rows).toEqual([]);
    });
  });

  it('link a Telegram account to one staff member, and a staff member to one Telegram account', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      await client.query(
        'INSERT INTO auth.telegram_links (user_id, telegram_user_id) VALUES ($1, 1001)',
        [USERS.onboarder],
      );
      expect(
        await errorCode(
          client,
          'INSERT INTO auth.telegram_links (user_id, telegram_user_id) VALUES ($1, 1001)',
          [USERS.adminB],
        ),
      ).toBe('23505');
      expect(
        await errorCode(
          client,
          'INSERT INTO auth.telegram_links (user_id, telegram_user_id) VALUES ($1, 1002)',
          [USERS.onboarder],
        ),
      ).toBe('23505');
      expect(
        await errorCode(client, 'UPDATE auth.telegram_links SET telegram_user_id = 1003'),
      ).toBe('42501');
    });
  });

  it('make a code and a link only for active staff with the onboarding role (Dani, 2026-10-16)', async () => {
    await inRolledBackTransaction(async (client) => {
      const users = [
        USERS.onboarder,
        USERS.adminB,
        USERS.adminA,
        USERS.outreacher,
        USERS.noRole,
        USERS.inactive,
      ];
      const sessions = new Map<string, string>();
      for (const user of users) {
        sessions.set(user, await sessionOf(client, user));
      }
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      const outcomes: Record<string, [string | null, string | null]> = {};
      for (const [index, user] of users.entries()) {
        const code = await errorCode(
          client,
          `INSERT INTO auth.telegram_link_codes (code_hash, user_id, session_id, expires_at)
           VALUES ($1, $2, $3, now() + interval '10 minutes')`,
          [String(index).repeat(64), user, sessions.get(user)],
        );
        const link = await errorCode(
          client,
          'INSERT INTO auth.telegram_links (user_id, telegram_user_id) VALUES ($1, $2)',
          [user, 2001 + index],
        );
        outcomes[user] = [code, link];
      }
      expect(outcomes).toEqual({
        [USERS.onboarder]: [null, null],
        // Admin and onboarding: theirs too.
        [USERS.adminB]: [null, null],
        // Admin alone isn't enough; nor outreach, no role, or a deactivated onboarder.
        [USERS.adminA]: ['42501', '42501'],
        [USERS.outreacher]: ['42501', '42501'],
        [USERS.noRole]: ['42501', '42501'],
        [USERS.inactive]: ['42501', '42501'],
      });
    });
  });

  it('unlink an account, and drop its codes, when it loses the onboarding role or is deactivated', async () => {
    await inRolledBackTransaction(async (client) => {
      const session = await sessionOf(client, USERS.onboarder);
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      for (const [user, telegramId] of [
        [USERS.onboarder, 3001],
        [USERS.adminB, 3002],
        [USERS.both, 3003],
      ] as const) {
        await client.query(
          'INSERT INTO auth.telegram_links (user_id, telegram_user_id) VALUES ($1, $2)',
          [user, telegramId],
        );
      }
      await client.query(
        `INSERT INTO auth.telegram_link_codes (code_hash, user_id, session_id, expires_at)
         VALUES ($1, $2, $3, now() + interval '10 minutes')`,
        [CODE, USERS.onboarder, session],
      );
      await client.query('RESET ROLE');
      // An admin, through the staff app: a role taken away, another kept, and a staff member deactivated.
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      await client.query("DELETE FROM app.staff_roles WHERE user_id = $1 AND role = 'onboarding'", [
        USERS.onboarder,
      ]);
      await client.query("DELETE FROM app.staff_roles WHERE user_id = $1 AND role = 'outreach'", [
        USERS.both,
      ]);
      await client.query('UPDATE app.staff SET active = false WHERE user_id = $1', [USERS.adminB]);
      await client.query('RESET ROLE');
      // An edit that keeps the role (the owner's: the staff app can't edit one) keeps the link.
      await client.query(
        "UPDATE app.staff_roles SET role = 'onboarding' WHERE user_id = $1 AND role = 'onboarding'",
        [USERS.both],
      );
      const links = await client.query<{ user_id: string }>(
        'SELECT user_id FROM auth.telegram_links WHERE telegram_user_id IN (3001, 3002, 3003)',
      );
      expect(links.rows).toEqual([{ user_id: USERS.both }]);
      const codes = await client.query(
        'SELECT 1 FROM auth.telegram_link_codes WHERE user_id = $1',
        [USERS.onboarder],
      );
      expect(codes.rows).toEqual([]);
    });
  });

  it('link only an account with its second factor (as an aal2 session)', async () => {
    await inRolledBackTransaction(async (client) => {
      // The owner's authenticator reset leaves the account without one.
      await client.query('UPDATE auth.users SET two_factor_enabled = false WHERE id = $1', [
        USERS.onboarder,
      ]);
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      expect(
        await errorCode(
          client,
          'INSERT INTO auth.telegram_links (user_id, telegram_user_id) VALUES ($1, 1001)',
          [USERS.onboarder],
        ),
      ).toBe('42501');
    });
  });
});

describe("the team group's posts", () => {
  it('show only recent arrivals or people already posted, without an actor', async () => {
    await inRolledBackTransaction(async (client) => {
      // An arrival of three days ago, living abroad (PLAN R81), written past the stamp trigger (superuser only).
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        `UPDATE app.people SET created_at = now() - interval '3 days', province = 'Baviera', country = 'DE'
          WHERE id = $1`,
        [PEOPLE.ana],
      );
      await client.query("SET LOCAL session_replication_role = 'origin'");
      await client.query('SET LOCAL ROLE pauseai_backoffice_app');
      expect(
        (await client.query('SELECT * FROM private.team_card($1)', [PEOPLE.ana])).rows,
      ).toEqual([]);
      expect(
        (await client.query('SELECT * FROM private.team_unposted(-100)')).rows.map(
          (r: { team_unposted: string }) => r.team_unposted,
        ),
      ).not.toContain(PEOPLE.ana);
      await client.query(
        'INSERT INTO private.telegram_posts (person_id, chat_id, message_id) VALUES ($1, -100, 7)',
        [PEOPLE.ana],
      );
      const card = await client.query('SELECT * FROM private.team_card($1)', [PEOPLE.ana]);
      expect(card.rows).toEqual([
        {
          person_id: PEOPLE.ana,
          name: 'Ana Ejemplo Uno',
          province: 'Baviera',
          country: 'DE',
          sources: ['manual'],
          stage: 'new',
          owner_name: 'Persona onboarder',
        },
      ]);
    });
  });

  it('queue arrivals of the last 48 hours not yet posted to that chat', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_app');
      const before = (await client.query('SELECT * FROM private.team_unposted(-100)')).rows.map(
        (r: { team_unposted: string }) => r.team_unposted,
      );
      expect(before).toContain(PEOPLE.ana);
      expect(before).not.toContain(PEOPLE.anaDuplicate);
      await client.query(
        'INSERT INTO private.telegram_posts (person_id, chat_id) VALUES ($1, -100)',
        [PEOPLE.ana],
      );
      const after = (await client.query('SELECT * FROM private.team_unposted(-100)')).rows.map(
        (r: { team_unposted: string }) => r.team_unposted,
      );
      expect(after).not.toContain(PEOPLE.ana);
      expect(await errorCode(client, 'UPDATE private.telegram_posts SET chat_id = -200')).toBe(
        '42501',
      );
    });
  });

  /** Whether the sweep queues Ana, and whether the instant post (its row reserved, not sent yet) gets her card. */
  const announced = async (
    client: Parameters<Parameters<typeof inRolledBackTransaction>[0]>[0],
  ) => {
    await client.query('SAVEPOINT announced');
    await client.query('SET LOCAL ROLE pauseai_backoffice_app');
    const swept = (await client.query('SELECT * FROM private.team_unposted(-100)')).rows.map(
      (r: { team_unposted: string }) => r.team_unposted,
    );
    await client.query(
      'INSERT INTO private.telegram_posts (person_id, chat_id) VALUES ($1, -100)',
      [PEOPLE.ana],
    );
    const card = await client.query('SELECT * FROM private.team_card($1)', [PEOPLE.ana]);
    await client.query('ROLLBACK TO SAVEPOINT announced');
    return { swept: swept.includes(PEOPLE.ana), instant: card.rows.length === 1 };
  };
  const arrivedDaysAgo = (days: number | null) =>
    days === null
      ? 'UPDATE app.people SET arrived_on = NULL WHERE id = $1'
      : `UPDATE app.people SET arrived_on = (now() AT TIME ZONE 'Europe/Madrid')::date - ${days} WHERE id = $1`;

  it('leave out members entered after the fact, by the sweep and the instant post alike: arrived before the window, or on a day nobody knows (PLAN M5)', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(arrivedDaysAgo(7), [PEOPLE.ana]);
      expect(await announced(client)).toEqual({ swept: true, instant: true });
      await client.query(arrivedDaysAgo(8), [PEOPLE.ana]);
      expect(await announced(client)).toEqual({ swept: false, instant: false });
      await client.query(arrivedDaysAgo(null), [PEOPLE.ana]);
      expect(await announced(client)).toEqual({ swept: false, instant: false });
    });
  });

  it('take their window from the settings: a week by default, what admins set in Ajustes (PLAN M5)', async () => {
    await inRolledBackTransaction(async (client) => {
      expect((await client.query('SELECT team_post_days FROM app.settings')).rows).toEqual([
        { team_post_days: 7 },
      ]);
      await client.query(arrivedDaysAgo(10), [PEOPLE.ana]);
      expect(await announced(client)).toEqual({ swept: false, instant: false });
      await client.query('UPDATE app.settings SET team_post_days = 10');
      expect(await announced(client)).toEqual({ swept: true, instant: true });
      await client.query('UPDATE app.settings SET team_post_days = 2');
      await client.query(arrivedDaysAgo(3), [PEOPLE.ana]);
      expect(await announced(client)).toEqual({ swept: false, instant: false });
      for (const days of [0, 61]) {
        expect(await errorCode(client, `UPDATE app.settings SET team_post_days = ${days}`)).toBe(
          '23514',
        );
      }
    });
  });

  it('keep updating a post already sent, whatever the arrival day', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(arrivedDaysAgo(null), [PEOPLE.ana]);
      await client.query('SET LOCAL ROLE pauseai_backoffice_app');
      await client.query(
        'INSERT INTO private.telegram_posts (person_id, chat_id, message_id) VALUES ($1, -100, 7)',
        [PEOPLE.ana],
      );
      expect(
        (await client.query('SELECT * FROM private.team_card($1)', [PEOPLE.ana])).rows,
      ).toHaveLength(1);
    });
  });
});

describe('bot_summary', () => {
  it('counts the unassigned queue and yesterday’s arrivals for onboarding staff only', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        `UPDATE app.people SET owner_id = NULL, arrived_on = (now() AT TIME ZONE 'Europe/Madrid')::date - 1
          WHERE id = $1`,
        [PEOPLE.ana],
      );
      await client.query("SET LOCAL session_replication_role = 'origin'");
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'bot',
      });
      const { rows } = await client.query('SELECT * FROM private.bot_summary()');
      expect(rows).toEqual([{ unassigned: 1, arrived_yesterday: 1 }]);
      await client.query('RESET ROLE');
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.outreacher,
        aal: 2,
        channel: 'bot',
      });
      expect(await errorCode(client, 'SELECT * FROM private.bot_summary()')).toBe('42501');
    });
  });
});
