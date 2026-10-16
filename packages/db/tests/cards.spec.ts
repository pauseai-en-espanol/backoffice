import type pg from 'pg';

import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { ANA_PHONE, PEOPLE, USERS } from './fixtures.js';

type Actor = { userId: string; aal: 2; channel: 'web' | 'bot' };
const web = (userId: string): Actor => ({ userId, aal: 2, channel: 'web' });
const bot = (userId: string): Actor => ({ userId, aal: 2, channel: 'bot' });

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

const SUMMARY = 'Diseñadora en Valencia, quiere ayudar con redes';

const summaryOf = async (client: pg.Client, person: string): Promise<string | null> =>
  (
    await client.query<{ summary: string | null }>('SELECT summary FROM app.people WHERE id = $1', [
      person,
    ])
  ).rows[0]?.summary ?? null;

/** A new person through intake, as the staff app's Añadir makes one. */
const added = async (client: pg.Client, name: string): Promise<string> => {
  const [row] = await as<{ person_id: string }>(
    client,
    web(USERS.onboarder),
    "SELECT person_id FROM private.submit_intake('manual', $1, $2, 'new', NULL)",
    [crypto.randomUUID(), JSON.stringify({ name })],
  );
  return row?.person_id ?? '';
};

describe('the internal summary (PLAN M5, step 4)', () => {
  it('is one line of at most 200 characters, written by onboarding staff and admins', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await as(
          client,
          web(USERS.onboarder),
          'UPDATE app.people SET summary = $2 WHERE id = $1 RETURNING id',
          [PEOPLE.ana, SUMMARY],
        ),
      ).toHaveLength(1);
      expect(await summaryOf(client, PEOPLE.ana)).toBe(SUMMARY);
      for (const wrong of ['x'.repeat(201), '   ', 'Primera línea\nsegunda línea']) {
        expect(
          await errorCode(client, 'UPDATE app.people SET summary = $2 WHERE id = $1', [
            PEOPLE.ana,
            wrong,
          ]),
        ).toBe('23514');
      }
      expect(
        await errorCode(client, 'UPDATE app.people SET summary = $2 WHERE id = $1', [
          PEOPLE.ana,
          'x'.repeat(200),
        ]),
      ).toBeNull();
    });
  });

  it('never reaches the bot or the team group: none of their functions returns it', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('UPDATE app.people SET summary = $2 WHERE id = $1', [PEOPLE.ana, SUMMARY]);
      const seen = [
        ...(await as(
          client,
          bot(USERS.onboarder),
          "SELECT * FROM private.bot_people('search', NULL, $1, '{}')",
          [[ANA_PHONE]],
        )),
        ...(await as(client, bot(USERS.onboarder), "SELECT * FROM private.bot_people('mine')")),
        ...(await as(
          client,
          bot(USERS.onboarder),
          "SELECT * FROM private.bot_candidates('Ana Ejemplo', NULL, '{}', '{}')",
        )),
        ...(await client.query('SELECT * FROM private.team_card($1)', [PEOPLE.ana])).rows,
      ];
      expect(seen.length).toBeGreaterThan(2);
      expect(JSON.stringify(seen)).not.toContain('Diseñadora');
    });
  });

  it('goes with erasure', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('UPDATE app.people SET summary = $2 WHERE id = $1', [PEOPLE.ana, SUMMARY]);
      await as(client, web(USERS.adminA), 'SELECT private.anonymise_person($1)', [PEOPLE.ana]);
      expect(await summaryOf(client, PEOPLE.ana)).toBeNull();
    });
  });

  it('survives a merge: the survivor keeps its own, else takes the duplicate’s', async () => {
    await inRolledBackTransaction(async (client) => {
      const first = await added(client, 'Hugo Ejemplo');
      await client.query('UPDATE app.people SET summary = $2 WHERE id = $1', [first, SUMMARY]);
      await as(client, web(USERS.onboarder), 'SELECT private.merge_people($1, $2)', [
        PEOPLE.ana,
        first,
      ]);
      expect(await summaryOf(client, PEOPLE.ana)).toBe(SUMMARY);

      const second = await added(client, 'Irene Ejemplo');
      await client.query("UPDATE app.people SET summary = 'Otra cosa' WHERE id = $1", [second]);
      await as(client, web(USERS.onboarder), 'SELECT private.merge_people($1, $2)', [
        PEOPLE.ana,
        second,
      ]);
      expect(await summaryOf(client, PEOPLE.ana)).toBe(SUMMARY);
    });
  });
});
