import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
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
      runAirtableSync({ ingest, link: LINK, requirePermission: true, fetch: fakeAirtable }),
    onArrival: async (personId) => {
      arrivals.push(personId);
    },
  },
});

const accounts: string[] = [];
const addresses: string[] = [];
const people: string[] = [];

/** An enrolled account made staff with `roles` by the owner's SQL, signed in. */
const staffMember = async (...roles: string[]) => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const address = testAddress();
  addresses.push(address);
  const who = browser(app, address);
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
    expect(page.person.stage).toBe('talking');
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

  it('imports a CSV: a dry run says what would happen and keeps nothing; applying does it once', async () => {
    const tag = suffix();
    const csv = `Nombre;Teléfono;Provincia\nRosa CSV ${tag};62${tag}1;Provincia CSV\nSin teléfono ${tag};;\n;600000000;\n`;
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

  it('syncs Airtable on demand as the ingest role, idempotently, and lists the run', async () => {
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
      airtable: { configured: boolean; lastRun: unknown };
    }>();
    expect(imports.airtable.configured).toBe(true);
    const { rows } = await superuser.query<{ person_id: string }>(
      "SELECT person_id FROM app.identities WHERE kind = 'airtable' AND value = $1",
      [id],
    );
    people.push(...rows.map((r) => r.person_id));
  });

  it('shows the Panel: by stage, arrivals by week and source, time to first contact, the unassigned', async () => {
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
    // Arrived three days ago: as superuser, past the stamp that dates rows now.
    await superuser.query("SET session_replication_role = 'replica'");
    await superuser.query(
      "UPDATE app.people SET created_at = now() - interval '3 days' WHERE id = ANY($1::uuid[])",
      [[waiting, contacted]],
    );
    await superuser.query("SET session_replication_role = 'origin'");
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
    expect(shown.firstContact.contacted).toBeGreaterThanOrEqual(1);
    expect(shown.firstContact.medianHours).not.toBeNull();
    const unassigned = shown.unassigned.people.map((person) => person.id);
    expect(unassigned).toContain(waiting);
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
    });
    expect((await onboarder.who.send('GET', '/api/export/people.csv')).statusCode).toBe(403);
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
