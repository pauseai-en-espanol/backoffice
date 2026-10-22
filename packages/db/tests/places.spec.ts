import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { ANA_PHONE, CENSUS_TOKEN, PEOPLE, tokenHash, USERS } from './fixtures.js';

/** Runs `sql` as the app role for a staff member through the staff app, then goes back to superuser. */
const asStaff = async <T extends object>(
  client: pg.Client,
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  await actAs(client, 'pauseai_backoffice_app', { userId, aal: 2, channel: 'web' });
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.query('RESET ROLE');
  }
};

interface Submitted {
  intake_id: string;
  status: string;
  person_id: string | null;
}

/** An arrival reported through the staff app, as Añadir rápido does. */
const arrive = async (client: pg.Client, payload: object): Promise<Submitted> => {
  const [row] = await asStaff<Submitted>(
    client,
    USERS.onboarder,
    "SELECT * FROM private.submit_intake('manual', $1, $2, NULL, NULL)",
    [crypto.randomUUID(), JSON.stringify(payload)],
  );
  if (!row) {
    throw new Error('submit_intake returned nothing');
  }
  return row;
};

const placeOf = async (client: pg.Client, person: string) =>
  (
    await client.query(
      'SELECT province, town, country, origin_country, origin_province FROM app.people WHERE id = $1',
      [person],
    )
  ).rows[0];

/** A census answer through the form's generic link, fictional, with what it needs. */
const census = (fields: Record<string, unknown>) =>
  JSON.stringify({
    name: 'Lugar Ejemplo',
    email: 'lugar.ejemplo@ejemplo.test',
    availability: 'under_2h',
    consent_privacy: true,
    age_ok: true,
    wording_version: 'v1',
    ...fields,
  });

describe('where someone lives, and where they are from (PLAN R74)', () => {
  it('take a country as its ISO 3166-1 code, and a place of origin of up to 100 characters', async () => {
    await inRolledBackTransaction(async (client) => {
      const set = (assignment: string, value: unknown) =>
        actAs(client, 'pauseai_backoffice_app', {
          userId: USERS.onboarder,
          aal: 2,
          channel: 'web',
        }).then(async () => {
          try {
            return await errorCode(
              client,
              `UPDATE app.people SET ${assignment} = $2 WHERE id = $1`,
              [PEOPLE.ana, value],
            );
          } finally {
            await client.query('RESET ROLE');
          }
        });
      expect(await set('country', 'DE')).toBeNull();
      expect(await set('country', 'de')).toBe('23514');
      expect(await set('country', 'Alemania')).toBe('23514');
      expect(await set('origin_country', 'ESP')).toBe('23514');
      expect(await set('origin_country', 'AR')).toBeNull();
      expect(await set('origin_province', 'Córdoba')).toBeNull();
      expect(await set('origin_province', ' ')).toBe('23514');
      expect(await set('origin_province', 'x'.repeat(101))).toBe('23514');
    });
  });

  it('come with an arrival: on someone new, filled in when empty, proposed when different', async () => {
    await inRolledBackTransaction(async (client) => {
      const made = await arrive(client, {
        name: 'Lugar Ejemplo',
        phones: ['+34600000044'],
        town: 'Berlín',
        country: 'DE',
        origin_country: 'ES',
        origin_province: 'Madrid',
      });
      expect(made.status).toBe('created');
      expect(await placeOf(client, made.person_id ?? '')).toEqual({
        province: null,
        town: 'Berlín',
        country: 'DE',
        origin_country: 'ES',
        origin_province: 'Madrid',
      });

      const filled = await arrive(client, { phones: [ANA_PHONE], country: 'PT' });
      expect(filled).toMatchObject({ status: 'attached', person_id: PEOPLE.ana });
      expect(await placeOf(client, PEOPLE.ana)).toMatchObject({ country: 'PT' });
      const differing = await arrive(client, { phones: [ANA_PHONE], country: 'FR' });
      expect(differing.status).toBe('conflict');
      const [record] = (
        await client.query('SELECT conflicts FROM app.intake_records WHERE id = $1', [
          differing.intake_id,
        ])
      ).rows;
      expect(record?.conflicts).toMatchObject({ country: { current: 'PT', proposed: 'FR' } });

      // A country written any other way than its code is refused before anything is written.
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(client, "SELECT private.submit_intake('manual', $1, $2, NULL, NULL)", [
          crypto.randomUUID(),
          JSON.stringify({ name: 'Otro Ejemplo', country: 'Alemania' }),
        ]),
      ).toBe('22023');
    });
  });

  it('come with a census answer, its country checked', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_public');
      const { rows } = await client.query<{ outcome: string }>(
        'SELECT private.submit_census(NULL, $1) AS outcome',
        [
          census({
            country: 'MX',
            town: 'Puebla',
            origin_country: 'ES',
            origin_province: 'Sevilla',
          }),
        ],
      );
      expect(rows[0]?.outcome).toBe('created');
      expect(
        await errorCode(client, 'SELECT private.submit_census(NULL, $1)', [
          census({ email: 'otro.lugar@ejemplo.test', country: 'Mexico' }),
        ]),
      ).toBe('22023');
      await client.query('RESET ROLE');
      const person = (
        await client.query<{ person_id: string }>(
          "SELECT person_id FROM app.identities WHERE kind = 'email' AND value = 'lugar.ejemplo@ejemplo.test'",
        )
      ).rows[0]?.person_id;
      expect(await placeOf(client, person ?? '')).toEqual({
        province: null,
        town: 'Puebla',
        country: 'MX',
        origin_country: 'ES',
        origin_province: 'Sevilla',
      });
      // One that matches someone waits in the Bandeja with where it says they live.
      await client.query('SET LOCAL ROLE pauseai_backoffice_public');
      const { rows: again } = await client.query<{ outcome: string }>(
        'SELECT private.submit_census(NULL, $1) AS outcome',
        [census({ country: 'AR' })],
      );
      expect(again[0]?.outcome).toBe('review');
      await client.query('RESET ROLE');
      expect(
        (
          await client.query(
            `SELECT payload ->> 'country' AS country FROM app.intake_records
              WHERE source = 'census' ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
        ).rows,
      ).toEqual([{ country: 'AR' }]);
      // Through a personal link too.
      await client.query('SET LOCAL ROLE pauseai_backoffice_public');
      await client.query('SELECT private.submit_census($1, $2)', [
        tokenHash(CENSUS_TOKEN),
        census({ email: 'ana.lugar@ejemplo.test', country: 'AR', origin_province: 'Cádiz' }),
      ]);
      await client.query('RESET ROLE');
      expect(await placeOf(client, PEOPLE.ana)).toMatchObject({
        country: 'AR',
        origin_province: 'Cádiz',
      });
    });
  });

  it('go with a merge, the survivor’s first, and with erasure', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query("UPDATE app.people SET origin_province = 'Cádiz' WHERE id = $1", [
        PEOPLE.ana,
      ]);
      const other = await arrive(client, {
        name: 'Ana Otra',
        phones: ['+34600000045'],
        country: 'DE',
        origin_province: 'Huelva',
      });
      await asStaff(client, USERS.onboarder, 'SELECT private.merge_people($1, $2)', [
        PEOPLE.ana,
        other.person_id,
      ]);
      expect(await placeOf(client, PEOPLE.ana)).toMatchObject({
        country: 'DE',
        origin_province: 'Cádiz',
      });
      await asStaff(client, USERS.adminA, 'SELECT private.anonymise_person($1)', [PEOPLE.ana]);
      expect(await placeOf(client, PEOPLE.ana)).toMatchObject({
        country: null,
        origin_country: null,
        origin_province: null,
      });
    });
  });
});
