import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { openLink, sealLink } from '../src/imports/airtable-link.js';
import { runAirtableSync } from '../src/imports/airtable-sync.js';
import {
  browser,
  createAccount,
  deleteAccount,
  limiterAddress,
  PASSWORD,
  SECRET,
  STAFF_ORIGIN,
  testAddress,
  TOTP_ISSUER,
  totpCode,
} from './auth-fixtures.js';
import './db.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.`);
  }
  return value;
};

const authPool = createAuthPool({
  connectionString: env('TEST_AUTH_DATABASE_URL'),
  maxConnections: 4,
});
const superuser = createAuthPool({
  connectionString: env('TEST_SUPERUSER_DATABASE_URL'),
  maxConnections: 1,
});
const appDb = createDatabase({ connectionString: env('TEST_APP_DATABASE_URL'), maxConnections: 2 });
const ingest = createDatabase({
  connectionString: env('TEST_INGEST_DATABASE_URL'),
  maxConnections: 1,
});

/** A fictional Airtable view, served by a fake fetch: the page, then its data. */
const LINK = 'https://airtable.com/appEjemplo000001/shrEjemplo0000001';
/** This test run's AIRTABLE_LINK_KEY: the link admins set is sealed with it (ADR-0005). */
const KEY = randomBytes(32);
const airtableRows: { id: string; cellValuesByColumnId: Record<string, unknown> }[] = [];
const fakeAirtable = (async (input: string | URL) => {
  if (String(input) === LINK) {
    const policy = encodeURIComponent(JSON.stringify({ applicationId: 'appEjemplo000001' }));
    return new Response(
      `{"urlWithParams":"/v0.3/view/viwEjemplo/readSharedViewData?accessPolicy=${policy}"}`,
    );
  }
  return Response.json({
    data: {
      table: {
        columns: [
          { id: 'fldName', name: 'Full name', type: 'text' },
          { id: 'fldEmail', name: 'Email', type: 'text' },
          { id: 'fldOk', name: 'GDPR chapter share permission', type: 'checkbox' },
        ],
        rows: airtableRows,
      },
    },
  });
}) as typeof fetch;

const arrivals: string[] = [];
const app = buildApp({
  api: {
    auth: {
      auth: createAuth({
        pool: authPool,
        secret: SECRET,
        staffOrigin: STAFF_ORIGIN,
        totpIssuer: TOTP_ISSUER,
      }),
      staffOrigin: STAFF_ORIGIN,
    },
    app: appDb,
    syncAirtable: () =>
      runAirtableSync({ ingest, key: KEY, requirePermission: true, fetch: fakeAirtable }),
    airtableKey: KEY,
    onArrival: async (personId) => {
      arrivals.push(personId);
    },
  },
});

const accounts: string[] = [];
const addresses: string[] = [];
const people: string[] = [];

/** An enrolled account made staff with `roles` by the owner's SQL, signed in, on `on` (this file's app by default). */
const staffMemberOn = async (on: typeof app, ...roles: string[]) => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const address = testAddress();
  addresses.push(address);
  const who = browser(on, address);
  expect(
    (
      await who.send('POST', '/api/auth/sign-in/email', {
        email: created.email,
        password: PASSWORD,
      })
    ).statusCode,
  ).toBe(200);
  const { totpURI } = (
    await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD })
  ).json<{
    totpURI: string;
  }>();
  expect(
    (await who.send('POST', '/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) }))
      .statusCode,
  ).toBe(200);
  await superuser.query(
    'INSERT INTO app.staff (user_id, display_name) SELECT id, name FROM auth.users WHERE id = $1',
    [created.id],
  );
  for (const role of roles) {
    await superuser.query('INSERT INTO app.staff_roles (user_id, role) VALUES ($1, $2)', [
      created.id,
      role,
    ]);
  }
  return { ...created, who };
};

const staffMember = async (...roles: string[]) => staffMemberOn(app, ...roles);

let onboarder: Awaited<ReturnType<typeof staffMember>>;
let admin: Awaited<ReturnType<typeof staffMember>>;
let outreacher: Awaited<ReturnType<typeof staffMember>>;

const suffix = () =>
  Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0');

beforeAll(async () => {
  await app.ready();
  onboarder = await staffMember('onboarding');
  admin = await staffMember('admin');
  outreacher = await staffMember('outreach');
});

afterAll(async () => {
  // What the tests made, as superuser, past the append-only and keep-an-admin rules (local test data only).
  await superuser.query("SET session_replication_role = 'replica'");
  await superuser.query(
    `DELETE FROM app.person_events WHERE person_id IN (SELECT id FROM app.people WHERE id = ANY($1::uuid[])
                                                       OR merged_into = ANY($1::uuid[]))`,
    [people],
  );
  for (const table of ['app.identities', 'app.community_presence', 'app.person_sources']) {
    await superuser.query(`DELETE FROM ${table} WHERE person_id = ANY($1::uuid[])`, [people]);
  }
  await superuser.query(
    'DELETE FROM app.intake_records WHERE reported_by = ANY($1::uuid[]) OR person_id = ANY($2::uuid[])',
    [accounts, people],
  );
  await superuser.query(
    'DELETE FROM app.people WHERE id = ANY($1::uuid[]) OR owner_id = ANY($2::uuid[])',
    [people, accounts],
  );
  await superuser.query('DELETE FROM app.imports WHERE started_by = ANY($1::uuid[])', [accounts]);
  await superuser.query('DELETE FROM app.exports WHERE created_by = ANY($1::uuid[])', [accounts]);
  await superuser.query('DELETE FROM app.staff_roles WHERE user_id = ANY($1::uuid[])', [accounts]);
  await superuser.query('DELETE FROM app.staff WHERE user_id = ANY($1::uuid[])', [accounts]);
  await superuser.query("SET session_replication_role = 'origin'");
  for (const id of accounts) {
    await deleteAccount(authPool, id);
  }
  for (const address of addresses) {
    await authPool.query(
      `DELETE FROM rate_limits WHERE key LIKE $1 || '|%' OR key LIKE $2 || '|%'`,
      [address, limiterAddress(address)],
    );
  }
  await app.close();
  await Promise.all([appDb.destroy(), ingest.destroy()]);
  await superuser.end();
  await authPool.end();
});

describe('onboarding through the staff API (M1)', () => {
  it('quick-adds someone, who then shows unassigned in Hoy and is announced', async () => {
    const phone = `6000${suffix()}`.slice(0, 9);
    const added = await onboarder.who.send('POST', '/api/intake', {
      name: `Lucía Prueba ${suffix()}`,
      phone,
      email: `lucia.${suffix()}@ejemplo.test`,
      province: 'Provincia de ejemplo',
      note: 'Vino a la charla',
    });
    expect(added.statusCode).toBe(201);
    const { status, personId } = added.json<{ status: string; personId: string }>();
    expect(status).toBe('created');
    people.push(personId);
    expect(arrivals).toContain(personId);
    const today = (await onboarder.who.send('GET', '/api/today')).json<{
      unassigned: { id: string; reasons: string[] }[];
    }>();
    expect(today.unassigned.find((p) => p.id === personId)?.reasons).toEqual([
      'unassigned',
      'no_next_step',
    ]);
    // Found by its phone, written another way; the list never carries contact details.
    const found = await onboarder.who.send(
      'GET',
      `/api/people?q=${encodeURIComponent(`+34 ${phone}`)}`,
    );
    const list = found.json<{ people: { id: string }[] }>();
    expect(list.people.map((p) => p.id)).toEqual([personId]);
    expect(found.body).not.toContain(phone.slice(-6));
  });

  it('quick-adds someone with only a phone, nameless until a name is set (PLAN R37)', async () => {
    expect(
      (await onboarder.who.send('POST', '/api/intake', { province: 'Provincia de ejemplo' }))
        .statusCode,
    ).toBe(400);
    const phone = `6001${suffix()}`.slice(0, 9);
    const added = await onboarder.who.send('POST', '/api/intake', { phone });
    expect(added.statusCode).toBe(201);
    const { status, personId } = added.json<{ status: string; personId: string }>();
    expect(status).toBe('created');
    people.push(personId);
    const page = (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{
      person: { name: string | null; fullName: string | null };
    }>();
    expect(page.person).toMatchObject({ name: null, fullName: null });
    const named = await onboarder.who.send('PATCH', `/api/people/${personId}`, {
      fullName: 'Nombre Puesto Después',
    });
    expect(named.statusCode).toBeLessThan(300);
    const after = (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{
      person: { name: string | null };
    }>();
    expect(after.person.name).toBe('Nombre Puesto Después');
  });

  it('works a person: claim, next action, contact attempts, notes, identities, leaving', async () => {
    const { personId } = (
      await onboarder.who.send('POST', '/api/intake', {
        name: `Marta Prueba ${suffix()}`,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(personId);
    expect((await onboarder.who.send('POST', `/api/people/${personId}/claim`)).statusCode).toBe(
      204,
    );
    expect((await admin.who.send('POST', `/api/people/${personId}/claim`)).statusCode).toBe(409);
    expect(
      (
        await onboarder.who.send('PATCH', `/api/people/${personId}`, {
          nextAction: 'Escribir por WhatsApp',
          nextActionDue: '2030-01-15',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${personId}/attempts`, {
          channel: 'whatsapp',
          outcome: 'replied',
        })
      ).statusCode,
    ).toBe(201);
    // A video call is a channel of its own (Dani, 2026-10-18).
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${personId}/attempts`, {
          channel: 'video',
          outcome: 'replied',
        })
      ).statusCode,
    ).toBe(201);
    // So is Discord (Dani, 2026-10-19).
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${personId}/attempts`, {
          channel: 'discord',
          outcome: 'no_answer',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${personId}/notes`, {
          body: 'Le interesa política',
        })
      ).statusCode,
    ).toBe(201);
    const phone = `61${suffix()}0`.slice(0, 9);
    const identity = await onboarder.who.send('POST', `/api/people/${personId}/identities`, {
      kind: 'phone',
      value: phone,
    });
    expect(identity.statusCode).toBe(201);
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${personId}/identities`, {
          kind: 'phone',
          value: 'no',
        })
      ).json(),
    ).toEqual({ error: 'invalid', field: 'value' });
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${personId}/joined`, {
          chat: 'Chat de ejemplo',
        })
      ).statusCode,
    ).toBe(204);
    expect((await onboarder.who.send('POST', `/api/people/${personId}/left`, {})).statusCode).toBe(
      204,
    );
    const page = (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{
      person: {
        stage: string;
        owner: { userId: string };
        identities: { value: string }[];
        whatsapp: string;
        reasons: string[];
      };
      timeline: { kind: string; channel: string }[];
    }>();
    expect(page.person.stage).toBe('contacting');
    expect(page.person.owner.userId).toBe(onboarder.id);
    expect(page.person.identities.map((i) => i.value)).toEqual([`+34${phone}`]);
    expect(page.person.whatsapp).toBe(`https://wa.me/34${phone}`);
    expect(page.person.reasons).toContain('left_community');
    expect(page.timeline.map((e) => e.kind)).toEqual(
      expect.arrayContaining([
        'created',
        'owner_changed',
        'next_action_set',
        'contact_attempt',
        'stage_changed',
        'note',
        'joined',
        'left',
      ]),
    );
    expect(page.timeline.every((e) => e.channel === 'web' || e.channel === null)).toBe(true);
  });

  it('lists my people on Hoy most urgent first: a late step, one for today, someone not contacted yet, then the rest (PLAN R70)', async () => {
    const taken = async (name: string) => {
      const { personId } = (
        await onboarder.who.send('POST', '/api/intake', {
          name: `${name} ${suffix()}`,
          decision: 'new',
        })
      ).json<{ personId: string }>();
      people.push(personId);
      expect((await onboarder.who.send('POST', `/api/people/${personId}/claim`)).statusCode).toBe(
        204,
      );
      return personId;
    };
    const step = async (personId: string, due: string) =>
      expect(
        (
          await onboarder.who.send('PATCH', `/api/people/${personId}`, {
            nextAction: 'Llamar',
            nextActionDue: due,
          })
        ).statusCode,
      ).toBe(204);
    const { rows } = await superuser.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS today, to_char(d - 1, 'YYYY-MM-DD') AS yesterday
         FROM (SELECT (now() AT TIME ZONE 'Europe/Madrid')::date AS d) AS madrid`,
    );
    const { today, yesterday } = rows[0] as { today: string; yesterday: string };

    // Made in the reverse order, so that by age alone the one just taken would come after the one in contact.
    const inContact = await taken('Ines Contactada');
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${inContact}/attempts`, {
          channel: 'whatsapp',
          outcome: 'no_answer',
        })
      ).statusCode,
    ).toBe(201);
    const justTaken = await taken('Nora Recien');
    const forToday = await taken('Olga Hoy');
    await step(forToday, today);
    const late = await taken('Paula Tarde');
    await step(late, yesterday);

    const { mine } = (await onboarder.who.send('GET', '/api/today')).json<{
      mine: { id: string; reasons: string[] }[];
    }>();
    const ours = [late, forToday, justTaken, inContact];
    expect(mine.map((p) => p.id).filter((id) => ours.includes(id))).toEqual(ours);
    expect(mine.find((p) => p.id === justTaken)?.reasons).toEqual(['no_next_step']);
  });

  it('sends a likely duplicate to the Bandeja, where it is attached; then merges two people', async () => {
    const name = `Nerea Duplicada ${suffix()}`;
    const first = (await onboarder.who.send('POST', '/api/intake', { name })).json<{
      personId: string;
    }>();
    people.push(first.personId);
    const candidates = (
      await onboarder.who.send('GET', `/api/candidates?name=${encodeURIComponent(name)}`)
    ).json<{
      candidates: { personId: string }[];
    }>();
    expect(candidates.candidates.map((c) => c.personId)).toContain(first.personId);
    const second = (
      await onboarder.who.send('POST', '/api/intake', { name, town: 'Pueblo de ejemplo' })
    ).json<{
      intakeId: string;
      status: string;
    }>();
    expect(second.status).toBe('review');
    const bandeja = (await onboarder.who.send('GET', '/api/bandeja')).json<{
      items: { id: string; candidates: { id: string }[] }[];
    }>();
    const item = bandeja.items.find((i) => i.id === second.intakeId);
    expect(item?.candidates.map((c) => c.id)).toContain(first.personId);
    expect(
      (
        await onboarder.who.send('POST', `/api/bandeja/${second.intakeId}`, {
          decision: 'attach',
          target: first.personId,
        })
      ).json(),
    ).toEqual({ status: 'attached' });

    const other = (
      await onboarder.who.send('POST', '/api/intake', { name: `Otra ${suffix()}`, decision: 'new' })
    ).json<{
      personId: string;
    }>();
    people.push(other.personId);
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${first.personId}/merge`, {
          mergedId: other.personId,
        })
      ).statusCode,
    ).toBe(204);
    const tombstone = (await onboarder.who.send('GET', `/api/people/${other.personId}`)).json<{
      person: { id: string; mergedInto: string };
    }>();
    expect(tombstone.person).toMatchObject({ id: first.personId, mergedInto: first.personId });
  });

  it('shows a duplicate beside its candidates, contact details included, and attaches it to whoever is found (PLAN R60)', async () => {
    const tag = suffix();
    const name = `Iratxe Comparada ${tag}`;
    const first = (
      await onboarder.who.send('POST', '/api/intake', {
        name,
        email: `iratxe.${tag}@ejemplo.test`,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    const elsewhere = (
      await onboarder.who.send('POST', '/api/intake', {
        name: `Encontrada ${tag}`,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(first.personId, elsewhere.personId);
    const second = (
      await onboarder.who.send('POST', '/api/intake', { name, phone: `63${tag}2` })
    ).json<{ intakeId: string; status: string }>();
    expect(second.status).toBe('review');
    const bandeja = (await onboarder.who.send('GET', '/api/bandeja')).json<{
      items: {
        id: string;
        brought: { contacts: { phones: string[] } };
        candidates: { id: string; contacts?: { emails: string[] } }[];
      }[];
    }>();
    const item = bandeja.items.find((i) => i.id === second.intakeId);
    expect(item?.brought.contacts.phones).toEqual([`+3463${tag}2`]);
    expect(item?.candidates.find((c) => c.id === first.personId)?.contacts?.emails).toEqual([
      `iratxe.${tag}@ejemplo.test`,
    ]);
    expect(
      (
        await onboarder.who.send('POST', `/api/bandeja/${second.intakeId}`, {
          decision: 'attach',
          target: elsewhere.personId,
        })
      ).statusCode,
    ).toBe(200);
    const found = (await onboarder.who.send('GET', `/api/people/${elsewhere.personId}`)).json<{
      person: { identities: { value: string }[] };
    }>();
    expect(found.person.identities.map((identity) => identity.value)).toContain(`+3463${tag}2`);
  });

  it('imports a CSV: a dry run says what would happen and keeps nothing; applying does it once', async () => {
    const tag = suffix();
    const csv = `Nombre;Teléfono;Provincia\nRosa CSV ${tag};62${tag}1;Provincia CSV\nSin teléfono ${tag};;\n;;Provincia sola\n`;
    const dry = (await onboarder.who.send('POST', '/api/imports/csv', { csv })).json<{
      mapping: Record<string, string>;
      counts: { received: number; created: number };
      invalid: { row: number; field: string }[];
    }>();
    expect(dry.mapping).toEqual({ Nombre: 'name', Teléfono: 'phone', Provincia: 'province' });
    expect(dry.counts).toMatchObject({ received: 2, created: 2 });
    expect(dry.invalid).toEqual([{ row: 4, field: 'name' }]);
    const before = (
      await onboarder.who.send('GET', `/api/people?q=${encodeURIComponent(`Rosa CSV ${tag}`)}`)
    ).json<{
      people: unknown[];
    }>();
    expect(before.people).toEqual([]);
    const applied = (
      await onboarder.who.send('POST', '/api/imports/csv', {
        csv,
        mapping: dry.mapping,
        apply: true,
      })
    ).json<{
      counts: { created: number };
    }>();
    expect(applied.counts.created).toBe(2);
    const again = (
      await onboarder.who.send('POST', '/api/imports/csv', {
        csv,
        mapping: dry.mapping,
        apply: true,
      })
    ).json<{
      counts: { created: number; unchanged: number };
    }>();
    expect(again.counts).toMatchObject({ created: 0, unchanged: 2 });
    const made = (
      await onboarder.who.send('GET', `/api/people?q=${encodeURIComponent(tag)}`)
    ).json<{
      people: { id: string }[];
    }>();
    people.push(...made.people.map((p) => p.id));
  });

  it('imports a CSV whose rows are known by a phone alone, with their stays in the group (PLAN R37, R56)', async () => {
    const tag = suffix();
    const csv = `Teléfono;Entró el;Salió el;Estado\n63${tag}1;2025-03-01;2025-05-02;Baja\n`;
    const dry = (await onboarder.who.send('POST', '/api/imports/csv', { csv })).json<{
      mapping: Record<string, string>;
      counts: { received: number; created: number };
      preview: Record<string, unknown>[];
    }>();
    expect(dry.mapping).toEqual({
      Teléfono: 'phone',
      'Entró el': 'joinedOn',
      'Salió el': 'leftOn',
      Estado: 'stage',
    });
    expect(dry.counts).toMatchObject({ received: 1, created: 1 });
    expect(dry.preview).toEqual([
      expect.objectContaining({
        name: null,
        phone: `+3463${tag}1`,
        joinedOn: '2025-03-01',
        leftOn: '2025-05-02',
        stage: 'left',
      }),
    ]);
  });

  it('syncs Airtable on demand as the ingest role, idempotently, and lists the run', async () => {
    // The link admins set in Ajustes, sealed with this run's key, and the sync on (ADR-0005).
    await superuser.query('UPDATE app.airtable_sync SET link_ciphertext = $1, enabled = true', [
      sealLink(LINK, KEY),
    ]);
    const id = `recSync${suffix()}abcd`.slice(0, 17);
    airtableRows.splice(0, airtableRows.length, {
      id,
      cellValuesByColumnId: {
        fldName: `Sara Airtable ${suffix()}`,
        fldEmail: `sara.${suffix()}@ejemplo.test`,
        fldOk: true,
      },
    });
    const first = (await onboarder.who.send('POST', '/api/imports/airtable')).json<{
      counts: Record<string, number>;
    }>();
    expect(first.counts).toMatchObject({ received: 1, created: 1 });
    const second = (await onboarder.who.send('POST', '/api/imports/airtable')).json<{
      counts: Record<string, number>;
    }>();
    expect(second.counts).toMatchObject({ received: 1, unchanged: 1 });
    const imports = (await onboarder.who.send('GET', '/api/imports')).json<{
      airtable: { configured: boolean; enabled: boolean; lastRun: unknown };
    }>();
    expect(imports.airtable).toMatchObject({ configured: true, enabled: true });
    // Turned off in Ajustes, it doesn't run on demand either.
    await superuser.query('UPDATE app.airtable_sync SET enabled = false');
    const off = await onboarder.who.send('POST', '/api/imports/airtable');
    expect([off.statusCode, off.json()]).toEqual([409, { error: 'off' }]);
    const { rows } = await superuser.query<{ person_id: string }>(
      "SELECT person_id FROM app.identities WHERE kind = 'airtable' AND value = $1",
      [id],
    );
    people.push(...rows.map((r) => r.person_id));
  });

  it('shows the Panel: by stage, arrivals by week, source and where from, time to first contact, the unassigned, and who has no arrival day', async () => {
    const add = async (name: string) => {
      const added = await onboarder.who.send('POST', '/api/intake', {
        name,
        email: `${suffix()}.panel@ejemplo.test`,
        decision: 'new',
      });
      const { personId } = added.json<{ personId: string }>();
      people.push(personId);
      return personId;
    };
    const waiting = await add(`Panel Esperando ${suffix()}`);
    const contacted = await add(`Panel Contactada ${suffix()}`);
    const undated = await add(`Panel Sin Fecha ${suffix()}`);
    // Arrived three days ago, as the staff app says it (PLAN M5); and one whose arrival nobody knows.
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    for (const id of [waiting, contacted]) {
      expect(
        (await onboarder.who.send('PATCH', `/api/people/${id}`, { arrivedOn: threeDaysAgo }))
          .statusCode,
      ).toBe(204);
    }
    expect(
      (await onboarder.who.send('PATCH', `/api/people/${undated}`, { arrivedOn: null })).statusCode,
    ).toBe(204);
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${contacted}/attempts`, {
          channel: 'whatsapp',
          outcome: 'no_answer',
        })
      ).statusCode,
    ).toBe(201);

    const response = await onboarder.who.send('GET', '/api/panel?weeks=4');
    expect(response.statusCode).toBe(200);
    const shown = response.json<{
      weeks: number;
      stages: Record<string, number>;
      arrivals: { week: string; counts: Record<string, number> }[];
      arrivalsByChannel: {
        channels: { id: string; label: string }[];
        weeks: { week: string; counts: Record<string, number> }[];
      };
      unknownArrival: number;
      firstContact: { arrived: number; contacted: number; medianHours: number | null };
      unassigned: { count: number; people: { id: string }[] };
    }>();
    expect(shown.weeks).toBe(4);
    expect(shown.stages.new).toBeGreaterThanOrEqual(1);
    expect(shown.arrivals).toHaveLength(4);
    expect(shown.arrivals.map((week) => week.week)).toEqual(
      shown.arrivals.map((week) => week.week).sort(),
    );
    expect(new Date(`${shown.arrivals[0]?.week ?? ''}T12:00:00Z`).getUTCDay()).toBe(1);
    const total = shown.arrivals.reduce((sum, week) => sum + (week.counts.manual ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(shown.arrivalsByChannel.channels.map((c) => c.label)).toContain('WhatsApp');
    expect(shown.arrivalsByChannel.weeks.map((week) => week.week)).toEqual(
      shown.arrivals.map((week) => week.week),
    );
    const notSaid = shown.arrivalsByChannel.weeks.reduce(
      (sum, week) => sum + (week.counts.none ?? 0),
      0,
    );
    expect(notSaid).toBeGreaterThanOrEqual(2);
    expect(shown.unknownArrival).toBeGreaterThanOrEqual(1);
    expect(shown.firstContact.contacted).toBeGreaterThanOrEqual(1);
    expect(shown.firstContact.medianHours).not.toBeNull();
    const unassigned = shown.unassigned.people.map((person) => person.id);
    expect(unassigned).toContain(waiting);
    expect(unassigned).not.toContain(undated);
    // Contacted, though still nobody's: the attempt moved them on from new.
    expect(unassigned).not.toContain(contacted);
    expect((await outreacher.who.send('GET', '/api/panel')).statusCode).toBe(403);
  });

  it('keeps onboarding from outreach staff, settings changes and exports to admins', async () => {
    expect((await outreacher.who.send('GET', '/api/today')).statusCode).toBe(403);
    expect((await outreacher.who.send('GET', '/api/people')).statusCode).toBe(403);
    expect((await outreacher.who.send('POST', '/api/intake', { name: 'Nadie' })).statusCode).toBe(
      403,
    );
    expect((await outreacher.who.send('GET', '/api/settings')).statusCode).toBe(200);
    expect(
      (await onboarder.who.send('PATCH', '/api/settings', { followUpDays: 7 })).statusCode,
    ).toBe(403);
    expect(
      (
        await admin.who.send('PATCH', '/api/settings', {
          communityChats: [' Madrid ', 'Madrid', 'Online'],
        })
      ).statusCode,
    ).toBe(204);
    expect((await onboarder.who.send('GET', '/api/settings')).json()).toMatchObject({
      communityChats: ['Madrid', 'Online'],
      teamPostDays: 7,
    });
    // How far back an arrival may be to be posted to the team group (PLAN M5): admins set it, within 1 to 60 days.
    expect((await admin.who.send('PATCH', '/api/settings', { teamPostDays: 61 })).statusCode).toBe(
      400,
    );
    expect((await admin.who.send('PATCH', '/api/settings', { teamPostDays: 10 })).statusCode).toBe(
      204,
    );
    expect((await onboarder.who.send('GET', '/api/settings')).json()).toMatchObject({
      teamPostDays: 10,
    });
    await admin.who.send('PATCH', '/api/settings', { teamPostDays: 7 });
    expect((await onboarder.who.send('GET', '/api/export/people.csv')).statusCode).toBe(403);
    // Another site can't make an admin's browser download it, nor log an export in their name.
    for (const site of ['cross-site', 'same-site']) {
      const sent = await admin.who.send('GET', '/api/export/people.csv', undefined, {
        'sec-fetch-site': site,
      });
      expect(sent.statusCode).toBe(403);
    }
    const exported = await admin.who.send('GET', '/api/export/people.csv?owner=none');
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.body.split('\r\n')[0]).toContain('"emails"');
    const { rows } = await superuser.query(
      'SELECT kind, row_count FROM app.exports WHERE created_by = $1',
      [admin.id],
    );
    expect(rows).toEqual([{ kind: 'people_csv', row_count: expect.any(Number) }]);
  });
});

describe('when and where from, and Discord (PLAN M5)', () => {
  const channelsFor = async (who: typeof onboarder) =>
    (await who.who.send('GET', '/api/arrival-channels')).json<{
      channels: { id: string; key: string | null; label: string; active: boolean }[];
    }>().channels;

  it('quick-adds someone from Discord, with where from and when, and finds them by their username', async () => {
    const discord = (await channelsFor(onboarder)).find((channel) => channel.key === 'discord');
    expect(discord?.label).toBe('Discord');
    const username = `persona_disc_${suffix()}`;
    const added = await onboarder.who.send('POST', '/api/intake', {
      name: `Desde Discord ${suffix()}`,
      discord: `@${username.toUpperCase()}`,
      arrival: discord?.id,
      arrivedOn: '2025-01-15',
    });
    expect(added.statusCode).toBe(201);
    const { personId } = added.json<{ personId: string }>();
    people.push(personId);
    const page = (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{
      person: {
        arrivedOn: string | null;
        arrival: { label: string } | null;
        identities: { kind: string; value: string }[];
        reasons: string[];
      };
    }>();
    expect(page.person.arrivedOn).toBe('2025-01-15');
    expect(page.person.arrival?.label).toBe('Discord');
    expect(page.person.identities).toMatchObject([{ kind: 'discord', value: username }]);
    // Arrived long ago: not someone to take from Hoy.
    expect(page.person.reasons).not.toContain('unassigned');
    const ids = async (query: string) =>
      (await onboarder.who.send('GET', `/api/people?${query}`))
        .json<{ people: { id: string }[] }>()
        .people.map((person) => person.id);
    expect(await ids(`q=${encodeURIComponent(`@${username}`)}`)).toEqual([personId]);
    expect(await ids(`arrival=${discord?.id}&limit=200`)).toContain(personId);
    expect(await ids('arrival=none&limit=200')).not.toContain(personId);
    expect(await ids('arrivedOn=unknown&limit=200')).not.toContain(personId);
    expect(
      (await onboarder.who.send('POST', '/api/intake', { name: 'Mal usuario', discord: 'a' }))
        .statusCode,
    ).toBe(400);
  });

  it('may not know when someone arrived: never unassigned, and found by that (Dani, 2026-10-16)', async () => {
    const added = await onboarder.who.send('POST', '/api/intake', {
      name: `Sin fecha ${suffix()}`,
      email: `sin.fecha.${suffix()}@ejemplo.test`,
      arrivedOn: null,
    });
    const { personId } = added.json<{ personId: string }>();
    people.push(personId);
    const page = (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{
      person: { arrivedOn: string | null; reasons: string[] };
    }>();
    expect(page.person).toMatchObject({ arrivedOn: null, reasons: ['no_next_step'] });
    const unknown = (await onboarder.who.send('GET', '/api/people?arrivedOn=unknown&limit=200'))
      .json<{ people: { id: string }[] }>()
      .people.map((person) => person.id);
    expect(unknown).toContain(personId);
    const unassigned = (await onboarder.who.send('GET', '/api/people?reason=unassigned&limit=200'))
      .json<{ people: { id: string }[] }>()
      .people.map((person) => person.id);
    expect(unassigned).not.toContain(personId);
  });

  it('counts what a filter finds, and each stage with the rest of the filter, on the first page only (PLAN R59)', async () => {
    const tag = suffix();
    const made: string[] = [];
    for (const stage of ['new', 'new', 'active']) {
      const added = await onboarder.who.send('POST', '/api/intake', {
        name: `Contada ${tag} ${made.length}`,
        email: `contada.${tag}.${made.length}@ejemplo.test`,
        stage,
        decision: 'new',
      });
      made.push(added.json<{ personId: string }>().personId);
    }
    people.push(...made);
    type Counted = {
      people: { id: string }[];
      next: string | null;
      counts?: { total: number; stages: Record<string, number> };
    };
    const search = encodeURIComponent(`contada.${tag}`);
    const all = (await onboarder.who.send('GET', `/api/people?q=${search}`)).json<Counted>();
    expect(all.counts).toEqual({ total: 3, stages: { new: 2, active: 1 } });
    const fresh = (
      await onboarder.who.send('GET', `/api/people?q=${search}&stage=new&limit=1`)
    ).json<Counted>();
    expect(fresh.counts).toEqual({ total: 2, stages: { new: 2, active: 1 } });
    expect(fresh.people).toHaveLength(1);
    const more = (
      await onboarder.who.send(
        'GET',
        `/api/people?q=${search}&stage=new&limit=1&cursor=${fresh.next ?? ''}`,
      )
    ).json<Counted>();
    expect(more.people).toHaveLength(1);
    expect(more.counts).toBeUndefined();
  });

  it('dates what happened another day: stage changes, attempts and notes; never a day to come', async () => {
    const added = await onboarder.who.send('POST', '/api/intake', {
      name: `Con historia ${suffix()}`,
      email: `historia.${suffix()}@ejemplo.test`,
    });
    const { personId } = added.json<{ personId: string }>();
    people.push(personId);
    const url = `/api/people/${personId}`;
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expect(
      (await onboarder.who.send('PATCH', url, { stage: 'welcomed', stageOn: '2025-03-03' }))
        .statusCode,
    ).toBe(204);
    expect((await onboarder.who.send('PATCH', url, { stageOn: '2025-03-03' })).statusCode).toBe(
      400,
    );
    expect(
      (
        await onboarder.who.send('POST', `${url}/attempts`, {
          channel: 'whatsapp',
          outcome: 'replied',
          happenedOn: '2025-03-01',
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await onboarder.who.send('POST', `${url}/notes`, { body: 'Hablamos', happenedOn: tomorrow }))
        .statusCode,
    ).toBe(422);
    expect((await onboarder.who.send('PATCH', url, { arrivedOn: tomorrow })).statusCode).toBe(422);
    expect(
      (await onboarder.who.send('POST', `${url}/identities`, { kind: 'discord', value: 'x' }))
        .statusCode,
    ).toBe(400);
    const { timeline } = (await onboarder.who.send('GET', url)).json<{
      timeline: { kind: string; happenedOn: string | null }[];
    }>();
    expect(
      timeline
        .filter((event) => event.happenedOn !== null)
        .map((event) => [event.kind, event.happenedOn]),
    ).toEqual([
      ['stage_changed', '2025-03-03'],
      ['contact_attempt', '2025-03-01'],
    ]);
  });

  it('lets admins edit where people come from, onboarding staff read it, and nobody else', async () => {
    expect((await outreacher.who.send('GET', '/api/arrival-channels')).statusCode).toBe(403);
    expect(
      (await onboarder.who.send('POST', '/api/arrival-channels', { label: 'Por la radio' }))
        .statusCode,
    ).toBe(403);
    const label = `Evento ${suffix()}`;
    const added = await admin.who.send('POST', '/api/arrival-channels', { label });
    expect(added.statusCode).toBe(201);
    const { id } = added.json<{ id: string }>();
    try {
      expect((await admin.who.send('POST', '/api/arrival-channels', { label })).statusCode).toBe(
        409,
      );
      expect(
        (
          await admin.who.send('PATCH', `/api/arrival-channels/${id}`, {
            label: `${label} (charla)`,
            active: false,
          })
        ).statusCode,
      ).toBe(204);
      const all = await channelsFor(onboarder);
      expect(all.find((channel) => channel.id === id)).toMatchObject({
        label: `${label} (charla)`,
        active: false,
      });
      const reversed = all.map((channel) => channel.id).reverse();
      expect(
        (await admin.who.send('PUT', '/api/arrival-channels/order', { ids: reversed })).statusCode,
      ).toBe(204);
      expect((await channelsFor(onboarder)).map((channel) => channel.id)).toEqual(reversed);
      await admin.who.send('PUT', '/api/arrival-channels/order', { ids: reversed.reverse() });
      expect(
        (await admin.who.send('PUT', '/api/arrival-channels/order', { ids: [id] })).statusCode,
      ).toBe(409);
    } finally {
      await superuser.query('DELETE FROM app.arrival_channels WHERE id = $1', [id]);
    }
  });

  it('lets onboarding staff write the team’s messages, checked by the database, and log which went out', async () => {
    expect((await outreacher.who.send('GET', '/api/message-templates')).statusCode).toBe(403);
    const title = `Bienvenida ${suffix()}`;
    const welcome = (fields: Record<string, unknown>) =>
      onboarder.who.send('POST', '/api/message-templates', {
        purpose: 'welcome',
        title,
        ...fields,
      });
    // The database says what's wrong, by the rule's name, for the staff app to point at.
    const unnamed = await welcome({ body: 'Hola, {nombre}: soy {yo}.' });
    expect(unnamed.statusCode).toBe(422);
    expect(unnamed.json()).toMatchObject({ constraint: 'message_templates_nameless_check' });
    const typo = await welcome({
      body: 'Hola, {nombre}: soy {yoo}.',
      bodyNameless: 'Hola: soy {yo}.',
    });
    expect(typo.json()).toMatchObject({ constraint: 'message_templates_placeholders_check' });
    expect(
      (await welcome({ purpose: 'census_link', body: 'Hola: soy {yo}.' })).json(),
    ).toMatchObject({ constraint: 'message_templates_link_check' });

    const added = await welcome({
      body: 'Hola, {nombre}: soy {yo}.',
      bodyNameless: ' Hola: soy {yo}. ',
    });
    expect(added.statusCode).toBe(201);
    const { id } = added.json<{ id: string }>();
    try {
      expect((await welcome({ body: 'Otra: soy {yo}.' })).statusCode).toBe(409);
      expect(
        (
          await onboarder.who.send('PATCH', `/api/message-templates/${id}`, {
            body: 'Hola, {nombre}: soy {yo}, de nuevo.',
            bodyNameless: 'Hola: soy {yo}, de nuevo.',
          })
        ).statusCode,
      ).toBe(204);
      expect(
        (await admin.who.send('PATCH', `/api/message-templates/${id}`, { active: false }))
          .statusCode,
      ).toBe(204);
      const { templates } = (await onboarder.who.send('GET', '/api/message-templates')).json<{
        templates: {
          id: string;
          bodyNameless: string;
          version: number;
          active: boolean;
          updatedBy: { displayName: string } | null;
        }[];
      }>();
      expect(templates.find((template) => template.id === id)).toMatchObject({
        bodyNameless: 'Hola: soy {yo}, de nuevo.',
        version: 2,
        active: false,
        updatedBy: { displayName: expect.any(String) },
      });
      expect(
        (
          await onboarder.who.send('PATCH', `/api/message-templates/${crypto.randomUUID()}`, {
            active: true,
          })
        ).statusCode,
      ).toBe(404);

      // "Sí, lo he enviado": the attempt names the message and its version, one it has had.
      const person = (
        await onboarder.who.send('POST', '/api/intake', {
          name: `Mensaje Prueba ${suffix()}`,
          phone: `6100${suffix()}`.slice(0, 9),
        })
      ).json<{ personId: string }>().personId;
      people.push(person);
      const attempt = (version: number) =>
        onboarder.who.send('POST', `/api/people/${person}/attempts`, {
          channel: 'whatsapp',
          outcome: 'left_message',
          templateId: id,
          templateVersion: version,
        });
      expect((await attempt(1)).statusCode).toBe(201);
      expect((await attempt(3)).statusCode).toBe(422);
      const logged = await superuser.query<{ data: unknown }>(
        `SELECT data FROM app.person_events WHERE person_id = $1 AND kind = 'contact_attempt'`,
        [person],
      );
      expect(logged.rows.map((row) => row.data)).toEqual([
        { channel: 'whatsapp', outcome: 'left_message', templateId: id, templateVersion: 1 },
      ]);
    } finally {
      await superuser.query('DELETE FROM app.message_templates WHERE id = $1', [id]);
    }
  });
});

describe('cards that say who someone is (PLAN M5, step 4)', () => {
  type Card = { id: string; summary: string | null; missing: string[]; province: string | null };

  it('says what is missing in plain words, and keeps a one-line internal summary', async () => {
    const name = `Maite Prueba ${suffix()}`;
    const { personId } = (
      await onboarder.who.send('POST', '/api/intake', {
        name,
        phone: `6002${suffix()}`.slice(0, 9),
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(personId);
    const card = async () =>
      (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{ person: Card }>().person;
    expect(await card()).toMatchObject({
      summary: null,
      missing: ['email', 'province', 'interests'],
    });

    expect(
      (
        await onboarder.who.send('PATCH', `/api/people/${personId}`, {
          province: 'Madrid',
          summary: '  Diseñadora, quiere ayudar con redes  ',
        })
      ).statusCode,
    ).toBe(204);
    await superuser.query("UPDATE app.people SET interests_other = 'Redes' WHERE id = $1", [
      personId,
    ]);
    expect(await card()).toMatchObject({
      province: 'Madrid',
      summary: 'Diseñadora, quiere ayudar con redes',
      missing: ['email'],
    });
    // Lists carry the same card.
    const listed = (
      await onboarder.who.send('GET', `/api/people?q=${encodeURIComponent(name)}`)
    ).json<{ people: Card[] }>().people;
    expect(listed.find((person) => person.id === personId)).toMatchObject({
      summary: 'Diseñadora, quiere ayudar con redes',
      missing: ['email'],
    });
    // So does the admins' CSV export (PLAN R44).
    const exported = (
      await admin.who.send('GET', `/api/export/people.csv?q=${encodeURIComponent(name)}`)
    ).body.split('\r\n');
    expect(exported[0]).toContain('"nombre","resumen"');
    expect(exported.find((line) => line.startsWith(`"${personId}"`))).toContain(
      '"Diseñadora, quiere ayudar con redes"',
    );

    for (const summary of ['Una línea\nY otra', 'x'.repeat(201)]) {
      expect(
        (await onboarder.who.send('PATCH', `/api/people/${personId}`, { summary })).statusCode,
      ).toBe(400);
    }
    expect(
      (await outreacher.who.send('PATCH', `/api/people/${personId}`, { summary: 'Otra' }))
        .statusCode,
    ).toBe(403);
    expect(
      (await onboarder.who.send('PATCH', `/api/people/${personId}`, { summary: '' })).statusCode,
    ).toBe(204);
    expect((await card()).summary).toBeNull();
    // Someone discarded is asked nothing.
    await onboarder.who.send('PATCH', `/api/people/${personId}`, { stage: 'discarded' });
    expect((await card()).missing).toEqual([]);
  });
});

describe('team accounts linked to their person (PLAN M5, step 5)', () => {
  type Team = { userId: string; displayName: string; active: boolean } | null;
  const addPerson = async (fields: Record<string, string>) => {
    const { personId } = (
      await admin.who.send('POST', '/api/intake', { ...fields, decision: 'new' })
    ).json<{ personId: string }>();
    people.push(personId);
    return personId;
  };
  const teamOf = async (personId: string) =>
    (await onboarder.who.send('GET', `/api/people/${personId}`)).json<{ person: { team: Team } }>()
      .person.team;
  const listed = async (team: 'yes' | 'no') =>
    (await onboarder.who.send('GET', `/api/people?team=${team}&limit=200`))
      .json<{ people: { id: string }[] }>()
      .people.map((person) => person.id);

  it('lets an admin link an account to its person, suggested by a shared email, and Personas filter by it', async () => {
    const personId = await addPerson({
      name: `Persona Del Equipo ${suffix()}`,
      email: onboarder.email,
    });
    expect((await onboarder.who.send('GET', '/api/staff/person-suggestions')).statusCode).toBe(403);
    const { suggestions } = (await admin.who.send('GET', '/api/staff/person-suggestions')).json<{
      suggestions: { userId: string; person: { id: string } }[];
    }>();
    expect(suggestions).toContainEqual({
      userId: onboarder.id,
      person: { id: personId, name: expect.any(String) },
    });

    const link = (who: typeof admin, userId: string, id: string | null) =>
      who.who.send('PUT', `/api/staff/${userId}/person`, { personId: id });
    expect((await link(onboarder, onboarder.id, personId)).statusCode).toBe(403);
    expect((await link(admin, onboarder.id, personId)).statusCode).toBe(204);
    const taken = await link(admin, outreacher.id, personId);
    expect([taken.statusCode, taken.json<{ error: string }>().error]).toEqual([409, 'personTaken']);

    const team = (await onboarder.who.send('GET', '/api/staff')).json<{
      staff: { userId: string; personId: string | null }[];
    }>();
    expect(team.staff.find((member) => member.userId === onboarder.id)?.personId).toBe(personId);
    expect(await teamOf(personId)).toMatchObject({ userId: onboarder.id, active: true });
    expect(await listed('yes')).toContain(personId);
    expect(await listed('no')).not.toContain(personId);

    // Two records each linked to an account aren't merged: an admin unlinks one first.
    const other = await addPerson({ name: `Otra Del Equipo ${suffix()}` });
    expect((await link(admin, outreacher.id, other)).statusCode).toBe(204);
    const merged = await admin.who.send('POST', `/api/people/${personId}/merge`, {
      mergedId: other,
    });
    expect([merged.statusCode, merged.json<{ error: string }>().error]).toEqual([
      409,
      'bothInTeam',
    ]);
    // A deactivated account keeps its person, who is no longer on the team.
    await superuser.query('UPDATE app.staff SET active = false WHERE user_id = $1', [
      outreacher.id,
    ]);
    try {
      expect(await teamOf(other)).toMatchObject({ userId: outreacher.id, active: false });
      expect(await listed('yes')).not.toContain(other);
    } finally {
      await superuser.query('UPDATE app.staff SET active = true WHERE user_id = $1', [
        outreacher.id,
      ]);
    }
    expect((await link(admin, outreacher.id, null)).statusCode).toBe(204);
    expect(await teamOf(other)).toBeNull();
  });

  it('never links someone merged away, and an account that is not staff is not found', async () => {
    const survivor = await addPerson({ name: `Persona Que Queda ${suffix()}` });
    const gone = await addPerson({ name: `Persona Fusionada ${suffix()}` });
    expect(
      (await admin.who.send('POST', `/api/people/${survivor}/merge`, { mergedId: gone }))
        .statusCode,
    ).toBe(204);
    const refused = await admin.who.send('PUT', `/api/staff/${outreacher.id}/person`, {
      personId: gone,
    });
    expect([refused.statusCode, refused.json<{ error: string }>().error]).toEqual([
      409,
      'personGone',
    ]);
    expect(
      (
        await admin.who.send('PUT', `/api/staff/${crypto.randomUUID()}/person`, {
          personId: survivor,
        })
      ).statusCode,
    ).toBe(404);
  });
});

describe('the Airtable link in Ajustes (ADR-0005)', () => {
  const OTHER = 'https://airtable.com/appEjemplo000002/shrEjemplo0000002';
  type Settings = {
    available: boolean;
    link: { setAt: string; setBy: { displayName: string } | null } | null;
    enabled: boolean;
    lastRun: { at: string; failure: string | null; counts: Record<string, unknown> | null } | null;
  };
  const sealed = async () =>
    (
      await superuser.query<{ link: string | null; by: string | null }>(
        'SELECT link_ciphertext AS link, link_set_by AS by FROM app.airtable_sync',
      )
    ).rows[0];

  it('lets admins alone set the link, write-only, turn the sync on and off, see its last run, and remove it', async () => {
    await superuser.query('UPDATE app.airtable_sync SET link_ciphertext = NULL');
    for (const who of [onboarder, outreacher]) {
      for (const [method, path, body] of [
        ['GET', '/api/airtable', undefined],
        ['PUT', '/api/airtable/link', { link: LINK }],
        ['PATCH', '/api/airtable', { enabled: true }],
        ['DELETE', '/api/airtable/link', undefined],
      ] as const) {
        expect(
          { method, path, status: (await who.who.send(method, path, body)).statusCode },
          path,
        ).toEqual({ method, path, status: 403 });
      }
    }
    expect((await sealed())?.link).toBeNull();
    const settings = async () => {
      const answer = await admin.who.send('GET', '/api/airtable');
      return { body: answer.json<Settings>(), text: answer.body };
    };
    expect((await settings()).body).toEqual({
      available: true,
      link: null,
      enabled: false,
      lastRun: null,
    });
    // Nothing to turn on without a link.
    const early = await admin.who.send('PATCH', '/api/airtable', { enabled: true });
    expect([early.statusCode, early.json()]).toEqual([409, { error: 'no_link' }]);

    // Only an Airtable shared view's link, over https.
    for (const link of [
      'http://airtable.com/appEjemplo000001/shrEjemplo0000001',
      'https://ejemplo.test/appEjemplo000001/shrEjemplo0000001',
      'https://airtable.com.ejemplo.test/appEjemplo000001/shrEjemplo0000001',
      'https://airtable.com/appEjemplo000001/viwEjemplo0000001',
      `https://airtable.com/appEjemplo000001/shrEjemplo0000001/${'x'.repeat(450)}`,
    ]) {
      expect(
        (await admin.who.send('PUT', '/api/airtable/link', { link })).statusCode,
        link.slice(0, 40),
      ).toBe(400);
    }
    expect((await sealed())?.link).toBeNull();

    expect(
      (await admin.who.send('PUT', '/api/airtable/link', { link: ` ${LINK} ` })).statusCode,
    ).toBe(204);
    const stored = await sealed();
    expect(stored?.by).toBe(admin.id);
    expect(openLink(stored?.link ?? '', KEY)).toBe(LINK);
    const after = await settings();
    expect(after.body).toEqual({
      available: true,
      link: { setAt: expect.any(String), setBy: { displayName: expect.any(String) } },
      enabled: false,
      lastRun: null,
    });
    // Write-only: no answer carries the link, nor what the database holds.
    for (const secret of [
      'airtable.com',
      'shrEjemplo',
      stored?.link ?? '',
      (stored?.link ?? '').slice(3, 30),
    ]) {
      expect(after.text).not.toContain(secret);
    }

    expect((await admin.who.send('PATCH', '/api/airtable', { enabled: true })).statusCode).toBe(
      204,
    );
    airtableRows.splice(0, airtableRows.length);
    expect((await admin.who.send('POST', '/api/imports/airtable')).statusCode).toBe(200);
    expect((await settings()).body).toMatchObject({
      enabled: true,
      lastRun: { at: expect.any(String), failure: null, counts: { received: 0 } },
    });
    // A view that can't be read: the last run says why, by its kind.
    expect((await admin.who.send('PUT', '/api/airtable/link', { link: OTHER })).statusCode).toBe(
      204,
    );
    expect((await settings()).body).toMatchObject({ enabled: true, lastRun: null });
    const failed = await admin.who.send('POST', '/api/imports/airtable');
    expect([failed.statusCode, failed.json()]).toEqual([
      502,
      { error: 'airtable', reason: 'page' },
    ]);
    expect((await settings()).body).toMatchObject({ lastRun: { failure: 'page', counts: null } });
    // A link sealed with another deployment's key doesn't open: nothing is read, and the last run says so.
    await superuser.query('UPDATE app.airtable_sync SET link_ciphertext = $1, enabled = true', [
      sealLink(LINK, randomBytes(32)),
    ]);
    const unopened = await admin.who.send('POST', '/api/imports/airtable');
    expect([unopened.statusCode, unopened.json()]).toEqual([
      502,
      { error: 'airtable', reason: 'key' },
    ]);
    expect((await settings()).body).toMatchObject({ lastRun: { failure: 'key', counts: null } });

    expect((await admin.who.send('PATCH', '/api/airtable', { enabled: false })).statusCode).toBe(
      204,
    );
    expect((await settings()).body.enabled).toBe(false);
    expect((await admin.who.send('PATCH', '/api/airtable', { enabled: true })).statusCode).toBe(
      204,
    );
    expect((await admin.who.send('DELETE', '/api/airtable/link')).statusCode).toBe(204);
    expect((await settings()).body).toMatchObject({ link: null, enabled: false });
    expect((await sealed())?.link).toBeNull();

    // The audit log says the link changed, and who changed it, never what it was.
    const { rows } = await superuser.query<{ actor_id: string; diff: unknown }>(
      `SELECT actor_id, diff FROM app.audit_log WHERE table_name = 'airtable_sync' AND actor_id = $1`,
      [admin.id],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => JSON.stringify(row.diff).includes('link_ciphertext'))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(stored?.link?.slice(3, 30) ?? 'nothing');
  });

  it('refuses a link where the deployment has no key, and says so', async () => {
    const keyless = buildApp({
      api: {
        auth: {
          auth: createAuth({
            pool: authPool,
            secret: SECRET,
            staffOrigin: STAFF_ORIGIN,
            totpIssuer: TOTP_ISSUER,
          }),
          staffOrigin: STAFF_ORIGIN,
        },
        app: appDb,
      },
    });
    await keyless.ready();
    try {
      const other = await staffMemberOn(keyless, 'admin');
      expect((await other.who.send('GET', '/api/airtable')).json<Settings>().available).toBe(false);
      const refused = await other.who.send('PUT', '/api/airtable/link', { link: LINK });
      expect([refused.statusCode, refused.json()]).toEqual([503, { error: 'unavailable' }]);
      expect((await sealed())?.link).toBeNull();
    } finally {
      await keyless.close();
    }
  });
});
