import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { PEOPLE, USERS } from './fixtures.js';

const CODE = 'a'.repeat(64);

describe('Telegram links and their codes (ADR-0004)', () => {
  it('keep a code ten minutes at most, used once, only as Better Auth’s role', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      expect(
        await errorCode(
          client,
          `INSERT INTO auth.telegram_link_codes (code_hash, user_id, expires_at)
           VALUES ($1, $2, now() + interval '11 minutes')`,
          [CODE, USERS.onboarder],
        ),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `INSERT INTO auth.telegram_link_codes (code_hash, user_id, expires_at)
           VALUES ('not-a-hash', $1, now() + interval '5 minutes')`,
          [USERS.onboarder],
        ),
      ).toBe('23514');
      await client.query(
        `INSERT INTO auth.telegram_link_codes (code_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '10 minutes')`,
        [CODE, USERS.onboarder],
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
          [USERS.adminA],
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
});

describe("the team group's posts", () => {
  it('show only recent arrivals or people already posted, without an actor', async () => {
    await inRolledBackTransaction(async (client) => {
      // An arrival of three days ago, written past the stamp trigger (superuser only).
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        `UPDATE app.people SET created_at = now() - interval '3 days' WHERE id = $1`,
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
          province: null,
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
});

describe('bot_summary', () => {
  it('counts the unassigned queue and yesterday’s arrivals for onboarding staff only', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        `UPDATE app.people SET owner_id = NULL,
                created_at = ((now() AT TIME ZONE 'Europe/Madrid')::date - 1 + time '12:00') AT TIME ZONE 'Europe/Madrid'
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
