import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { emailOf, INVITATION_IDS, INVITATION_TOKENS, tokenHash, USERS } from './fixtures.js';

const pending = async (client: pg.Client, token: string) => {
  await client.query('SET LOCAL ROLE pauseai_backoffice_app');
  const { rows } = await client.query<{ email: string; roles: string }>(
    'SELECT email, roles::text FROM private.pending_invitation($1)',
    [tokenHash(token)],
  );
  await client.query('RESET ROLE');
  return rows;
};

const accept = async (
  client: pg.Client,
  token: string,
  actor: { userId: string; aal?: 1 | 2; channel?: 'web' | 'bot' },
): Promise<boolean> => {
  await actAs(client, 'pauseai_backoffice_app', { aal: 1, channel: 'web', ...actor });
  const { rows } = await client.query<{ done: boolean }>(
    'SELECT private.accept_invitation($1) AS done',
    [tokenHash(token)],
  );
  await client.query('RESET ROLE');
  return rows[0]?.done === true;
};

describe('looking an invitation up', () => {
  it('shows the email and roles of a pending one, and nothing for any other token', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await pending(client, INVITATION_TOKENS.pending)).toEqual([
        { email: emailOf('newcomer'), roles: '{onboarding}' },
      ]);
      expect(await pending(client, INVITATION_TOKENS.revoked)).toEqual([]);
      expect(await pending(client, INVITATION_TOKENS.expired)).toEqual([]);
      expect(await pending(client, 'otro-token')).toEqual([]);
    });
  });

  it('shows nothing, and accepts nothing, once the admin who made it is no longer an active admin', async () => {
    // adminA made the fixture invitations; adminB stays, so the last-admin rule lets adminA go.
    await inRolledBackTransaction(async (client) => {
      // Still staff, with another role, but no longer an admin.
      await client.query("INSERT INTO app.staff_roles (user_id, role) VALUES ($1, 'outreach')", [
        USERS.adminA,
      ]);
      await client.query("DELETE FROM app.staff_roles WHERE user_id = $1 AND role = 'admin'", [
        USERS.adminA,
      ]);
      expect(await pending(client, INVITATION_TOKENS.pending)).toEqual([]);
      expect(await accept(client, INVITATION_TOKENS.pending, { userId: USERS.newcomer })).toBe(
        false,
      );
    });
    await inRolledBackTransaction(async (client) => {
      // Still an admin, but deactivated.
      await client.query('UPDATE app.staff SET active = false WHERE user_id = $1', [USERS.adminA]);
      expect(await pending(client, INVITATION_TOKENS.pending)).toEqual([]);
      expect(await accept(client, INVITATION_TOKENS.pending, { userId: USERS.newcomer })).toBe(
        false,
      );
    });
  });
});

describe('accepting an invitation', () => {
  it('makes the invited account staff with its roles, at aal1, stamped and recorded', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await accept(client, INVITATION_TOKENS.pending, { userId: USERS.newcomer })).toBe(
        true,
      );
      const staff = await client.query(
        `SELECT s.display_name, s.active, s.invited_by, array_agg(r.role::text) AS roles
           FROM app.staff s JOIN app.staff_roles r USING (user_id) WHERE s.user_id = $1 GROUP BY 1, 2, 3`,
        [USERS.newcomer],
      );
      expect(staff.rows[0]).toEqual({
        display_name: 'Persona newcomer',
        active: true,
        invited_by: USERS.adminA,
        roles: ['onboarding'],
      });
      const invitation = await client.query(
        'SELECT accepted_by, accepted_at IS NOT NULL AS accepted FROM app.invitations WHERE id = $1',
        [INVITATION_IDS.pending],
      );
      expect(invitation.rows[0]).toEqual({ accepted_by: USERS.newcomer, accepted: true });
      // Once only.
      expect(await accept(client, INVITATION_TOKENS.pending, { userId: USERS.newcomer })).toBe(
        false,
      );
    });
  });

  it('refuses another account, an unverified email, the bot, no actor, and a decided invitation', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await accept(client, INVITATION_TOKENS.pending, { userId: USERS.notStaff })).toBe(
        false,
      );
      expect(
        await accept(client, INVITATION_TOKENS.pending, { userId: USERS.newcomer, channel: 'bot' }),
      ).toBe(false);
      expect(await accept(client, INVITATION_TOKENS.revoked, { userId: USERS.newcomer })).toBe(
        false,
      );
      expect(await accept(client, INVITATION_TOKENS.expired, { userId: USERS.newcomer })).toBe(
        false,
      );
      await client.query('UPDATE auth.users SET email_verified = false WHERE id = $1', [
        USERS.newcomer,
      ]);
      expect(await accept(client, INVITATION_TOKENS.pending, { userId: USERS.newcomer })).toBe(
        false,
      );
      await client.query('SET LOCAL ROLE pauseai_backoffice_app');
      const { rows } = await client.query<{ done: boolean }>(
        'SELECT private.accept_invitation($1) AS done',
        [tokenHash(INVITATION_TOKENS.pending)],
      );
      expect(rows[0]?.done).toBe(false);
    });
  });

  it('refuses a revoked or expired invitation even for the invited email itself', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query("UPDATE auth.users SET email = 'revocada@ejemplo.test' WHERE id = $1", [
        USERS.notStaff,
      ]);
      expect(await accept(client, INVITATION_TOKENS.revoked, { userId: USERS.notStaff })).toBe(
        false,
      );
      await client.query("UPDATE auth.users SET email = 'caducada@ejemplo.test' WHERE id = $1", [
        USERS.noRole,
      ]);
      expect(await accept(client, INVITATION_TOKENS.expired, { userId: USERS.noRole })).toBe(false);
      const staff = await client.query('SELECT 1 FROM app.staff WHERE user_id = $1', [
        USERS.notStaff,
      ]);
      expect(staff.rows).toEqual([]);
    });
  });

  it('reactivates a deactivated staff member it is meant for', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      await client.query(
        `INSERT INTO app.invitations (email, roles, token_hash, expires_at)
         VALUES ($1, '{outreach}', $2, now() + interval '7 days')`,
        [emailOf('inactive'), tokenHash('vuelta')],
      );
      await client.query('RESET ROLE');
      expect(await accept(client, 'vuelta', { userId: USERS.inactive })).toBe(true);
      const { rows } = await client.query(
        `SELECT s.active, s.deactivated_at, array_agg(r.role::text ORDER BY r.role) AS roles
           FROM app.staff s JOIN app.staff_roles r USING (user_id) WHERE s.user_id = $1 GROUP BY 1, 2`,
        [USERS.inactive],
      );
      expect(rows[0]).toEqual({
        active: true,
        deactivated_at: null,
        roles: ['onboarding', 'outreach'],
      });
    });
  });
});

describe('an invitation changes once', () => {
  it('refuses changing anything but the decision, and changing a decided one', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(
          client,
          "UPDATE app.invitations SET expires_at = now() + interval '20 days' WHERE id = $1",
          [INVITATION_IDS.pending],
        ),
      ).toBe('42501');
      expect(
        await errorCode(client, 'UPDATE app.invitations SET revoked_at = now() WHERE id = $1', [
          INVITATION_IDS.pending,
        ]),
      ).toBeNull();
      await client.query('RESET ROLE');
      expect(
        await errorCode(client, 'UPDATE app.invitations SET revoked_at = NULL WHERE id = $1', [
          INVITATION_IDS.pending,
        ]),
      ).toBe('23001');
    });
  });

  it('refuses deciding a decided one again, for anyone', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await errorCode(client, 'UPDATE app.invitations SET revoked_at = now() WHERE id = $1', [
          INVITATION_IDS.revoked,
        ]),
      ).toBe('23001');
      expect(
        await errorCode(
          client,
          'UPDATE app.invitations SET revoked_at = NULL, accepted_at = now(), accepted_by = $2 WHERE id = $1',
          [INVITATION_IDS.revoked, USERS.adminB],
        ),
      ).toBe('23001');
    });
  });

  it('refuses revoking a decided one again, through the API role too', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      const { rowCount } = await client.query(
        'UPDATE app.invitations SET revoked_at = now() WHERE id = $1',
        [INVITATION_IDS.revoked],
      );
      expect(rowCount).toBe(0);
    });
  });

  it('refuses more than 30 days, and roles that are empty', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(
          client,
          `INSERT INTO app.invitations (email, roles, token_hash, expires_at)
           VALUES ('a@ejemplo.test', '{onboarding}', $1, now() + interval '31 days')`,
          [tokenHash('largo')],
        ),
      ).toBe('23514');
      expect(
        await errorCode(
          client,
          `INSERT INTO app.invitations (email, roles, token_hash, expires_at)
           VALUES ('a@ejemplo.test', '{}', $1, now() + interval '7 days')`,
          [tokenHash('vacio')],
        ),
      ).toBe('23514');
    });
  });
});
