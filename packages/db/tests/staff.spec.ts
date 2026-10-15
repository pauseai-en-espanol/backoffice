import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { USERS } from './fixtures.js';

const asAdmin = (client: pg.Client, userId: string = USERS.adminA) =>
  actAs(client, 'pauseai_backoffice_app', { userId, aal: 2, channel: 'web' });

const can = async (
  client: pg.Client,
  fn: 'staff_can' | 'bot_can',
  actor: { userId?: string; aal?: 1 | 2; channel?: 'web' | 'bot' },
  role = 'onboarding',
): Promise<boolean> => {
  await actAs(client, 'pauseai_backoffice_app', actor);
  const { rows } = await client.query<{ ok: boolean }>(`SELECT private.${fn}($1) AS ok`, [role]);
  await client.query('RESET ROLE');
  return rows[0]?.ok === true;
};

describe('staff_can and bot_can', () => {
  it('admit an active staff member holding the role, at aal2, through their own channel only', async () => {
    await inRolledBackTransaction(async (client) => {
      const onboarder = { userId: USERS.onboarder, aal: 2 } as const;
      expect(await can(client, 'staff_can', { ...onboarder, channel: 'web' })).toBe(true);
      expect(await can(client, 'staff_can', { ...onboarder, channel: 'bot' })).toBe(false);
      expect(await can(client, 'bot_can', { ...onboarder, channel: 'bot' })).toBe(true);
      expect(await can(client, 'bot_can', { ...onboarder, channel: 'web' })).toBe(false);
      expect(await can(client, 'staff_can', onboarder)).toBe(false);
      expect(await can(client, 'staff_can', { ...onboarder, aal: 1, channel: 'web' })).toBe(false);
      expect(await can(client, 'staff_can', { ...onboarder, channel: 'web' }, 'admin')).toBe(false);
      expect(
        await can(client, 'staff_can', { userId: USERS.inactive, aal: 2, channel: 'web' }),
      ).toBe(false);
      expect(
        await can(client, 'staff_can', { userId: USERS.notStaff, aal: 2, channel: 'web' }),
      ).toBe(false);
      expect(await can(client, 'staff_can', { aal: 2, channel: 'web' })).toBe(false);
    });
  });

  it('treat any other channel value as none', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_app');
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.aal', '2', true),
                set_config('app.channel', 'WEB', true)`,
        [USERS.adminA],
      );
      const { rows } = await client.query<{ ok: boolean }>(
        `SELECT private.staff_can('admin') AS ok`,
      );
      expect(rows[0]?.ok).toBe(false);
    });
  });
});

describe('deactivating staff', () => {
  it('stamps when and by whom, and reactivating clears both', async () => {
    await inRolledBackTransaction(async (client) => {
      await asAdmin(client);
      await client.query('UPDATE app.staff SET active = false WHERE user_id = $1', [
        USERS.onboarder,
      ]);
      await client.query('RESET ROLE');
      const off = await client.query(
        'SELECT deactivated_at IS NOT NULL AS stamped, deactivated_by FROM app.staff WHERE user_id = $1',
        [USERS.onboarder],
      );
      expect(off.rows[0]).toEqual({ stamped: true, deactivated_by: USERS.adminA });
      await asAdmin(client);
      await client.query('UPDATE app.staff SET active = true WHERE user_id = $1', [
        USERS.onboarder,
      ]);
      await client.query('RESET ROLE');
      const on = await client.query(
        'SELECT deactivated_at, deactivated_by FROM app.staff WHERE user_id = $1',
        [USERS.onboarder],
      );
      expect(on.rows[0]).toEqual({ deactivated_at: null, deactivated_by: null });
    });
  });

  it("can't set the deactivation columns directly", async () => {
    await inRolledBackTransaction(async (client) => {
      await asAdmin(client);
      expect(
        await errorCode(client, 'UPDATE app.staff SET deactivated_at = now() WHERE user_id = $1', [
          USERS.onboarder,
        ]),
      ).toBe('42501');
    });
  });
});

describe('keeping an admin', () => {
  it('refuses to deactivate the last active admin, or remove their role', async () => {
    await inRolledBackTransaction(async (client) => {
      await asAdmin(client);
      // adminB first, which leaves adminA as the only one.
      expect(
        await errorCode(
          client,
          "DELETE FROM app.staff_roles WHERE user_id = $1 AND role = 'admin'",
          [USERS.adminB],
        ),
      ).toBeNull();
      expect(
        await errorCode(
          client,
          "DELETE FROM app.staff_roles WHERE user_id = $1 AND role = 'admin'",
          [USERS.adminA],
        ),
      ).toBe('23001');
      expect(
        await errorCode(client, 'UPDATE app.staff SET active = false WHERE user_id = $1', [
          USERS.adminA,
        ]),
      ).toBe('23001');
    });
  });

  it('lets an admin deactivate themselves while another admin remains', async () => {
    await inRolledBackTransaction(async (client) => {
      await asAdmin(client);
      expect(
        await errorCode(client, 'UPDATE app.staff SET active = false WHERE user_id = $1', [
          USERS.adminA,
        ]),
      ).toBeNull();
    });
  });
});
