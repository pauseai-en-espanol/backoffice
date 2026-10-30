import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { errorCode, inRolledBackTransaction } from './db.js';
import { USERS } from './fixtures.js';

/** A passkey row as Better Auth's plugin writes one, for `userId`. */
const addPasskey = (client: pg.Client, userId: string) =>
  errorCode(
    client,
    `INSERT INTO auth.passkeys (name, public_key, user_id, credential_id, counter, device_type, backed_up, created_at)
     VALUES ('Portátil', 'clave-publica-de-ejemplo', $1, gen_random_uuid()::text, 0, 'multiDevice', true, now())`,
    [userId],
  );

/** A session of `userId` created `ago` and ending `until`, both SQL intervals from now. */
const addSession = (client: pg.Client, userId: string, ago: string, until: string) =>
  errorCode(
    client,
    `INSERT INTO auth.sessions (created_at, expires_at, token, updated_at, user_id, aal)
     VALUES (now() - $2::interval, now() + $3::interval, gen_random_uuid()::text, now(), $1, 1)`,
    [userId, ago, until],
  );

describe('passkeys (PLAN D22)', () => {
  it('belong only to an account with its second factor, as Better Auth’s role', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      expect(await addPasskey(client, USERS.onboarder)).toBeNull();
      await client.query('RESET ROLE');
      // The owner's authenticator reset leaves the account without one; a new account has none yet.
      await client.query('UPDATE auth.users SET two_factor_enabled = false WHERE id = $1', [
        USERS.onboarder,
      ]);
      await client.query('UPDATE auth.users SET two_factor_enabled = NULL WHERE id = $1', [
        USERS.newcomer,
      ]);
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      expect(await addPasskey(client, USERS.onboarder)).toBe('42501');
      expect(await addPasskey(client, USERS.newcomer)).toBe('42501');
      // Nor can one be moved to such an account.
      expect(await addPasskey(client, USERS.adminA)).toBeNull();
      expect(
        await errorCode(client, 'UPDATE auth.passkeys SET user_id = $1 WHERE user_id = $2', [
          USERS.onboarder,
          USERS.adminA,
        ]),
      ).toBe('42501');
    });
  });

  it('reach no runtime role but Better Auth’s', async () => {
    await inRolledBackTransaction(async (client) => {
      for (const role of [
        'pauseai_backoffice_app',
        'pauseai_backoffice_ingest',
        'pauseai_backoffice_public',
      ]) {
        await client.query(`SET LOCAL ROLE ${role}`);
        expect(await errorCode(client, 'SELECT 1 FROM auth.passkeys')).toBe('42501');
        await client.query('RESET ROLE');
      }
    });
  });
});

describe('sessions (PLAN D22)', () => {
  it('last a week from sign-in at most, whoever writes them', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      expect(await addSession(client, USERS.adminA, '0 seconds', '48 hours')).toBeNull();
      expect(await addSession(client, USERS.adminA, '6 days', '1 day')).toBeNull();
      expect(await addSession(client, USERS.adminA, '6 days', '1 day 1 second')).toBe('23514');
      expect(await addSession(client, USERS.adminA, '0 seconds', '8 days')).toBe('23514');
      // Moving one's end on stops at the week too, and so does moving its start back.
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO auth.sessions (expires_at, token, updated_at, user_id, aal)
         VALUES (now() + interval '48 hours', gen_random_uuid()::text, now(), $1, 1) RETURNING id`,
        [USERS.adminA],
      );
      const id = rows[0]?.id ?? '';
      expect(
        await errorCode(
          client,
          `UPDATE auth.sessions SET expires_at = created_at + interval '7 days' WHERE id = $1`,
          [id],
        ),
      ).toBeNull();
      expect(
        await errorCode(
          client,
          `UPDATE auth.sessions SET expires_at = created_at + interval '7 days 1 second' WHERE id = $1`,
          [id],
        ),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `UPDATE auth.sessions SET created_at = created_at - interval '1 second' WHERE id = $1`,
          [id],
        ),
      ).toBe('23514');
    });
  });
});

describe('confirming it’s you again (PLAN D23)', () => {
  it('is only for a session that passed a second factor, and counts at most five wrong codes', async () => {
    await inRolledBackTransaction(async (client) => {
      const session = async (aal: 1 | 2) =>
        (
          await client.query<{ id: string }>(
            `INSERT INTO auth.sessions (expires_at, token, updated_at, user_id, aal)
             VALUES (now() + interval '48 hours', gen_random_uuid()::text, now(), $1, $2) RETURNING id`,
            [USERS.adminA, aal],
          )
        ).rows[0]?.id ?? '';
      await client.query(
        `INSERT INTO auth.two_factors (secret, backup_codes, user_id) VALUES ('secreto-de-ejemplo', '[]', $1)`,
        [USERS.adminA],
      );
      const passed = await session(2);
      const passwordOnly = await session(1);
      await client.query('SET LOCAL ROLE pauseai_backoffice_auth');
      const confirm = (id: string) =>
        errorCode(
          client,
          'INSERT INTO auth.session_step_ups (session_id, second_factor_at) VALUES ($1, now())',
          [id],
        );
      expect(await confirm(passed)).toBeNull();
      expect(await confirm(passwordOnly)).toBe('42501');
      // Nor can a confirmation move to such a session.
      expect(
        await errorCode(
          client,
          'UPDATE auth.session_step_ups SET session_id = $1 WHERE session_id = $2',
          [passwordOnly, passed],
        ),
      ).toBe('42501');
      expect(
        await errorCode(
          client,
          'UPDATE auth.session_step_ups SET failures = 6 WHERE session_id = $1',
          [passed],
        ),
      ).toBe('23514');
      // It goes with its session.
      await client.query('DELETE FROM auth.sessions WHERE id = $1', [passed]);
      const { rows } = await client.query(
        'SELECT 1 FROM auth.session_step_ups WHERE session_id = $1',
        [passed],
      );
      expect(rows).toEqual([]);
    });
  });
});
