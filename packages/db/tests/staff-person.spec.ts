import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { emailOf, PEOPLE, USERS } from './fixtures.js';

type Actor = { userId: string; aal: 2; channel: 'web' | 'bot' };
const web = (userId: string): Actor => ({ userId, aal: 2, channel: 'web' });

/** Runs `sql` as the app role for `actor`, then goes back to superuser. */
const as = async <T extends object>(
  client: pg.Client,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> => {
  await actAs(client, 'pauseai_backoffice_app', actor);
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.query('RESET ROLE');
  }
};

/** The SQLSTATE `sql` fails with as the app role for `actor`, or null. */
const failsAs = async (
  client: pg.Client,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<string | null> => {
  await actAs(client, 'pauseai_backoffice_app', actor);
  try {
    return await errorCode(client, sql, params);
  } finally {
    await client.query('RESET ROLE');
  }
};

const LINK = 'UPDATE app.staff SET person_id = $2 WHERE user_id = $1 RETURNING user_id';

const linkOf = async (client: pg.Client, userId: string): Promise<string | null> =>
  (
    await client.query<{ person_id: string | null }>(
      'SELECT person_id FROM app.staff WHERE user_id = $1',
      [userId],
    )
  ).rows[0]?.person_id ?? null;

/** A new person through intake, as the staff app's Añadir makes one. */
const added = async (client: pg.Client, name: string, email?: string): Promise<string> => {
  const [row] = await as<{ person_id: string }>(
    client,
    web(USERS.onboarder),
    "SELECT person_id FROM private.submit_intake('manual', $1, $2, 'new', NULL)",
    [crypto.randomUUID(), JSON.stringify(email ? { name, emails: [email] } : { name })],
  );
  return row?.person_id ?? '';
};

describe('a team account linked to its person (PLAN M5, step 5)', () => {
  it('is linked by an admin, one account to one person', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await as(client, web(USERS.onboarder), LINK, [USERS.onboarder, PEOPLE.ana])).toEqual(
        [],
      );
      expect(await as(client, web(USERS.adminA), LINK, [USERS.onboarder, PEOPLE.ana])).toHaveLength(
        1,
      );
      expect(await linkOf(client, USERS.onboarder)).toBe(PEOPLE.ana);
      expect(await failsAs(client, web(USERS.adminA), LINK, [USERS.adminB, PEOPLE.ana])).toBe(
        '23505',
      );
      // Unlinked, it may be linked again.
      await as(client, web(USERS.adminA), LINK, [USERS.onboarder, null]);
      expect(await linkOf(client, USERS.onboarder)).toBeNull();
    });
  });

  it('links only someone still there: never a tombstone, nor someone erased', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await failsAs(client, web(USERS.adminA), LINK, [USERS.onboarder, PEOPLE.anaDuplicate]),
      ).toBe('23001');
      const erased = await added(client, 'Persona Que Se Borra');
      await as(client, web(USERS.adminA), 'SELECT private.anonymise_person($1)', [erased]);
      expect(await failsAs(client, web(USERS.adminA), LINK, [USERS.onboarder, erased])).toBe(
        '23001',
      );
    });
  });

  it('grants nothing: an outreach account linked to a person still reads no one', async () => {
    await inRolledBackTransaction(async (client) => {
      await as(client, web(USERS.adminA), LINK, [USERS.outreacher, PEOPLE.ana]);
      expect(await as(client, web(USERS.outreacher), 'SELECT id FROM app.people')).toEqual([]);
      expect(
        await as<{ ok: boolean }>(
          client,
          web(USERS.outreacher),
          "SELECT private.staff_can('admin', 'onboarding') AS ok",
        ),
      ).toEqual([{ ok: false }]);
    });
  });

  it('outlives the account: deactivating it keeps the person and the link', async () => {
    await inRolledBackTransaction(async (client) => {
      await as(client, web(USERS.adminA), LINK, [USERS.onboarder, PEOPLE.ana]);
      await as(
        client,
        web(USERS.adminA),
        'UPDATE app.staff SET active = false WHERE user_id = $1',
        [USERS.onboarder],
      );
      expect(await linkOf(client, USERS.onboarder)).toBe(PEOPLE.ana);
      expect(
        (await client.query('SELECT id FROM app.people WHERE id = $1', [PEOPLE.ana])).rows,
      ).toHaveLength(1);
    });
  });

  it('follows a merge to the survivor, and keeps two linked records apart', async () => {
    await inRolledBackTransaction(async (client) => {
      const duplicate = await added(client, 'Hugo Ejemplo');
      await as(client, web(USERS.adminA), LINK, [USERS.onboarder, duplicate]);
      await as(client, web(USERS.adminB), 'SELECT private.merge_people($1, $2)', [
        PEOPLE.ana,
        duplicate,
      ]);
      expect(await linkOf(client, USERS.onboarder)).toBe(PEOPLE.ana);

      const other = await added(client, 'Irene Ejemplo');
      await as(client, web(USERS.adminA), LINK, [USERS.adminB, other]);
      expect(
        await failsAs(client, web(USERS.adminB), 'SELECT private.merge_people($1, $2)', [
          PEOPLE.ana,
          other,
        ]),
      ).toBe('23001');
      expect(await linkOf(client, USERS.adminB)).toBe(other);
    });
  });

  it('goes with erasure: the account no longer names the erased person', async () => {
    await inRolledBackTransaction(async (client) => {
      await as(client, web(USERS.adminA), LINK, [USERS.onboarder, PEOPLE.ana]);
      await as(client, web(USERS.adminA), 'SELECT private.anonymise_person($1)', [PEOPLE.ana]);
      expect(await linkOf(client, USERS.onboarder)).toBeNull();
    });
  });

  it('is suggested to admins by a shared email, for accounts and people not linked yet', async () => {
    await inRolledBackTransaction(async (client) => {
      const same = await added(client, 'Persona Del Equipo', emailOf('onboarder'));
      await added(client, 'Persona Sin Relación', 'otra@ejemplo.test');
      const suggestions = () =>
        as<{ user_id: string; person_id: string }>(
          client,
          web(USERS.adminA),
          'SELECT user_id, person_id FROM private.staff_person_suggestions()',
        );
      expect(await suggestions()).toEqual([{ user_id: USERS.onboarder, person_id: same }]);
      expect(
        await failsAs(
          client,
          web(USERS.onboarder),
          'SELECT * FROM private.staff_person_suggestions()',
        ),
      ).toBe('42501');
      // Nothing once the person is another account's, nor once the account has its person.
      await as(client, web(USERS.adminA), LINK, [USERS.adminB, same]);
      expect(await suggestions()).toEqual([]);
      await as(client, web(USERS.adminA), LINK, [USERS.adminB, null]);
      const elsewhere = await added(client, 'Otra Persona Del Equipo');
      await as(client, web(USERS.adminA), LINK, [USERS.onboarder, elsewhere]);
      expect(await suggestions()).toEqual([]);
    });
  });
});
