import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { inRolledBackTransaction } from './db.js';

/** Runs the Airtable sync on these records, as the ingest role: its counts. */
const sync = async (client: pg.Client, payload: Record<string, unknown>) => {
  await client.query('SET LOCAL ROLE pauseai_backoffice_ingest');
  try {
    const { rows } = await client.query<{ counts: Record<string, number> }>(
      'SELECT private.ingest_airtable($1) AS counts',
      [JSON.stringify([{ external_id: payload.airtable_id, payload }])],
    );
    return rows[0]?.counts;
  } finally {
    await client.query('RESET ROLE');
  }
};

const recordOf = async (client: pg.Client, externalId: string) =>
  (
    await client.query<{ person_id: string; status: string; conflicts: Record<string, unknown> }>(
      `SELECT person_id, status::text AS status, conflicts FROM app.intake_records
        WHERE source = 'airtable' AND external_id = $1`,
      [externalId],
    )
  ).rows[0];

describe('a record Global sends again, changed (PLAN R78)', () => {
  it('attaches only what changed, and keeps what differs for the Bandeja to show', async () => {
    await inRolledBackTransaction(async (client) => {
      const base = {
        airtable_id: 'recEjemploResync1',
        name: 'Resync Ejemplo',
        emails: ['resync@ejemplo.test'],
        town: 'Villa de ejemplo',
        arrival: 'airtable',
      };
      expect(await sync(client, base)).toMatchObject({ created: 1 });
      const person = (await recordOf(client, base.airtable_id))?.person_id;
      // Someone corrects the town by hand.
      await client.query("UPDATE app.people SET town = 'Otra villa' WHERE id = $1", [person]);

      // Global adds a country: that is filled in, and the town isn't proposed back.
      expect(await sync(client, { ...base, country: 'ES' })).toMatchObject({ updated: 1 });
      expect((await recordOf(client, base.airtable_id))?.status).not.toBe('conflict');
      expect(
        (await client.query('SELECT town, country FROM app.people WHERE id = $1', [person])).rows,
      ).toEqual([{ town: 'Otra villa', country: 'ES' }]);

      // Global changes the name: it waits in the Bandeja, saying what differs.
      await sync(client, { ...base, country: 'ES', name: 'Resync Distinto' });
      expect(await recordOf(client, base.airtable_id)).toMatchObject({
        status: 'conflict',
        conflicts: { full_name: { current: 'Resync Ejemplo', proposed: 'Resync Distinto' } },
      });
    });
  });
});
