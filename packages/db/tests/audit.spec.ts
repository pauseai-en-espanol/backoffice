import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { USERS } from './fixtures.js';

describe('audit log', () => {
  it('records the actor and channel of a write, without personal data', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      await client.query(
        "UPDATE app.staff SET display_name = 'Nombre nuevo', active = false WHERE user_id = $1",
        [USERS.onboarder],
      );
      await client.query('RESET ROLE');
      const { rows } = await client.query(
        `SELECT actor_id, channel, action, row_id, diff FROM app.audit_log
          WHERE table_name = 'staff' AND action = 'update' ORDER BY id DESC LIMIT 1`,
      );
      expect(rows[0]).toMatchObject({
        actor_id: USERS.adminA,
        channel: 'web',
        action: 'update',
        row_id: USERS.onboarder,
        diff: { old: { active: true }, new: { active: false }, personal: ['display_name'] },
      });
      expect(JSON.stringify(rows[0])).not.toContain('Nombre nuevo');
      expect(JSON.stringify(rows[0])).not.toContain('Persona onboarder');
    });
  });

  it('logs an update that changes only personal data by the column names alone', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      await client.query("UPDATE app.staff SET display_name = 'Otro nombre' WHERE user_id = $1", [
        USERS.onboarder,
      ]);
      await client.query('RESET ROLE');
      const { rows } = await client.query(
        `SELECT diff FROM app.audit_log WHERE table_name = 'staff' AND action = 'update' ORDER BY id DESC LIMIT 1`,
      );
      expect(rows[0]?.diff).toEqual({ old: {}, new: {}, personal: ['display_name'] });
    });
  });

  it('keeps inserts and deletes without personal data, and names composite keys', async () => {
    await inRolledBackTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT row_id, diff FROM app.audit_log WHERE table_name = 'staff' AND action = 'insert' AND row_id = $1`,
        [USERS.onboarder],
      );
      expect(rows[0]?.diff.new).not.toHaveProperty('display_name');
      const roles = await client.query(
        `SELECT row_id FROM app.audit_log WHERE table_name = 'staff_roles' AND action = 'insert' LIMIT 1`,
      );
      expect(JSON.parse(roles.rows[0]?.row_id as string)).toHaveProperty('role');
    });
  });

  it('is append-only, for the owner too', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await errorCode(client, "UPDATE app.audit_log SET action = 'x'")).toBe('23001');
      expect(await errorCode(client, 'DELETE FROM app.audit_log')).toBe('23001');
      expect(await errorCode(client, 'TRUNCATE app.audit_log')).toBe('23001');
    });
  });

  it('ignores app.redact set by anyone but the owner', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query("SELECT set_config('app.redact', 'on', true)");
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      await client.query("SELECT set_config('app.redact', 'on', true)");
      // No grant either; with one, forbid_mutation would still refuse a role that isn't the table's owner.
      expect(await errorCode(client, "UPDATE app.audit_log SET action = 'x'")).toBe('42501');
      await client.query('RESET ROLE');
      // The superuser isn't the owner: still refused.
      expect(await errorCode(client, "UPDATE app.audit_log SET action = 'x'")).toBe('23001');
    });
  });

  it("can't be backdated or written in someone else's name", async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(
          client,
          "INSERT INTO app.audit_log (actor_id, action, table_name, row_id) VALUES ($1, 'x', 'staff', 'x')",
          [USERS.adminA],
        ),
      ).toBe('42501');
    });
  });
});
