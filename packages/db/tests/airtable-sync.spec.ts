import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { USERS } from './fixtures.js';

/**
 * The Airtable sync's settings (ADR-0005): Global's view link, set by admins in the staff app, encrypted by the API and
 * write-only in the database; the switch; the last run. Ciphertexts here are made up: the database only stores them.
 */

type Actor = { userId: string; aal: 2; channel: 'web' };
const web = (userId: string): Actor => ({ userId, aal: 2, channel: 'web' });
const SEALED = 'v1.Y2lmcmFkby1kZS1lamVtcGxv';

/** Runs `sql` as the app role for `actor`: its rows, or the SQLSTATE it failed with. */
const asApp = async (
  client: pg.Client,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[]; code: string | null }> => {
  await actAs(client, 'pauseai_backoffice_app', actor);
  try {
    await client.query('SAVEPOINT attempt');
    try {
      const { rows } = await client.query<Record<string, unknown>>(sql, params);
      await client.query('RELEASE SAVEPOINT attempt');
      return { rows, code: null };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT attempt');
      return { rows: [], code: (error as { code?: string }).code ?? 'unknown' };
    }
  } finally {
    await client.query('RESET ROLE');
  }
};

/** Runs `sql` as the ingest role, as the sync does: its rows, or the SQLSTATE it failed with. */
const asIngest = async (
  client: pg.Client,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[]; code: string | null }> => {
  await actAs(client, 'pauseai_backoffice_ingest');
  try {
    await client.query('SAVEPOINT attempt');
    try {
      const { rows } = await client.query<Record<string, unknown>>(sql, params);
      await client.query('RELEASE SAVEPOINT attempt');
      return { rows, code: null };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT attempt');
      return { rows: [], code: (error as { code?: string }).code ?? 'unknown' };
    }
  } finally {
    await client.query('RESET ROLE');
  }
};

const settings = async (client: pg.Client) =>
  (
    await client.query<{
      enabled: boolean;
      link_ciphertext: string | null;
      link_set_by: string | null;
      link_set_at: Date | null;
      last_run_at: Date | null;
      last_run_failure: string | null;
      last_run_counts: Record<string, unknown> | null;
    }>('SELECT * FROM app.airtable_sync')
  ).rows[0];

const SET_LINK = 'UPDATE app.airtable_sync SET link_ciphertext = $1 WHERE id RETURNING id';

describe('the Airtable link (ADR-0005)', () => {
  it('is write-only: an admin sets it, and no one in the staff app can read it back, nor its ciphertext', async () => {
    await inRolledBackTransaction(async (client) => {
      const admin = web(USERS.adminA);
      expect((await asApp(client, admin, SET_LINK, [SEALED])).rows).toHaveLength(1);
      expect((await settings(client))?.link_ciphertext).toBe(SEALED);
      for (const sql of [
        'SELECT link_ciphertext FROM app.airtable_sync',
        'SELECT * FROM app.airtable_sync',
        'UPDATE app.airtable_sync SET enabled = true WHERE id RETURNING link_ciphertext',
        "SELECT 1 FROM app.airtable_sync WHERE link_ciphertext LIKE 'v1.%'",
      ]) {
        expect({ sql, code: (await asApp(client, admin, sql)).code }).toEqual({
          sql,
          code: '42501',
        });
      }
      // What it may read says who set it and when, never the link.
      const { rows } = await asApp(
        client,
        admin,
        'SELECT enabled, link_set_by, link_set_at IS NOT NULL AS set FROM app.airtable_sync',
      );
      expect(rows).toEqual([{ enabled: false, link_set_by: USERS.adminA, set: true }]);
    });
  });

  it('is set by admins only; onboarding staff see whether the sync is on, outreach staff nothing', async () => {
    await inRolledBackTransaction(async (client) => {
      // Not theirs to change: the row isn't there for them, so nothing is updated (not even refused).
      for (const user of [USERS.onboarder, USERS.outreacher, USERS.both]) {
        expect(await asApp(client, web(user), SET_LINK, [SEALED])).toEqual({
          rows: [],
          code: null,
        });
      }
      expect((await settings(client))?.link_ciphertext).toBeNull();
      const read = 'SELECT enabled FROM app.airtable_sync';
      expect((await asApp(client, web(USERS.onboarder), read)).rows).toEqual([{ enabled: false }]);
      expect((await asApp(client, web(USERS.outreacher), read)).rows).toEqual([]);
      // The bot reads nothing either.
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminB,
        aal: 2,
        channel: 'bot',
      });
      expect((await client.query(read)).rows).toEqual([]);
      await client.query('RESET ROLE');
    });
  });

  it('records who set it and when, whatever the caller says, and starts a new link with no last run', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        `UPDATE app.airtable_sync SET last_run_at = now(), last_run_counts = '{"created": 1}'`,
      );
      await asApp(client, web(USERS.adminA), SET_LINK, [SEALED]);
      expect(await settings(client)).toMatchObject({
        link_set_by: USERS.adminA,
        link_set_at: expect.any(Date),
        last_run_at: null,
        last_run_counts: null,
      });
      expect(
        (
          await asApp(
            client,
            web(USERS.adminA),
            'UPDATE app.airtable_sync SET link_set_by = $1 WHERE id',
            [USERS.adminB],
          )
        ).code,
      ).toBe('42501');
      // Turning it on or off keeps who set the link.
      await asApp(
        client,
        web(USERS.adminB),
        'UPDATE app.airtable_sync SET enabled = true WHERE id',
      );
      expect(await settings(client)).toMatchObject({ enabled: true, link_set_by: USERS.adminA });
    });
  });

  it('turns the sync off when the link is removed, and never runs without one', async () => {
    await inRolledBackTransaction(async (client) => {
      const admin = web(USERS.adminA);
      expect(
        (await asApp(client, admin, 'UPDATE app.airtable_sync SET enabled = true WHERE id')).code,
      ).toBe('23514');
      await asApp(client, admin, SET_LINK, [SEALED]);
      await asApp(client, admin, 'UPDATE app.airtable_sync SET enabled = true WHERE id');
      await asApp(client, admin, SET_LINK, [null]);
      expect(await settings(client)).toMatchObject({
        enabled: false,
        link_ciphertext: null,
        link_set_by: null,
        link_set_at: null,
      });
    });
  });

  it('takes only what the API seals: a versioned, url-safe ciphertext, never a link in clear', async () => {
    await inRolledBackTransaction(async (client) => {
      for (const value of [
        'https://airtable.com/appEjemplo000001/shrEjemplo0000001',
        'v2.Y2lmcmFkbw',
        `v1.${'a'.repeat(1000)}`,
      ]) {
        expect(
          {
            value: value.slice(0, 20),
            code: (await asApp(client, web(USERS.adminA), SET_LINK, [value])).code,
          },
          value.slice(0, 20),
        ).toEqual({ value: value.slice(0, 20), code: '23514' });
      }
    });
  });

  it('is in the audit log as changed, by whom, never its value', async () => {
    await inRolledBackTransaction(async (client) => {
      await asApp(client, web(USERS.adminA), SET_LINK, [SEALED]);
      const { rows } = await client.query<{ actor_id: string; diff: Record<string, unknown> }>(
        `SELECT actor_id, diff FROM app.audit_log
          WHERE table_name = 'airtable_sync' AND action = 'update' ORDER BY id DESC LIMIT 1`,
      );
      expect(rows[0]?.actor_id).toBe(USERS.adminA);
      expect(rows[0]?.diff).toMatchObject({ personal: ['link_ciphertext'] });
      expect(JSON.stringify(rows[0]?.diff)).not.toContain(SEALED.slice(3));
    });
  });
});

describe('the sync, as the ingest role (ADR-0005)', () => {
  it('reads the link only while the sync is on, and nothing else of the table', async () => {
    await inRolledBackTransaction(async (client) => {
      const link = async () =>
        (await asIngest(client, 'SELECT private.airtable_link() AS link')).rows;
      expect(await link()).toEqual([{ link: null }]);
      await asApp(client, web(USERS.adminA), SET_LINK, [SEALED]);
      expect(await link()).toEqual([{ link: null }]);
      await asApp(
        client,
        web(USERS.adminA),
        'UPDATE app.airtable_sync SET enabled = true WHERE id',
      );
      expect(await link()).toEqual([{ link: SEALED }]);
      for (const sql of [
        'SELECT enabled FROM app.airtable_sync',
        'UPDATE app.airtable_sync SET enabled = false',
        "UPDATE app.airtable_sync SET link_ciphertext = 'v1.otro'",
      ]) {
        expect({ sql, code: (await asIngest(client, sql)).code }).toEqual({ sql, code: '42501' });
      }
    });
  });

  it('records how a run went: a failure by its kind, or the counts, and nothing else', async () => {
    await inRolledBackTransaction(async (client) => {
      await asApp(client, web(USERS.adminA), SET_LINK, [SEALED]);
      expect(
        (await asIngest(client, `SELECT private.airtable_ran(NULL, '{"created": 2}')`)).code,
      ).toBeNull();
      expect(await settings(client)).toMatchObject({
        last_run_at: expect.any(Date),
        last_run_failure: null,
        last_run_counts: { created: 2 },
        link_ciphertext: SEALED,
        link_set_by: USERS.adminA,
      });
      expect((await asIngest(client, `SELECT private.airtable_ran('page', NULL)`)).code).toBeNull();
      expect(await settings(client)).toMatchObject({
        last_run_failure: 'page',
        last_run_counts: null,
      });
      for (const sql of [
        `SELECT private.airtable_ran(NULL, NULL)`,
        `SELECT private.airtable_ran('page', '{"created": 1}')`,
        `SELECT private.airtable_ran('https://airtable.com/appEjemplo000001/shrEjemplo0000001', NULL)`,
      ]) {
        expect({ sql, code: (await asIngest(client, sql)).code }).not.toEqual({ sql, code: null });
      }
    });
  });

  it('is the ingest role’s alone: the app role can run neither', async () => {
    await inRolledBackTransaction(async (client) => {
      for (const sql of [
        'SELECT private.airtable_link()',
        `SELECT private.airtable_ran(NULL, '{}')`,
      ]) {
        await actAs(client, 'pauseai_backoffice_app', web(USERS.adminA));
        expect({ sql, code: await errorCode(client, sql) }).toEqual({ sql, code: '42501' });
        await client.query('RESET ROLE');
      }
    });
  });
});
