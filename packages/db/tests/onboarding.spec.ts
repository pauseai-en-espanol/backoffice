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

  it('attaches a possible duplicate to whoever is found, not only to its candidates, but a census answer only to its own (PLAN R60)', async () => {
    await inRolledBackTransaction(async (client) => {
      const alike = await submit(client, web(USERS.onboarder), {
        name: 'Ana Ejemplo Uno',
        town: 'Villa de ejemplo',
      });
      expect(alike.status).toBe('review');
      const found = (
        await client.query<{ id: string }>(
          // Added after the record went to the Bandeja: not among its candidates.
          "INSERT INTO app.people (full_name, stage) VALUES ('Ana Ejemplo Uno', 'new') RETURNING id",
        )
      ).rows[0]?.id;
      const resolve = "SELECT private.resolve_intake($1, 'attach', $2)::text AS status";
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(await errorCode(client, resolve, [alike.intake_id, null])).toBe('22023');
      const [attached] = (await client.query<{ status: string }>(resolve, [alike.intake_id, found]))
        .rows;
      expect(attached?.status).toBe('attached');
      await client.query('RESET ROLE');
      const { rows } = await client.query<{ person_id: string }>(
        'SELECT person_id FROM app.intake_records WHERE id = $1',
        [alike.intake_id],
      );
      expect(rows[0]?.person_id).toBe(found);

      const census = (
        await client.query<{ id: string }>(
          `INSERT INTO app.intake_records (source, external_id, payload, status, candidates)
           VALUES ('census', 'censo-de-ejemplo', '{"name": "Ana Ejemplo Uno"}', 'review', ARRAY[$1::uuid])
           RETURNING id`,
          [PEOPLE.ana],
        )
      ).rows[0]?.id;
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(await errorCode(client, resolve, [census, found])).toBe('22023');
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
        // The bot is the onboarding role's alone (Dani, 2026-10-16): admin isn't enough.
        [bot(USERS.adminA), 'telegram'],
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
      // Someone else, whom a search for Ana's phone must not find.
      await submit(
        client,
        web(USERS.onboarder),
        { name: 'Otra Persona Distinta' },
        { decision: 'new' },
      );
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
      // As someone the bot otherwise serves: its onboarding staff, admin too (D13).
      expect(await as(client, bot(USERS.adminB), 'SELECT id FROM app.people')).toEqual([]);
      await actAs(client, 'pauseai_backoffice_app', bot(USERS.adminB));
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

  it('is the onboarding role’s alone: an admin without it gets nothing through the bot (Dani, 2026-10-16)', async () => {
    await inRolledBackTransaction(async (client) => {
      const made = await submit(
        client,
        bot(USERS.onboarder),
        { name: 'Hugo Ejemplo' },
        { source: 'telegram' },
      );
      await actAs(client, 'pauseai_backoffice_app', bot(USERS.adminA));
      for (const sql of [
        "SELECT * FROM private.bot_people('unassigned')",
        "SELECT * FROM private.bot_candidates('Hugo Ejemplo', NULL, '{}', '{}')",
        'SELECT * FROM private.bot_summary()',
        `SELECT private.claim_person('${made.person_id}')`,
        `SELECT private.report_leave('${made.person_id}')`,
      ]) {
        expect(await errorCode(client, sql), sql).toBe('42501');
      }
      await client.query('RESET ROLE');
      // Admin and onboarding: the bot is theirs.
      expect(
        await as(client, bot(USERS.adminB), 'SELECT private.claim_person($1) AS done', [
          made.person_id,
        ]),
      ).toEqual([{ done: true }]);
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
      expect(await reasonsOf(client, made.person_id ?? '')).toEqual(['unassigned', 'no_next_step']);
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
      const left = (await eventsOf(client, PEOPLE.ana)).filter((e) => e.kind === 'left');
      expect(left).toMatchObject([{ actor_id: USERS.onboarder, channel: 'bot' }]);
    });
  });
});

describe('stages and the timeline', () => {
  it('records stage, owner and next-action changes with who made them; leaving closes the next action', async () => {
    await inRolledBackTransaction(async (client) => {
      await as(
        client,
        web(USERS.adminA),
        "UPDATE app.people SET stage = 'contacting', owner_id = $2, next_action = 'Llamar el jueves', next_action_due = current_date WHERE id = $1",
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
        (e) => e.actor_id === USERS.adminA && !['created', 'joined'].includes(e.kind),
      );
      expect(events.map((e) => [e.kind, e.data])).toEqual([
        ['stage_changed', { from: 'new', to: 'contacting' }],
        ['owner_changed', { from: USERS.onboarder, to: USERS.both }],
        ['next_action_set', { due: expect.any(String) }],
        ['stage_changed', { from: 'contacting', to: 'left' }],
      ]);
    });
  });

  it('logs a contact attempt by video call, and refuses a channel it doesn’t know', async () => {
    await inRolledBackTransaction(async (client) => {
      const sql = `INSERT INTO app.person_events (person_id, kind, data) VALUES ($1, 'contact_attempt', $2)`;
      const attempt = (channel: string) => [
        PEOPLE.ana,
        JSON.stringify({ channel, outcome: 'replied' }),
      ];
      await as(client, web(USERS.onboarder), sql, attempt('video'));
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(await errorCode(client, sql, attempt('pigeon'))).toBe('23514');
      await client.query('RESET ROLE');
    });
  });

  it('moves a person along with contact attempts: an attempt puts someone new in contact, a reply keeps them there, and brings back someone who had stopped answering (PLAN M5)', async () => {
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
        stage: 'contacting',
      });
      await client.query("UPDATE app.people SET stage = 'unresponsive' WHERE id = $1", [
        PEOPLE.ana,
      ]);
      await attempt('replied');
      expect(
        (await client.query('SELECT stage FROM app.people WHERE id = $1', [PEOPLE.ana])).rows[0],
      ).toEqual({
        stage: 'contacting',
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

describe('arrivals without a name (PLAN R37)', () => {
  const nameOf = async (client: pg.Client, person: string | null) =>
    (
      await client.query<{ full_name: string | null }>(
        'SELECT full_name FROM app.people WHERE id = $1',
        [person],
      )
    ).rows[0]?.full_name;

  it('saves someone the bot or the staff app reports with only a phone or an email', async () => {
    await inRolledBackTransaction(async (client) => {
      const byPhone = await submit(
        client,
        bot(USERS.onboarder),
        { phones: ['+34600000030'] },
        { source: 'telegram' },
      );
      const byEmail = await submit(client, web(USERS.onboarder), {
        emails: ['sin.nombre@ejemplo.test'],
      });
      expect([byPhone.status, byEmail.status]).toEqual(['created', 'created']);
      expect(await nameOf(client, byPhone.person_id)).toBeNull();
      expect(await nameOf(client, byEmail.person_id)).toBeNull();
    });
  });

  it('still needs a name, a phone or an email; and Airtable always needs a name', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', bot(USERS.onboarder));
      const report = "SELECT * FROM private.submit_intake('telegram', $1, $2)";
      expect(
        await errorCode(client, report, ['solo-nota', JSON.stringify({ note: 'Entró alguien' })]),
      ).toBe('23514');
      expect(
        await errorCode(client, report, [
          'nombre-en-blanco',
          JSON.stringify({ name: '  ', phones: [] }),
        ]),
      ).toBe('23514');
      await client.query('RESET ROLE');
      await actAs(client, 'pauseai_backoffice_app', web(USERS.adminA));
      expect(
        await errorCode(client, "SELECT private.import_csv(repeat('a', 64), $1)", [
          JSON.stringify([{ payload: { note: 'Sin nadie' } }]),
        ]),
      ).toBe('23514');
      await client.query('RESET ROLE');
      await client.query('SET LOCAL ROLE pauseai_backoffice_ingest');
      expect(
        await errorCode(client, 'SELECT private.ingest_airtable($1)', [
          JSON.stringify([
            {
              external_id: 'recEjemploSinNom1',
              payload: { airtable_id: 'recEjemploSinNom1', phones: ['+34600000032'] },
            },
          ]),
        ]),
      ).toBe('23514');
    });
  });

  it('takes the name a later report brings, and never matches a nameless person by name', async () => {
    await inRolledBackTransaction(async (client) => {
      const nameless = await submit(
        client,
        bot(USERS.onboarder),
        { phones: ['+34600000033'], province: 'Provincia sin nombre' },
        { source: 'telegram' },
      );
      const stranger = await submit(client, web(USERS.onboarder), {
        name: 'Nadie Conocido',
        province: 'Provincia sin nombre',
      });
      expect(stranger.status).toBe('created');
      const named = await submit(client, web(USERS.onboarder), {
        name: 'Lola Ejemplo',
        phones: ['+34600000033'],
      });
      expect(named).toMatchObject({ status: 'attached', person_id: nameless.person_id });
      expect(await nameOf(client, nameless.person_id)).toBe('Lola Ejemplo');
    });
  });

  it('keeps a name once known: never blank, never taken away; a merge gives a nameless survivor the other’s', async () => {
    await inRolledBackTransaction(async (client) => {
      const nameless = await submit(client, web(USERS.onboarder), { phones: ['+34600000034'] });
      const named = await submit(
        client,
        web(USERS.onboarder),
        { name: 'Mar Ejemplo', emails: ['mar@ejemplo.test'] },
        { decision: 'new' },
      );
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      const rename = 'UPDATE app.people SET full_name = $2 WHERE id = $1';
      expect(await errorCode(client, rename, [named.person_id, '  '])).toBe('23514');
      expect(await errorCode(client, rename, [named.person_id, null])).toBe('23514');
      await client.query('SELECT private.merge_people($1, $2)', [
        nameless.person_id,
        named.person_id,
      ]);
      await client.query('RESET ROLE');
      expect(await nameOf(client, nameless.person_id)).toBe('Mar Ejemplo');
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

/** Today in Madrid, as the database counts days, minus `days`, as YYYY-MM-DD. */
const madridDay = async (client: pg.Client, days = 0): Promise<string> =>
  (
    await client.query<{ day: string }>(
      "SELECT to_char((now() AT TIME ZONE 'Europe/Madrid')::date - $1::int, 'YYYY-MM-DD') AS day",
      [days],
    )
  ).rows[0]?.day ?? '';

const arrivalOf = async (client: pg.Client, person: string) =>
  (
    await client.query<{ arrived_on: string; arrival: string | null }>(
      `SELECT to_char(p.arrived_on, 'YYYY-MM-DD') AS arrived_on, c.key AS arrival
         FROM app.people p LEFT JOIN app.arrival_channels c ON c.id = p.arrival_channel_id WHERE p.id = $1`,
      [person],
    )
  ).rows[0];

describe('fewer stages (PLAN M5)', () => {
  it('has no Por clasificar and no En conversación', async () => {
    await inRolledBackTransaction(async (client) => {
      const { rows } = await client.query<{ stages: string }>(
        'SELECT enum_range(NULL::app.stage)::text AS stages',
      );
      expect(rows[0]?.stages).toBe(
        '{new,contacting,welcomed,active,dormant,unresponsive,left,discarded}',
      );
    });
  });

  it('asks who takes someone new only in the 30 days after they arrived', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        "UPDATE app.people SET owner_id = NULL, next_action = 'Escribir', arrived_on = (now() AT TIME ZONE 'Europe/Madrid')::date - 30 WHERE id = $1",
        [PEOPLE.ana],
      );
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual(['unassigned']);
      const botQueue = async () =>
        (
          await as<{ person_id: string }>(
            client,
            bot(USERS.onboarder),
            "SELECT person_id FROM private.bot_people('unassigned')",
          )
        ).map((row) => row.person_id);
      expect(await botQueue()).toContain(PEOPLE.ana);
      await client.query(
        "UPDATE app.people SET arrived_on = (now() AT TIME ZONE 'Europe/Madrid')::date - 31 WHERE id = $1",
        [PEOPLE.ana],
      );
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual([]);
      // The bot's /libres is the same queue.
      expect(await botQueue()).not.toContain(PEOPLE.ana);
    });
  });

  it('asks to follow up when the latest attempt, by the day it happened, went unanswered too long ago', async () => {
    await inRolledBackTransaction(async (client) => {
      const attempt = async (outcome: string, daysAgo: number) =>
        as(
          client,
          web(USERS.onboarder),
          `INSERT INTO app.person_events (person_id, kind, data, happened_on)
           VALUES ($1, 'contact_attempt', $2, (now() AT TIME ZONE 'Europe/Madrid')::date - $3::int)`,
          [PEOPLE.ana, JSON.stringify({ channel: 'whatsapp', outcome }), daysAgo],
        );
      await client.query("UPDATE app.people SET next_action = 'Insistir' WHERE id = $1", [
        PEOPLE.ana,
      ]);
      // They replied, long ago, and nothing since: the next move is ours, not a follow-up.
      await attempt('replied', 10);
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual([]);
      await attempt('no_answer', 6);
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual(['follow_up']);
      // A reply written now but said to have happened before the unanswered attempt doesn't hide it.
      await attempt('replied', 7);
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual(['follow_up']);
      await attempt('replied', 2);
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual([]);
      await attempt('no_answer', 5);
      expect(await reasonsOf(client, PEOPLE.ana)).toEqual([]);
    });
  });

  it('marks someone unresponsive by the days attempts happened, counting only those since the last reply', async () => {
    await inRolledBackTransaction(async (client) => {
      const attempt = async (outcome: string, daysAgo: number) =>
        as(
          client,
          web(USERS.onboarder),
          `INSERT INTO app.person_events (person_id, kind, data, happened_on)
           VALUES ($1, 'contact_attempt', $2, (now() AT TIME ZONE 'Europe/Madrid')::date - $3::int)`,
          [PEOPLE.ana, JSON.stringify({ channel: 'phone', outcome }), daysAgo],
        );
      const stage = async () =>
        (await client.query('SELECT stage FROM app.people WHERE id = $1', [PEOPLE.ana])).rows[0];
      await attempt('no_answer', 40);
      await attempt('no_answer', 35);
      await attempt('replied', 30);
      await attempt('no_answer', 10);
      await attempt('no_answer', 9);
      expect(await stage()).toEqual({ stage: 'contacting' });
      // Three unanswered since the reply, but over less than the 14 days.
      await attempt('no_answer', 0);
      expect(await stage()).toEqual({ stage: 'contacting' });
      // A fourth, said to be from 20 days ago (after the reply): unanswered for long enough now.
      await attempt('no_answer', 20);
      expect(await stage()).toEqual({ stage: 'unresponsive' });
    });
  });
});

describe('when someone arrived and where from (PLAN M5)', () => {
  it('arrives today by default, may be dated back by onboarding staff, never forward', async () => {
    await inRolledBackTransaction(async (client) => {
      const created = await submit(client, web(USERS.onboarder), { name: 'Persona fechada' });
      const id = created.person_id ?? '';
      expect(await arrivalOf(client, id)).toEqual({
        arrived_on: await madridDay(client),
        arrival: null,
      });
      await as(
        client,
        web(USERS.onboarder),
        "UPDATE app.people SET arrived_on = '2025-03-01' WHERE id = $1",
        [id],
      );
      expect((await arrivalOf(client, id))?.arrived_on).toBe('2025-03-01');
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(
        await errorCode(
          client,
          "UPDATE app.people SET arrived_on = (now() AT TIME ZONE 'Europe/Madrid')::date + 1 WHERE id = $1",
          [id],
        ),
      ).toBe('23514');
    });
  });

  it('takes from an intake when and where from, by key or label; an unknown or retired one leaves it empty', async () => {
    await inRolledBackTransaction(async (client) => {
      const arrival = async (payload: object) =>
        arrivalOf(client, (await submit(client, web(USERS.onboarder), payload)).person_id ?? '');
      expect(
        await arrival({ name: 'Por clave', arrival: 'whatsapp', arrived_on: '2026-01-02' }),
      ).toEqual({ arrived_on: '2026-01-02', arrival: 'whatsapp' });
      expect(
        await arrival({ name: 'Por nombre', arrival: ' formulario de pauseai GLOBAL ' }),
      ).toEqual({ arrived_on: await madridDay(client), arrival: 'airtable' });
      expect((await arrival({ name: 'Desconocida', arrival: 'Paloma mensajera' }))?.arrival).toBe(
        null,
      );
      expect((await arrival({ name: 'Del futuro', arrived_on: '2999-01-01' }))?.arrived_on).toBe(
        await madridDay(client),
      );
      await client.query("UPDATE app.arrival_channels SET active = false WHERE key = 'discord'");
      expect((await arrival({ name: 'Retirada', arrival: 'discord' }))?.arrival).toBe(null);
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(
        await errorCode(client, 'SELECT * FROM private.submit_intake($1, $2, $3)', [
          'manual',
          crypto.randomUUID(),
          JSON.stringify({ name: 'Fecha rara', arrived_on: 'ayer' }),
        ]),
      ).toBe('22023');
    });
  });

  it('may not know when someone arrived: an intake may say so, staff may clear it, and an unknown day is never “Sin asignar” (Dani, 2026-10-16)', async () => {
    await inRolledBackTransaction(async (client) => {
      const unknown = (
        await submit(client, web(USERS.onboarder), { name: 'Miembro de antes', arrived_on: null })
      ).person_id;
      expect((await arrivalOf(client, unknown ?? ''))?.arrived_on).toBeNull();
      expect(await reasonsOf(client, unknown ?? '')).toEqual(['no_next_step']);
      await as(
        client,
        web(USERS.onboarder),
        'UPDATE app.people SET arrived_on = NULL WHERE id = $1',
        [PEOPLE.ana],
      );
      expect((await arrivalOf(client, PEOPLE.ana))?.arrived_on).toBeNull();
      // A report that knows the day fills an unknown one.
      await submit(client, web(USERS.onboarder), { phones: [ANA_PHONE], arrived_on: '2025-06-06' });
      expect((await arrivalOf(client, PEOPLE.ana))?.arrived_on).toBe('2025-06-06');
      // One that doesn't know leaves a known day alone.
      await submit(client, web(USERS.onboarder), { phones: [ANA_PHONE], arrived_on: null });
      expect((await arrivalOf(client, PEOPLE.ana))?.arrived_on).toBe('2025-06-06');
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      expect(
        await errorCode(client, 'SELECT * FROM private.submit_intake($1, $2, $3)', [
          'manual',
          crypto.randomUUID(),
          JSON.stringify({ name: 'Fecha numérica', arrived_on: 20_260_101 }),
        ]),
      ).toBe('22023');
    });
  });

  it('keeps a known arrival day over an unknown one in a merge', async () => {
    await inRolledBackTransaction(async (client) => {
      const other = (
        await submit(
          client,
          web(USERS.onboarder),
          { name: 'Otra persona sin fecha', arrived_on: null },
          { decision: 'new' },
        )
      ).person_id;
      await as(client, web(USERS.onboarder), 'SELECT private.merge_people($1, $2)', [
        other,
        PEOPLE.ana,
      ]);
      expect((await arrivalOf(client, other ?? ''))?.arrived_on).toBe(await madridDay(client));
    });
  });

  it('keeps the earlier arrival when a report attaches, and fills only an empty where-from', async () => {
    await inRolledBackTransaction(async (client) => {
      await submit(client, web(USERS.onboarder), {
        phones: [ANA_PHONE],
        arrived_on: '2025-05-05',
        arrival: 'email',
      });
      expect(await arrivalOf(client, PEOPLE.ana)).toEqual({
        arrived_on: '2025-05-05',
        arrival: 'email',
      });
      await submit(client, web(USERS.onboarder), {
        phones: [ANA_PHONE],
        arrived_on: '2025-09-09',
        arrival: 'discord',
      });
      expect(await arrivalOf(client, PEOPLE.ana)).toEqual({
        arrived_on: '2025-05-05',
        arrival: 'email',
      });
    });
  });

  it('keeps the earlier arrival in a merge, and the duplicate’s where-from if the survivor has none', async () => {
    await inRolledBackTransaction(async (client) => {
      const other = (
        await submit(
          client,
          web(USERS.onboarder),
          { name: 'Otra persona de ejemplo', arrived_on: '2024-12-24', arrival: 'discord' },
          { decision: 'new' },
        )
      ).person_id;
      await as(client, web(USERS.onboarder), 'SELECT private.merge_people($1, $2)', [
        PEOPLE.ana,
        other,
      ]);
      expect(await arrivalOf(client, PEOPLE.ana)).toEqual({
        arrived_on: '2024-12-24',
        arrival: 'discord',
      });
    });
  });
});

describe('when something happened (PLAN M5)', () => {
  it('lets attempts, notes and stage changes by hand say the day they happened, never a day to come', async () => {
    await inRolledBackTransaction(async (client) => {
      await as(
        client,
        web(USERS.onboarder),
        `INSERT INTO app.person_events (person_id, kind, body, happened_on)
         VALUES ($1, 'note', 'Hablamos en la manifestación', (now() AT TIME ZONE 'Europe/Madrid')::date - 3)`,
        [PEOPLE.ana],
      );
      await actAs(client, 'pauseai_backoffice_app', web(USERS.onboarder));
      await client.query("SELECT set_config('app.happened_on', '2026-01-15', true)");
      await client.query("UPDATE app.people SET stage = 'welcomed' WHERE id = $1", [PEOPLE.ana]);
      await client.query("SELECT set_config('app.happened_on', '', true)");
      expect(
        await errorCode(
          client,
          `INSERT INTO app.person_events (person_id, kind, body, happened_on)
           VALUES ($1, 'note', 'Mañana', (now() AT TIME ZONE 'Europe/Madrid')::date + 1)`,
          [PEOPLE.ana],
        ),
      ).toBe('23514');
      await client.query('RESET ROLE');
      const dated = (
        await client.query<{ kind: string; happened_on: string; actor_id: string | null }>(
          `SELECT kind::text, to_char(happened_on, 'YYYY-MM-DD') AS happened_on, actor_id
             FROM app.person_events WHERE person_id = $1 AND happened_on IS NOT NULL
              AND kind IN ('note', 'stage_changed') ORDER BY id`,
          [PEOPLE.ana],
        )
      ).rows;
      expect(dated).toEqual([
        { kind: 'note', happened_on: await madridDay(client, 3), actor_id: USERS.onboarder },
        { kind: 'stage_changed', happened_on: '2026-01-15', actor_id: USERS.onboarder },
      ]);
      // Only those three kinds, and joins and leaves (on their stay's days), say when they happened; the rest
      // happened when they were written.
      expect(
        await errorCode(
          client,
          "INSERT INTO app.person_events (person_id, kind, happened_on) VALUES ($1, 'owner_changed', '2026-01-01')",
          [PEOPLE.ana],
        ),
      ).toBe('23514');
    });
  });
});

describe('Discord usernames (PLAN M5)', () => {
  it('are kept as Discord makes them: 2 to 32 lowercase letters, digits, underscores and dots, no two dots together', async () => {
    await inRolledBackTransaction(async (client) => {
      const add = (value: string) =>
        errorCode(
          client,
          "INSERT INTO app.identities (person_id, kind, value, source) VALUES ($1, 'discord', $2, 'manual')",
          [PEOPLE.ana, value],
        );
      expect(await add('ana_ejemplo.1')).toBeNull();
      for (const bad of [
        'Ana_Ejemplo',
        'a',
        'x'.repeat(33),
        'ana..ejemplo',
        'ana ejemplo',
        'ana#1234',
      ]) {
        expect(await add(bad), bad).toBe('23514');
      }
    });
  });

  it('find someone again, and are enough to save someone reported by hand', async () => {
    await inRolledBackTransaction(async (client) => {
      const first = await submit(client, web(USERS.onboarder), {
        discords: ['persona_de_ejemplo'],
      });
      expect(first.status).toBe('created');
      const again = await submit(client, web(USERS.onboarder), {
        name: 'Persona de ejemplo',
        discords: ['persona_de_ejemplo'],
      });
      expect(again).toMatchObject({ status: 'attached', person_id: first.person_id });
    });
  });
});

describe('stays in the community, from the group’s history (PLAN R56)', () => {
  /** Imports `payloads` as one CSV file, as the app role for an admin; its counts. */
  /** A file's SHA-256, as the API sends it: any 64 hex digits. */
  const someFile = () => crypto.randomUUID().replaceAll('-', '').repeat(2);

  const importRows = async (client: pg.Client, payloads: object[], file = someFile()) =>
    (
      await as<{ counts: Record<string, number> }>(
        client,
        web(USERS.adminA),
        'SELECT private.import_csv($1, $2) AS counts',
        [file, JSON.stringify(payloads.map((payload) => ({ payload })))],
      )
    )[0]?.counts ?? {};

  const personWith = async (client: pg.Client, phone: string): Promise<string> =>
    (
      await client.query<{ person_id: string }>(
        "SELECT person_id FROM app.identities WHERE kind = 'phone' AND value = $1",
        [phone],
      )
    ).rows[0]?.person_id ?? '';

  const staysOf = async (client: pg.Client, person: string) =>
    (
      await client.query<{ joined_on: string | null; left_on: string | null }>(
        `SELECT to_char(joined_on, 'YYYY-MM-DD') AS joined_on, to_char(left_on, 'YYYY-MM-DD') AS left_on
           FROM app.community_presence WHERE person_id = $1 ORDER BY coalesce(joined_on, left_on), created_at`,
        [person],
      )
    ).rows;

  it('brings in a stay per row, on its days: someone who came back is one person, and someone who left is Baja', async () => {
    await inRolledBackTransaction(async (client) => {
      const counts = await importRows(client, [
        {
          name: 'Vuelve de Ejemplo',
          phones: ['+34600000040'],
          joined_on: '2025-03-01',
          left_on: '2025-05-02',
          arrived_on: '2025-03-01',
          arrival: 'whatsapp',
          stage: 'new',
        },
        {
          name: 'Vuelve de Ejemplo',
          phones: ['+34600000040'],
          joined_on: '2025-09-10',
          arrived_on: '2025-03-01',
          arrival: 'whatsapp',
          stage: 'new',
        },
        { phones: ['+34600000041'], joined_on: null, left_on: '2025-06-01', stage: 'left' },
      ]);
      expect(counts).toMatchObject({ received: 3, created: 2, attached: 1 });
      const back = await personWith(client, '+34600000040');
      expect(await staysOf(client, back)).toEqual([
        { joined_on: '2025-03-01', left_on: '2025-05-02' },
        { joined_on: '2025-09-10', left_on: null },
      ]);
      expect(await arrivalOf(client, back)).toEqual({
        arrived_on: '2025-03-01',
        arrival: 'whatsapp',
      });
      const gone = await personWith(client, '+34600000041');
      expect(await staysOf(client, gone)).toEqual([{ joined_on: null, left_on: '2025-06-01' }]);
      const { rows } = await client.query<{ stage: string; full_name: string | null }>(
        'SELECT stage::text AS stage, full_name FROM app.people WHERE id = $1',
        [gone],
      );
      expect(rows[0]).toEqual({ stage: 'left', full_name: null });
      expect(await reasonsOf(client, gone)).not.toContain('left_community');
    });
  });

  it('puts joins and leaves in the history on their own day; a day to come keeps the day it was written', async () => {
    await inRolledBackTransaction(async (client) => {
      await importRows(client, [
        { phones: ['+34600000042'], joined_on: '2025-03-01', left_on: '2025-05-02' },
      ]);
      const person = await personWith(client, '+34600000042');
      const days = async () =>
        (
          await client.query<{ kind: string; happened_on: string | null }>(
            `SELECT kind::text AS kind, to_char(happened_on, 'YYYY-MM-DD') AS happened_on FROM app.person_events
              WHERE person_id = $1 AND kind IN ('joined', 'left') ORDER BY id`,
            [person],
          )
        ).rows;
      expect(await days()).toEqual([
        { kind: 'joined', happened_on: '2025-03-01' },
        { kind: 'left', happened_on: '2025-05-02' },
      ]);
      await client.query(
        "INSERT INTO app.community_presence (person_id, joined_on) VALUES ($1, (now() AT TIME ZONE 'Europe/Madrid')::date + 1)",
        [person],
      );
      expect((await days()).at(-1)).toEqual({ kind: 'joined', happened_on: null });
    });
  });

  it('records a stay once, closes it when a later export says they left, and never opens it again from an older one', async () => {
    await inRolledBackTransaction(async (client) => {
      const open = { phones: ['+34600000043'], joined_on: '2025-04-01' };
      const first = someFile();
      await importRows(client, [open], first);
      expect(await importRows(client, [open], first)).toMatchObject({
        unchanged: 1,
      });
      const person = await personWith(client, '+34600000043');
      const closed = { ...open, left_on: '2025-08-01', name: 'Se va de Ejemplo' };
      await importRows(client, [closed]);
      expect(await staysOf(client, person)).toEqual([
        { joined_on: '2025-04-01', left_on: '2025-08-01' },
      ]);
      await importRows(client, [{ ...open, name: 'Se va de Ejemplo', note: 'Otra vez' }]);
      await importRows(client, [{ ...closed, note: 'Y otra' }]);
      expect(await staysOf(client, person)).toEqual([
        { joined_on: '2025-04-01', left_on: '2025-08-01' },
      ]);
    });
  });

  it('leaves the stay open now alone when a row is about an older one', async () => {
    await inRolledBackTransaction(async (client) => {
      const reported = await submit(
        client,
        bot(USERS.onboarder),
        { phones: ['+34600000044'] },
        { source: 'telegram' },
      );
      await importRows(client, [
        { phones: ['+34600000044'], joined_on: '2025-01-01', left_on: '2025-02-01' },
      ]);
      expect(await staysOf(client, reported.person_id ?? '')).toEqual([
        { joined_on: '2025-01-01', left_on: '2025-02-01' },
        { joined_on: await madridDay(client), left_on: null },
      ]);
    });
  });

  it('closes the open stay when someone whose join nobody knows leaves', async () => {
    await inRolledBackTransaction(async (client) => {
      await importRows(client, [{ phones: ['+34600000045'], joined_on: null }]);
      const person = await personWith(client, '+34600000045');
      expect(await staysOf(client, person)).toEqual([{ joined_on: null, left_on: null }]);
      await importRows(client, [
        { phones: ['+34600000045'], joined_on: null, left_on: '2025-07-07' },
      ]);
      expect(await staysOf(client, person)).toEqual([{ joined_on: null, left_on: '2025-07-07' }]);
      await importRows(client, [
        { phones: ['+34600000045'], joined_on: null, note: 'Visto antes' },
      ]);
      expect(await staysOf(client, person)).toEqual([{ joined_on: null, left_on: '2025-07-07' }]);
    });
  });

  it('still opens a stay today for a row that names a chat alone, and never one in the future', async () => {
    await inRolledBackTransaction(async (client) => {
      await importRows(client, [
        { name: 'Con chat', phones: ['+34600000046'], chat: 'Chat de ejemplo' },
        { phones: ['+34600000047'], joined_on: '2999-01-01' },
      ]);
      const today = await madridDay(client);
      expect(await staysOf(client, await personWith(client, '+34600000046'))).toEqual([
        { joined_on: today, left_on: null },
      ]);
      expect(await staysOf(client, await personWith(client, '+34600000047'))).toEqual([
        { joined_on: today, left_on: null },
      ]);
    });
  });

  it('refuses days that aren’t days, and leaving before joining', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', web(USERS.adminA));
      for (const payload of [
        { phones: ['+34600000048'], joined_on: 'ayer' },
        { phones: ['+34600000048'], joined_on: 20250101 },
        { phones: ['+34600000048'], left_on: null },
        { phones: ['+34600000048'], left_on: '1/2/25' },
        { phones: ['+34600000048'], joined_on: '2025-03-01', left_on: '2025-02-28' },
      ]) {
        expect(
          await errorCode(client, 'SELECT private.import_csv($1, $2)', [
            someFile(),
            JSON.stringify([{ payload }]),
          ]),
          JSON.stringify(payload),
        ).toBe('22023');
      }
    });
  });
});
