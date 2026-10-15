import type pg from 'pg';

import { foldName } from '@backoffice/domain/identities';
import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { ANA_PHONE, PEOPLE, USERS } from './fixtures.js';

type Actor = { userId?: string; aal?: 1 | 2; channel?: 'web' | 'bot' };

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

interface Submitted {
  intake_id: string;
  status: string;
  person_id: string | null;
}

const submit = async (
  client: pg.Client,
  actor: Actor,
  payload: object,
  { source = 'manual', id = crypto.randomUUID(), decision = null, target = null } = {} as {
    source?: string;
    id?: string;
    decision?: string | null;
    target?: string | null;
  },
): Promise<Submitted> => {
  const [row] = await as<Submitted>(
    client,
    actor,
    'SELECT * FROM private.submit_intake($1, $2, $3, $4, $5)',
    [source, id, JSON.stringify(payload), decision, target],
  );
  if (!row) {
    throw new Error('submit_intake returned nothing');
  }
  return row;
};

const reasonsOf = async (client: pg.Client, person: string): Promise<string[]> =>
  (
    await client.query<{ reasons: string[] }>(
      'SELECT reasons FROM app.people_attention WHERE person_id = $1',
      [person],
    )
  ).rows[0]?.reasons ?? [];

const eventsOf = async (client: pg.Client, person: string) =>
  (
    await client.query<{
      kind: string;
      actor_id: string | null;
      channel: string | null;
      data: object;
    }>(
      'SELECT kind, actor_id, channel, data FROM app.person_events WHERE person_id = $1 ORDER BY id',
      [person],
    )
  ).rows;

describe('fold_name', () => {
  it('folds names exactly as @backoffice/domain does', async () => {
    const names = [
      '  María-José  NÚÑEZ ',
      "Joan Pau i Martí · L'Hospitalet",
      'Ánxela Conceição',
      'Íñigo Ëchevarría-Ötxoa',
      'ana garcía',
    ];
    await inRolledBackTransaction(async (client) => {
      for (const name of names) {
        const { rows } = await client.query<{ folded: string }>(
          'SELECT private.fold_name($1) AS folded',
          [name],
        );
        expect(rows[0]?.folded, name).toBe(foldName(name));
      }
    });
  });
});

describe('submitting intake', () => {
  it('makes a new person with their identities, source and timeline, as the reporter', async () => {
    await inRolledBackTransaction(async (client) => {
      const made = await submit(client, web(USERS.onboarder), {
        name: 'Berta Ejemplo Dos',
        phones: ['+34600000002'],
        emails: ['berta@ejemplo.test'],
        province: 'Provincia de ejemplo',
        note: 'Vino a una charla',
      });
      expect(made.status).toBe('created');
      const person = made.person_id ?? '';
      const identities = await client.query(
        'SELECT kind::text, value, source::text FROM app.identities WHERE person_id = $1 ORDER BY kind',
        [person],
      );
      expect(identities.rows).toEqual([
        { kind: 'email', value: 'berta@ejemplo.test', source: 'manual' },
        { kind: 'phone', value: '+34600000002', source: 'manual' },
      ]);
      const [profile] = (
        await client.query(
          'SELECT stage::text, province, created_by FROM app.people WHERE id = $1',
          [person],
        )
      ).rows;
      expect(profile).toEqual({
        stage: 'new',
        province: 'Provincia de ejemplo',
        created_by: USERS.onboarder,
      });
      expect((await eventsOf(client, person)).map((e) => e.kind)).toEqual([
        'created',
        'reported',
        'note',
      ]);
      expect((await eventsOf(client, person))[0]).toMatchObject({
        actor_id: USERS.onboarder,
        channel: 'web',
      });
    });
  });

  it('is idempotent: the same report twice is one', async () => {
    await inRolledBackTransaction(async (client) => {
      const first = await submit(
        client,
        web(USERS.onboarder),
        { name: 'Carla Ejemplo' },
        { id: 'informe-1' },
      );
      const again = await submit(
        client,
        web(USERS.onboarder),
        { name: 'Carla Ejemplo' },
        { id: 'informe-1' },
      );
      expect(again).toEqual(first);
      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM app.people WHERE full_name = 'Carla Ejemplo'",
      );
      expect(rows[0]).toEqual({ n: 1 });
    });
  });

  it('attaches a record to whoever holds one of its identities, filling gaps and holding back what disagrees', async () => {
    await inRolledBackTransaction(async (client) => {
      const outcome = await submit(client, web(USERS.onboarder), {
        name: 'Ana Ejemplo Uno',
        phones: [ANA_PHONE],
        emails: ['ana.uno@ejemplo.test'],
        town: 'Pueblo de ejemplo',
      });
      expect(outcome).toMatchObject({ status: 'attached', person_id: PEOPLE.ana });
      const conflicting = await submit(client, web(USERS.onboarder), {
        name: 'Ana Ejemplo Uno',
        phones: [ANA_PHONE],
        town: 'Otro pueblo',
      });
      expect(conflicting.status).toBe('conflict');
      const [person] = (
        await client.query('SELECT town FROM app.people WHERE id = $1', [PEOPLE.ana])
      ).rows;
      expect(person).toEqual({ town: 'Pueblo de ejemplo' });
      const [intake] = (
        await client.query('SELECT conflicts FROM app.intake_records WHERE id = $1', [
          conflicting.intake_id,
        ])
      ).rows;
      expect(intake?.conflicts).toEqual({
        town: { current: 'Pueblo de ejemplo', proposed: 'Otro pueblo' },
      });
    });
  });

  it('sends a name like someone else’s to the Bandeja, unless the reporter decided', async () => {
    await inRolledBackTransaction(async (client) => {
      const alike = await submit(client, web(USERS.onboarder), {
        name: 'Ana Ejemplo Uno',
        phones: ['+34600000009'],
      });
      expect(alike.status).toBe('review');
      expect(await reasonsOf(client, PEOPLE.ana)).toContain('possible_duplicate');
      const [candidates] = (
        await client.query('SELECT candidates FROM app.intake_records WHERE id = $1', [
          alike.intake_id,
        ])
      ).rows;
      expect(candidates?.candidates).toEqual([PEOPLE.ana]);

      const fresh = await submit(
        client,
        web(USERS.onboarder),
        { name: 'Ana Ejemplo Uno', phones: ['+34600000010'] },
        { decision: 'new' },
      );
      expect(fresh.status).toBe('created');
      const same = await submit(
        client,
        web(USERS.onboarder),
        { name: 'Ana E.', phones: ['+34600000011'] },
        { decision: 'attach', target: PEOPLE.ana },
      );
      expect(same).toMatchObject({ status: 'conflict', person_id: PEOPLE.ana });
    });
  });

  it('resolves the Bandeja: a duplicate attached to a candidate, a conflict applied', async () => {
    await inRolledBackTransaction(async (client) => {
      const alike = await submit(client, web(USERS.onboarder), {
        name: 'Ana Ejemplo Uno',
        town: 'Villa de ejemplo',
      });
      const [attached] = await as<{ status: string }>(
        client,
        web(USERS.onboarder),
        "SELECT private.resolve_intake($1, 'attach', $2) AS status",
        [alike.intake_id, PEOPLE.ana],
      );
      expect(attached?.status).toBe('attached');
      await client.query("UPDATE app.people SET province = 'Antes' WHERE id = $1", [PEOPLE.ana]);
      const conflicting = await submit(client, web(USERS.onboarder), {
        name: 'Ana Ejemplo Uno',
        phones: [ANA_PHONE],
        province: 'Después',
      });
      expect(conflicting.status).toBe('conflict');
      await as(client, web(USERS.onboarder), "SELECT private.resolve_intake($1, 'apply')", [
        conflicting.intake_id,
      ]);
      const [person] = (
        await client.query('SELECT province FROM app.people WHERE id = $1', [PEOPLE.ana])
      ).rows;
      expect(person).toEqual({ province: 'Después' });
    });
  });

  it('takes each source through its own channel only, and only from onboarding staff', async () => {
    await inRolledBackTransaction(async (client) => {
      const sql = 'SELECT * FROM private.submit_intake($1, \'x\', \'{"name": "Dora Ejemplo"}\')';
      for (const [actor, source] of [
        [bot(USERS.onboarder), 'manual'],
        [web(USERS.onboarder), 'telegram'],
        [web(USERS.outreacher), 'manual'],
        [bot(USERS.outreacher), 'telegram'],
        [web(USERS.onboarder), 'airtable'],
        [{ ...web(USERS.onboarder), aal: 1 as const }, 'manual'],
        [web(USERS.inactive), 'manual'],
      ] as const) {
        await actAs(client, 'pauseai_backoffice_app', actor);
        expect(await errorCode(client, sql, [source]), `${actor.channel} ${source}`).toBe('42501');
        await client.query('RESET ROLE');
      }
      expect(
        (
          await submit(
            client,
            bot(USERS.onboarder),
            { name: 'Dora Ejemplo' },
            { source: 'telegram' },
          )
        ).status,
      ).toBe('created');
    });
  });

  it('refuses fields a payload may not carry', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(
        await errorCode(client, "SELECT * FROM private.submit_intake('manual', 'x', $1)", [
          JSON.stringify({ name: 'Eva', notas_internas_de_global: 'x' }),
        ]),
      ).toBe('22023');
    });
  });
});

describe('the bot', () => {
  it('reports an arrival, which joins the community', async () => {
    await inRolledBackTransaction(async (client) => {
      const made = await submit(
        client,
        bot(USERS.onboarder),
        { name: 'Fede Ejemplo', phones: ['+34600000020'], chat: 'Chat de ejemplo' },
        { source: 'telegram' },
      );
      const presence = await client.query(
        'SELECT chat, joined_reported_by, left_on FROM app.community_presence WHERE person_id = $1',
        [made.person_id],
      );
      expect(presence.rows).toEqual([
        { chat: 'Chat de ejemplo', joined_reported_by: USERS.onboarder, left_on: null },
      ]);
      expect(
        (await eventsOf(client, made.person_id ?? '')).map((e) => [e.kind, e.channel]),
      ).toEqual([
        ['created', 'bot'],
        ['joined', 'bot'],
        ['reported', 'bot'],
      ]);
    });
  });

  it('sees names, stages, owners and reasons, never contact details', async () => {
    await inRolledBackTransaction(async (client) => {
      const found = await as<Record<string, unknown>>(
        client,
        bot(USERS.onboarder),
        "SELECT * FROM private.bot_people('search', NULL, $1, '{}')",
        [[ANA_PHONE]],
      );
      expect(found).toHaveLength(1);
      expect(Object.keys(found[0] ?? {}).sort()).toEqual([
        'created_at',
        'in_community',
        'name',
        'owner_name',
        'person_id',
        'reasons',
        'stage',
      ]);
      expect(JSON.stringify(found)).not.toContain(ANA_PHONE);
      const candidates = await as<Record<string, unknown>>(
        client,
        bot(USERS.onboarder),
        "SELECT * FROM private.bot_candidates('Ana Ejemplo', NULL, '{}', '{}')",
      );
      expect(candidates.map((c) => c.person_id)).toEqual([PEOPLE.ana]);
      expect(Object.keys(candidates[0] ?? {}).sort()).toEqual([
        'exact',
        'name',
        'owner_name',
        'person_id',
        'stage',
      ]);
    });
  });

  it('can’t read people directly, merge, or resolve the Bandeja', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await as(client, bot(USERS.adminA), 'SELECT id FROM app.people')).toEqual([]);
      await actAs(client, 'pauseai_backoffice_app', bot(USERS.adminA));
      expect(
        await errorCode(client, 'SELECT private.merge_people($1, $2)', [
          PEOPLE.ana,
          PEOPLE.anaDuplicate,
        ]),
      ).toBe('42501');
      expect(
        await errorCode(client, "SELECT private.resolve_intake($1, 'discard')", [
          crypto.randomUUID(),
        ]),
      ).toBe('42501');
    });
  });

  it('lists the unassigned, and claims one once', async () => {
    await inRolledBackTransaction(async (client) => {
      const made = await submit(
        client,
        bot(USERS.onboarder),
        { name: 'Gala Ejemplo' },
        { source: 'telegram' },
      );
      const free = await as<{ person_id: string }>(
        client,
        bot(USERS.onboarder),
        "SELECT person_id FROM private.bot_people('unassigned')",
      );
      expect(free.map((p) => p.person_id)).toContain(made.person_id);
      const claim = 'SELECT private.claim_person($1) AS done';
      expect(await as(client, bot(USERS.both), claim, [made.person_id])).toEqual([{ done: true }]);
      expect(await as(client, bot(USERS.onboarder), claim, [made.person_id])).toEqual([
        { done: false },
      ]);
      const [owner] = (
        await client.query('SELECT owner_id FROM app.people WHERE id = $1', [made.person_id])
      ).rows;
      expect(owner).toEqual({ owner_id: USERS.both });
      const mine = await as<{ person_id: string; reasons: string[] }>(
        client,
        bot(USERS.both),
        "SELECT person_id, reasons FROM private.bot_people('mine')",
      );
      expect(mine).toEqual([{ person_id: made.person_id, reasons: ['no_next_step'] }]);
    });
  });

  it('reports a leave, which needs attention while the person is being onboarded', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await as(client, bot(USERS.onboarder), 'SELECT private.report_leave($1) AS done', [
          PEOPLE.ana,
        ]),
      ).toEqual([{ done: true }]);
      const presence = await client.query(
        'SELECT left_on IS NOT NULL AS closed, left_reported_by FROM app.community_presence WHERE person_id = $1',
        [PEOPLE.ana],
      );
      expect(presence.rows).toEqual([{ closed: true, left_reported_by: USERS.onboarder }]);
      expect(await reasonsOf(client, PEOPLE.ana)).toContain('left_community');
    });
  });
});

describe('stages and the timeline', () => {
  it('records stage, owner and next-action changes with who made them; leaving closes the next action', async () => {
    await inRolledBackTransaction(async (client) => {
      await as(
        client,
        web(USERS.adminA),
        "UPDATE app.people SET stage = 'talking', owner_id = $2, next_action = 'Llamar el jueves', next_action_due = current_date WHERE id = $1",
        [PEOPLE.ana, USERS.both],
      );
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual(['action_due']);
      await as(client, web(USERS.adminA), "UPDATE app.people SET stage = 'left' WHERE id = $1", [
        PEOPLE.ana,
      ]);
      const [person] = (
        await client.query('SELECT next_action, next_action_due FROM app.people WHERE id = $1', [
          PEOPLE.ana,
        ])
      ).rows;
      expect(person).toEqual({ next_action: null, next_action_due: null });
      const events = (await eventsOf(client, PEOPLE.ana)).filter(
        (e) => e.actor_id === USERS.adminA && e.kind !== 'created',
      );
      expect(events.map((e) => [e.kind, e.data])).toEqual([
        ['stage_changed', { from: 'new', to: 'talking' }],
        ['owner_changed', { from: USERS.onboarder, to: USERS.both }],
        ['next_action_set', { due: expect.any(String) }],
        ['stage_changed', { from: 'talking', to: 'left' }],
      ]);
    });
  });

  it('moves a person along with contact attempts: contacting, then talking on a reply', async () => {
    await inRolledBackTransaction(async (client) => {
      const attempt = (outcome: string) =>
        as(
          client,
          web(USERS.onboarder),
          `INSERT INTO app.person_events (person_id, kind, data) VALUES ($1, 'contact_attempt', $2)`,
          [PEOPLE.ana, JSON.stringify({ channel: 'whatsapp', outcome })],
        );
      await attempt('no_answer');
      expect(
        (await client.query('SELECT stage FROM app.people WHERE id = $1', [PEOPLE.ana])).rows[0],
      ).toEqual({
        stage: 'contacting',
      });
      await attempt('replied');
      expect(
        (await client.query('SELECT stage FROM app.people WHERE id = $1', [PEOPLE.ana])).rows[0],
      ).toEqual({
        stage: 'talking',
      });
    });
  });

  it('marks someone unresponsive after the set attempts over the set days, and asks to follow up before', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        "UPDATE app.people SET stage = 'contacting', next_action = 'Insistir' WHERE id = $1",
        [PEOPLE.ana],
      );
      // Two old attempts, written in the past past the triggers (superuser only).
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        `INSERT INTO app.person_events (person_id, kind, data, created_at)
         VALUES ($1, 'contact_attempt', '{"channel": "phone", "outcome": "no_answer"}', now() - interval '20 days'),
                ($1, 'contact_attempt', '{"channel": "phone", "outcome": "no_answer"}', now() - interval '10 days')`,
        [PEOPLE.ana],
      );
      await client.query("SET LOCAL session_replication_role = 'origin'");
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual(['follow_up']);
      await as(
        client,
        web(USERS.onboarder),
        `INSERT INTO app.person_events (person_id, kind, data)
         VALUES ($1, 'contact_attempt', '{"channel": "whatsapp", "outcome": "no_answer"}')`,
        [PEOPLE.ana],
      );
      expect(
        (await client.query('SELECT stage FROM app.people WHERE id = $1', [PEOPLE.ana])).rows[0],
      ).toEqual({
        stage: 'unresponsive',
      });
    });
  });

  it('keeps the timeline append-only, and lets staff write only notes and contact attempts', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await errorCode(client, 'UPDATE app.person_events SET body = $1', ['x'])).toBe(
        '23001',
      );
      expect(await errorCode(client, 'DELETE FROM app.person_events')).toBe('23001');
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(
        await errorCode(
          client,
          "INSERT INTO app.person_events (person_id, kind, data) VALUES ($1, 'merged', '{}')",
          [PEOPLE.ana],
        ),
      ).toBe('42501');
      expect(
        await errorCode(
          client,
          'INSERT INTO app.person_events (person_id, kind, data) VALUES ($1, \'contact_attempt\', \'{"channel": "fax"}\')',
          [PEOPLE.ana],
        ),
      ).toBe('23514');
    });
  });
});

describe('merging', () => {
  it('moves identities, presence and records to the survivor, leaving a tombstone with its snapshot', async () => {
    await inRolledBackTransaction(async (client) => {
      const other = await submit(
        client,
        web(USERS.onboarder),
        { name: 'Hugo Ejemplo', emails: ['hugo@ejemplo.test'], town: 'Pueblo de Hugo' },
        { decision: 'new' },
      );
      await as(client, web(USERS.onboarder), 'SELECT private.merge_people($1, $2)', [
        PEOPLE.ana,
        other.person_id,
      ]);
      const identities = await client.query(
        "SELECT person_id FROM app.identities WHERE value = 'hugo@ejemplo.test'",
      );
      expect(identities.rows).toEqual([{ person_id: PEOPLE.ana }]);
      const [tombstone] = (
        await client.query('SELECT merged_into FROM app.people WHERE id = $1', [other.person_id])
      ).rows;
      expect(tombstone).toEqual({ merged_into: PEOPLE.ana });
      const [survivor] = (
        await client.query('SELECT town FROM app.people WHERE id = $1', [PEOPLE.ana])
      ).rows;
      expect(survivor).toEqual({ town: 'Pueblo de Hugo' });
      const merged = (await eventsOf(client, other.person_id ?? '')).find(
        (e) => e.kind === 'merged',
      );
      expect(merged?.data).toMatchObject({
        into: PEOPLE.ana,
        identities: [{ kind: 'email', value: 'hugo@ejemplo.test' }],
      });
      // A tombstone takes no more changes, and a record for its identity now finds the survivor.
      expect(
        await as(
          client,
          web(USERS.onboarder),
          "UPDATE app.people SET town = 'x' WHERE id = $1 RETURNING id",
          [other.person_id],
        ),
      ).toEqual([]);
      const later = await submit(client, web(USERS.onboarder), {
        name: 'Hugo Ejemplo',
        emails: ['hugo@ejemplo.test'],
      });
      expect(later.person_id).toBe(PEOPLE.ana);
    });
  });
});

describe('the Airtable sync', () => {
  it('runs only as the ingest role, idempotent by record id, and reaches nothing else', async () => {
    await inRolledBackTransaction(async (client) => {
      const records = JSON.stringify([
        {
          external_id: 'recEjemploSync001',
          payload: { name: 'Inés Ejemplo', airtable_id: 'recEjemploSync001' },
        },
      ]);
      await client.query('SET LOCAL ROLE pauseai_backoffice_ingest');
      const first = await client.query<{ counts: Record<string, number> }>(
        'SELECT private.ingest_airtable($1) AS counts',
        [records],
      );
      expect(first.rows[0]?.counts).toMatchObject({ received: 1, created: 1 });
      const second = await client.query<{ counts: Record<string, number> }>(
        'SELECT private.ingest_airtable($1) AS counts',
        [records],
      );
      expect(second.rows[0]?.counts).toMatchObject({ received: 1, unchanged: 1, created: 0 });
      expect(await errorCode(client, 'SELECT 1 FROM app.people')).toBe('42501');
      expect(
        await errorCode(client, 'SELECT private.ingest_airtable($1)', [
          JSON.stringify([{ external_id: 'no-es-un-id', payload: { name: 'X' } }]),
        ]),
      ).toBe('22023');
      await client.query('RESET ROLE');
      await actAs(client, 'pauseai_backoffice_app', web(USERS.adminA));
      expect(await errorCode(client, "SELECT private.ingest_airtable('[]')")).toBe('42501');
    });
  });
});
