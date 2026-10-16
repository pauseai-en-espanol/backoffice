import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { actAs, errorCode, inRolledBackTransaction } from './db.js';
import { superuserUrl } from './env.js';
import { ANA_PHONE, CENSUS_TOKEN, PEOPLE, tokenHash, USERS } from './fixtures.js';

/** A census answer as the form sends it, fictional, with everything it needs. */
const answer = (fields: Record<string, unknown> = {}) => ({
  name: 'Censo Ejemplo',
  email: 'censo.ejemplo@ejemplo.test',
  province: 'Provincia de ejemplo',
  languages: ['Castellano'],
  availability: 'under_2h',
  consent_email: true,
  consent_whatsapp: false,
  consent_privacy: true,
  age_ok: true,
  wording_version: 'v1',
  ...fields,
});

/** Submits as the public role, as the census form's routes do. */
const submit = async (
  client: pg.Client,
  token: string | null,
  fields: Record<string, unknown> = {},
) => {
  await client.query('SET LOCAL ROLE pauseai_backoffice_public');
  try {
    const { rows } = await client.query<{ outcome: string }>(
      'SELECT private.submit_census($1, $2) AS outcome',
      [token === null ? null : tokenHash(token), JSON.stringify(answer(fields))],
    );
    return rows[0]?.outcome;
  } finally {
    await client.query('RESET ROLE');
  }
};

const optionId = async (client: pg.Client, label: string): Promise<string> =>
  (
    await client.query<{ id: string }>('SELECT id FROM app.census_options WHERE label = $1', [
      label,
    ])
  ).rows[0]?.id ?? '';

describe('the census form', () => {
  it('shows the lists to anyone, and greets a personal link’s person by first name only', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query('SET LOCAL ROLE pauseai_backoffice_public');
      const generic = await client.query('SELECT * FROM private.census_form()');
      expect(generic.rows[0]).toMatchObject({ greeting: null, link: 'generic' });
      expect(generic.rows[0]?.options.map((o: { label: string }) => o.label)).toContain('Diseño');
      const personal = await client.query('SELECT greeting, link FROM private.census_form($1)', [
        tokenHash(CENSUS_TOKEN),
      ]);
      expect(personal.rows[0]).toEqual({ greeting: 'Ana', link: 'personal' });
      const wrong = await client.query('SELECT greeting, link FROM private.census_form($1)', [
        tokenHash('otro'),
      ]);
      expect(wrong.rows[0]).toEqual({ greeting: null, link: 'invalid' });
      // Nothing else: no table, no other function.
      expect(await errorCode(client, 'SELECT 1 FROM app.people')).toBe('42501');
      expect(await errorCode(client, "SELECT * FROM private.bot_people('unassigned')")).toBe(
        '42501',
      );
    });
  });

  it('through the generic link, makes someone new in Por clasificar, with their answers', async () => {
    await inRolledBackTransaction(async (client) => {
      const design = await optionId(client, 'Diseño');
      expect(await submit(client, null, { options: [design], skills_other: 'Fotografía' })).toBe(
        'created',
      );
      const { rows } = await client.query(
        `SELECT p.id, p.stage::text, p.availability::text, p.skills_other, p.profile_completed_at IS NOT NULL AS done
           FROM app.people p JOIN app.identities i ON i.person_id = p.id WHERE i.value = 'censo.ejemplo@ejemplo.test'`,
      );
      expect(rows[0]).toMatchObject({
        stage: 'to_triage',
        availability: 'under_2h',
        skills_other: 'Fotografía',
        done: true,
      });
      const person = rows[0]?.id as string;
      const consents = await client.query(
        'SELECT kind, granted, wording_version FROM app.consents WHERE person_id = $1 ORDER BY kind',
        [person],
      );
      expect(consents.rows).toEqual([
        { kind: 'email', granted: true, wording_version: 'v1' },
        { kind: 'privacy', granted: true, wording_version: 'v1' },
        { kind: 'whatsapp', granted: false, wording_version: 'v1' },
      ]);
      const options = await client.query(
        'SELECT option_id FROM app.person_options WHERE person_id = $1',
        [person],
      );
      expect(options.rows).toEqual([{ option_id: design }]);
    });
  });

  it('through the generic link, never overwrites someone it matches: the answer waits in the Bandeja', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await submit(client, null, { name: 'Alguien Distinto', phone: ANA_PHONE, email: '' }),
      ).toBe('review');
      const [person] = (
        await client.query('SELECT full_name, profile_completed_at FROM app.people WHERE id = $1', [
          PEOPLE.ana,
        ])
      ).rows;
      expect(person).toEqual({ full_name: 'Ana Ejemplo Uno', profile_completed_at: null });
      const [intake] = (
        await client.query(
          "SELECT id, status::text, person_id FROM app.intake_records WHERE source = 'census' ORDER BY created_at DESC LIMIT 1",
        )
      ).rows;
      expect(intake).toMatchObject({ status: 'conflict', person_id: PEOPLE.ana });
      // A person who checked it's Ana's applies it, as her own answer would.
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      await client.query("SELECT private.resolve_intake($1, 'apply')", [intake?.id]);
      await client.query('RESET ROLE');
      const [applied] = (
        await client.query('SELECT full_name, availability::text FROM app.people WHERE id = $1', [
          PEOPLE.ana,
        ])
      ).rows;
      expect(applied).toEqual({ full_name: 'Alguien Distinto', availability: 'under_2h' });
    });
  });

  it('through a personal link, updates the person directly, adding contact details nobody holds', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await submit(client, CENSUS_TOKEN, { name: 'Ana Ejemplo Uno', preferred_name: 'Anita' }),
      ).toBe('updated');
      const [person] = (
        await client.query(
          'SELECT preferred_name, province, profile_completed_at IS NOT NULL AS done FROM app.people WHERE id = $1',
          [PEOPLE.ana],
        )
      ).rows;
      expect(person).toEqual({
        preferred_name: 'Anita',
        province: 'Provincia de ejemplo',
        done: true,
      });
      const emails = await client.query(
        "SELECT value FROM app.identities WHERE person_id = $1 AND kind = 'email'",
        [PEOPLE.ana],
      );
      expect(emails.rows).toEqual([{ value: 'censo.ejemplo@ejemplo.test' }]);
      const [link] = (
        await client.query(
          'SELECT used_at IS NOT NULL AS used FROM app.census_links WHERE person_id = $1',
          [PEOPLE.ana],
        )
      ).rows;
      expect(link).toEqual({ used: true });
      expect(
        (
          await client.query(
            "SELECT kind FROM app.person_events WHERE person_id = $1 AND kind = 'form_submitted'",
            [PEOPLE.ana],
          )
        ).rows,
      ).toHaveLength(1);
    });
  });

  it('refuses an expired or unknown link, a missing age or privacy confirmation, and fields it doesn’t take', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await submit(client, 'no-existe')).toBe('invalid');
      await client.query("SET LOCAL session_replication_role = 'replica'");
      await client.query(
        "UPDATE app.census_links SET created_at = now() - interval '31 days', expires_at = now() - interval '1 day'",
      );
      await client.query("SET LOCAL session_replication_role = 'origin'");
      expect(await submit(client, CENSUS_TOKEN)).toBe('invalid');
      await client.query('SET LOCAL ROLE pauseai_backoffice_public');
      for (const [fields, code] of [
        [{ age_ok: false }, '23514'],
        [{ consent_privacy: false }, '23514'],
        [{ name: ' ' }, '23514'],
        [{ notas: 'x' }, '22023'],
      ] as const) {
        expect(
          await errorCode(client, 'SELECT private.submit_census(NULL, $1)', [
            JSON.stringify(answer(fields)),
          ]),
          JSON.stringify(fields),
        ).toBe(code);
      }
    });
  });
});

describe('personal links', () => {
  it('are made and marked sent by onboarding staff, once, and never show their hash', async () => {
    await inRolledBackTransaction(async (client) => {
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(await errorCode(client, 'SELECT token_hash FROM app.census_links')).toBe('42501');
      await client.query('UPDATE app.census_links SET sent_at = now() WHERE person_id = $1', [
        PEOPLE.ana,
      ]);
      const { rowCount } = await client.query(
        'UPDATE app.census_links SET sent_at = now() WHERE person_id = $1',
        [PEOPLE.ana],
      );
      expect(rowCount).toBe(0);
      await client.query('RESET ROLE');
      const [link] = (
        await client.query('SELECT sent_by FROM app.census_links WHERE person_id = $1', [
          PEOPLE.ana,
        ])
      ).rows;
      expect(link).toEqual({ sent_by: USERS.onboarder });
    });
  });
});

describe('erasure', () => {
  it('anonymises a person for admins only: profile, identities and the timeline’s words go, the counts stay', async () => {
    await inRolledBackTransaction(async (client) => {
      await client.query(
        "INSERT INTO app.person_events (person_id, kind, body) VALUES ($1, 'note', 'Algo personal')",
        [PEOPLE.ana],
      );
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(await errorCode(client, 'SELECT private.anonymise_person($1)', [PEOPLE.ana])).toBe(
        '42501',
      );
      await client.query('RESET ROLE');
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.adminA,
        aal: 2,
        channel: 'web',
      });
      const { rows } = await client.query<{ done: boolean }>(
        'SELECT private.anonymise_person($1) AS done',
        [PEOPLE.ana],
      );
      expect(rows[0]?.done).toBe(true);
      await client.query('RESET ROLE');
      const [person] = (
        await client.query(
          'SELECT full_name, province, stage::text, anonymised_at IS NOT NULL AS gone FROM app.people WHERE id = $1',
          [PEOPLE.ana],
        )
      ).rows;
      expect(person).toEqual({
        full_name: 'Persona anonimizada',
        province: null,
        stage: 'new',
        gone: true,
      });
      expect(
        (await client.query('SELECT 1 FROM app.identities WHERE person_id = $1', [PEOPLE.ana]))
          .rows,
      ).toEqual([]);
      const notes = await client.query(
        "SELECT body FROM app.person_events WHERE person_id = $1 AND kind = 'note'",
        [PEOPLE.ana],
      );
      expect(notes.rows).toEqual([{ body: null }]);
      // The timeline stays append-only for everyone else.
      expect(
        await errorCode(client, "UPDATE app.person_events SET body = 'x' WHERE person_id = $1", [
          PEOPLE.ana,
        ]),
      ).toBe('23001');
      const audit = await client.query(
        "SELECT diff::text FROM app.audit_log WHERE table_name = 'people' AND row_id = $1 ORDER BY id DESC LIMIT 1",
        [PEOPLE.ana],
      );
      expect(audit.rows[0]?.diff).not.toContain('Ana');
    });
  });
});

describe('erasure that holds (security review of M2)', () => {
  const asAdmin = (client: pg.Client) =>
    actAs(client, 'pauseai_backoffice_app', { userId: USERS.adminA, aal: 2, channel: 'web' });
  const erase = async (client: pg.Client, person: string) => {
    await asAdmin(client);
    const { rows } = await client.query<{ done: boolean }>(
      'SELECT private.anonymise_person($1) AS done',
      [person],
    );
    await client.query('RESET ROLE');
    return rows[0]?.done;
  };
  const sync = async (client: pg.Client, records: unknown[]) => {
    await client.query('SET LOCAL ROLE pauseai_backoffice_ingest');
    const { rows } = await client.query<{ counts: Record<string, number> }>(
      'SELECT private.ingest_airtable($1) AS counts',
      [JSON.stringify(records)],
    );
    await client.query('RESET ROLE');
    return rows[0]?.counts;
  };

  it('is not undone by the next Airtable sync, which counts the record as erased', async () => {
    await inRolledBackTransaction(async (client) => {
      const record = {
        external_id: 'recEjemploBorra01',
        payload: {
          name: 'Irene Ejemplo',
          emails: ['irene.borrada@ejemplo.test'],
          province: 'Provincia de ejemplo',
          airtable_id: 'recEjemploBorra01',
        },
      };
      expect(await sync(client, [record])).toMatchObject({ created: 1 });
      const { rows } = await client.query<{ person_id: string }>(
        "SELECT person_id FROM app.identities WHERE value = 'irene.borrada@ejemplo.test'",
      );
      const person = rows[0]?.person_id ?? '';
      expect(await erase(client, person)).toBe(true);
      // The same record again, and changed: neither brings anything back, nor makes someone new.
      expect(await sync(client, [record])).toMatchObject({ erased: 1, created: 0, updated: 0 });
      expect(
        await sync(client, [{ ...record, payload: { ...record.payload, town: 'Otra' } }]),
      ).toMatchObject({ erased: 1, created: 0 });
      const after = await client.query(
        `SELECT p.full_name, p.province, (SELECT count(*)::int FROM app.identities i WHERE i.person_id = p.id) AS ids
           FROM app.people p WHERE p.id = $1`,
        [person],
      );
      expect(after.rows[0]).toEqual({ full_name: 'Persona anonimizada', province: null, ids: 0 });
      // Global's record id no longer appears in clear.
      const kept = await client.query(
        "SELECT 1 FROM app.intake_records WHERE external_id = 'recEjemploBorra01'",
      );
      expect(kept.rows).toEqual([]);
    });
  });

  it('covers the duplicates merged into the person, and spares an arrival that only named them', async () => {
    await inRolledBackTransaction(async (client) => {
      const other = await client.query<{ id: string }>(
        `INSERT INTO app.intake_records (source, external_id, payload, status, candidates)
         VALUES ('manual', 'otra-llegada', '{"name": "Ana Ejemplo Otra"}', 'review', ARRAY[$1::uuid])
         RETURNING id`,
        [PEOPLE.ana],
      );
      expect(await erase(client, PEOPLE.ana)).toBe(true);
      const tombstone = await client.query(
        'SELECT full_name, anonymised_at IS NOT NULL AS gone FROM app.people WHERE id = $1',
        [PEOPLE.anaDuplicate],
      );
      expect(tombstone.rows[0]).toEqual({ full_name: 'Persona anonimizada', gone: true });
      const spared = await client.query(
        'SELECT payload, candidates, status::text FROM app.intake_records WHERE id = $1',
        [other.rows[0]?.id],
      );
      expect(spared.rows[0]).toEqual({
        payload: { name: 'Ana Ejemplo Otra' },
        candidates: [],
        status: 'review',
      });
    });
  });

  it('freezes the erased person: nothing is added to them, and their row stays as it was left', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(await erase(client, PEOPLE.ana)).toBe(true);
      for (const statement of [
        "INSERT INTO app.identities (person_id, kind, value, source) VALUES ($1, 'email', 'vuelta@ejemplo.test', 'manual')",
        "INSERT INTO app.person_sources (person_id, source) VALUES ($1, 'csv')",
        'INSERT INTO app.community_presence (person_id, joined_on) VALUES ($1, current_date)',
        "UPDATE app.people SET full_name = 'Ana Vuelta' WHERE id = $1",
      ]) {
        expect(await errorCode(client, statement, [PEOPLE.ana])).toBe('23001');
      }
    });
  });
});

describe('the census, after the review', () => {
  it('applies a generic answer with its new email, and the consents it gave when it was given', async () => {
    await inRolledBackTransaction(async (client) => {
      expect(
        await submit(client, null, {
          phone: ANA_PHONE,
          email: 'ana.nueva@ejemplo.test',
          consent_email: true,
        }),
      ).toBe('review');
      const { rows } = await client.query<{ id: string; answered: string }>(
        `SELECT id, conflicts -> 'census' ->> 'answered_at' AS answered FROM app.intake_records
          WHERE source = 'census' AND person_id = $1`,
        [PEOPLE.ana],
      );
      expect(rows[0]?.answered).toBeTruthy();
      // Answered days before anyone applies it.
      const answered = '2026-10-01T10:00:00.000Z';
      await client.query(
        `UPDATE app.intake_records SET conflicts = jsonb_set(conflicts, '{census,answered_at}', to_jsonb($2::text))
          WHERE id = $1`,
        [rows[0]?.id, answered],
      );
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      await client.query("SELECT private.resolve_intake($1, 'apply')", [rows[0]?.id]);
      await client.query('RESET ROLE');
      const email = await client.query(
        "SELECT source::text FROM app.identities WHERE person_id = $1 AND value = 'ana.nueva@ejemplo.test'",
        [PEOPLE.ana],
      );
      expect(email.rows).toEqual([{ source: 'census' }]);
      const consent = await client.query<{ given: string; granted: boolean }>(
        `SELECT to_json(given_at)#>>'{}' AS given, granted FROM app.consents
          WHERE person_id = $1 AND kind = 'email' ORDER BY created_at DESC LIMIT 1`,
        [PEOPLE.ana],
      );
      expect(consent.rows[0]?.granted).toBe(true);
      expect(new Date(consent.rows[0]?.given ?? '').toISOString()).toBe(answered);
    });
  });

  it('attaches an answer that matched two people to one of them, and never makes a third', async () => {
    await inRolledBackTransaction(async (client) => {
      const other = await client.query<{ id: string }>(
        "INSERT INTO app.people (full_name, stage) VALUES ('Bea Ejemplo', 'new') RETURNING id",
      );
      const bea = other.rows[0]?.id ?? '';
      await client.query(
        "INSERT INTO app.identities (person_id, kind, value, source) VALUES ($1, 'email', 'bea@ejemplo.test', 'manual')",
        [bea],
      );
      expect(await submit(client, null, { phone: ANA_PHONE, email: 'bea@ejemplo.test' })).toBe(
        'review',
      );
      const { rows } = await client.query<{ id: string }>(
        "SELECT id FROM app.intake_records WHERE source = 'census' AND status = 'review'",
      );
      await actAs(client, 'pauseai_backoffice_app', {
        userId: USERS.onboarder,
        aal: 2,
        channel: 'web',
      });
      expect(
        await errorCode(client, "SELECT private.resolve_intake($1, 'new')", [rows[0]?.id]),
      ).toBe('23001');
      const attached = await client.query<{ outcome: string }>(
        "SELECT private.resolve_intake($1, 'attach', $2)::text AS outcome",
        [rows[0]?.id, bea],
      );
      expect(attached.rows[0]?.outcome).toBe('conflict');
      const applied = await client.query<{ outcome: string }>(
        "SELECT private.resolve_intake($1, 'apply')::text AS outcome",
        [rows[0]?.id],
      );
      expect(applied.rows[0]?.outcome).toBe('attached');
      await client.query('RESET ROLE');
      const named = await client.query('SELECT full_name FROM app.people WHERE id = $1', [bea]);
      expect(named.rows[0]?.full_name).toBe('Censo Ejemplo');
    });
  });

  it('names someone saved without a name, greeting them with none until then (PLAN R37)', async () => {
    await inRolledBackTransaction(async (client) => {
      const made = await client.query<{ id: string }>(
        "INSERT INTO app.people (stage) VALUES ('new') RETURNING id",
      );
      const nameless = made.rows[0]?.id ?? '';
      await client.query("SELECT set_config('app.user_id', $1, true)", [USERS.onboarder]);
      await client.query(
        `INSERT INTO app.census_links (person_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [nameless, tokenHash('enlace-sin-nombre')],
      );
      const form = await client.query('SELECT greeting, link FROM private.census_form($1)', [
        tokenHash('enlace-sin-nombre'),
      ]);
      expect(form.rows[0]).toEqual({ greeting: null, link: 'personal' });
      expect(await submit(client, 'enlace-sin-nombre')).toBe('updated');
      const named = await client.query('SELECT full_name FROM app.people WHERE id = $1', [
        nameless,
      ]);
      expect(named.rows[0]?.full_name).toBe('Censo Ejemplo');
    });
  });

  it('lets a personal link work only while it is the person’s latest, and through a merge', async () => {
    await inRolledBackTransaction(async (client) => {
      const form = async (token: string) =>
        (
          await client.query<{ link: string; greeting: string | null }>(
            'SELECT link, greeting FROM private.census_form($1)',
            [tokenHash(token)],
          )
        ).rows[0];
      expect(await form(CENSUS_TOKEN)).toMatchObject({ link: 'personal' });
      await client.query("SELECT set_config('app.user_id', $1, true)", [USERS.onboarder]);
      // A link for the duplicate, made before the merge, now greets and updates the survivor.
      await client.query(
        `INSERT INTO app.census_links (person_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [PEOPLE.anaDuplicate, tokenHash('enlace-del-duplicado')],
      );
      expect(await form('enlace-del-duplicado')).toEqual({ link: 'personal', greeting: 'Ana' });
      expect(await submit(client, 'enlace-del-duplicado', { name: 'Ana Por Enlace Viejo' })).toBe(
        'updated',
      );
      const names = await client.query<{ id: string; full_name: string }>(
        'SELECT id, full_name FROM app.people WHERE id = ANY($1::uuid[]) ORDER BY id',
        [[PEOPLE.ana, PEOPLE.anaDuplicate]],
      );
      expect(names.rows.find((row) => row.id === PEOPLE.ana)?.full_name).toBe(
        'Ana Por Enlace Viejo',
      );
      expect(names.rows.find((row) => row.id === PEOPLE.anaDuplicate)?.full_name).not.toBe(
        'Ana Por Enlace Viejo',
      );
      // A newer link for Ana replaces the old one.
      await client.query(
        `INSERT INTO app.census_links (person_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 days')`,
        [PEOPLE.ana, tokenHash('enlace-nuevo-de-ana')],
      );
      expect(await form(CENSUS_TOKEN)).toMatchObject({ link: 'invalid', greeting: null });
      expect(await form('enlace-nuevo-de-ana')).toMatchObject({ link: 'personal' });
      expect(await submit(client, CENSUS_TOKEN)).toBe('invalid');
    });
  });
});

describe('two answers at once', () => {
  const email = 'a.la.vez@ejemplo.test';
  const phone = '+34600000999';

  /** Removes everything a committed answer made: a person, their identities, sources, consents and events. */
  const cleanUp = async () => {
    const client = new pg.Client({ connectionString: superuserUrl() });
    await client.connect();
    try {
      await client.query('BEGIN');
      // Append-only tables refuse deletes through their triggers; this is the test's own data.
      await client.query("SET LOCAL session_replication_role = 'replica'");
      const people = (
        await client.query<{ person_id: string }>(
          `SELECT person_id FROM app.identities
            WHERE (kind = 'email' AND value LIKE 'a.la.vez%') OR (kind = 'phone' AND value = $1)`,
          [phone],
        )
      ).rows.map((r) => r.person_id);
      const tables = (
        await client.query<{ name: string }>(
          `SELECT c.table_name AS name FROM information_schema.columns c
             JOIN information_schema.tables t USING (table_schema, table_name)
            WHERE c.table_schema = 'app' AND c.column_name = 'person_id' AND t.table_type = 'BASE TABLE'`,
        )
      ).rows.map((r) => r.name);
      for (const table of tables) {
        await client.query(`DELETE FROM app.${table} WHERE person_id = ANY($1::uuid[])`, [people]);
      }
      await client.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [people]);
      await client.query(
        `DELETE FROM app.intake_records WHERE source = 'census'
            AND (payload ->> 'emails' LIKE '%a.la.vez%' OR payload -> 'phones' ? $1)`,
        [phone],
      );
      await client.query('COMMIT');
    } finally {
      await client.end();
    }
  };

  it.each([
    ['email', { email }, { email, name: 'Otra Persona Ejemplo' }],
    ['phone', { email, phone }, { email: 'a.la.vez.otra@ejemplo.test', phone }],
  ])(
    'with the same new %s: the second waits for the first, and goes to the Bandeja',
    async (_, firstAnswer, secondAnswer) => {
      const first = new pg.Client({ connectionString: superuserUrl() });
      const second = new pg.Client({ connectionString: superuserUrl() });
      await Promise.all([first.connect(), second.connect()]);
      await cleanUp();
      try {
        await first.query('BEGIN');
        expect(await submit(first, null, firstAnswer)).toBe('created');
        await second.query('BEGIN');
        const { rows } = await second.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        const later = submit(second, null, secondAnswer);
        // The second is held until the first is done.
        const waiting = async () =>
          (
            await first.query<{ waiting: boolean }>(
              "SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = $1",
              [rows[0]?.pid],
            )
          ).rows[0]?.waiting;
        for (let tries = 0; tries < 50 && !(await waiting()); tries += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(await waiting()).toBe(true);
        await first.query('COMMIT');
        expect(await later).toBe('review');
        await second.query('ROLLBACK');
      } finally {
        await Promise.all([first.end(), second.end()]);
        await cleanUp();
      }
    },
  );
});
