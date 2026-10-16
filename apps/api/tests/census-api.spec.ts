import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, buildFormsApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { FORMS_TOKEN_HEADER } from '../src/census/public-routes.js';
import {
  browser,
  createAccount,
  deleteAccount,
  limiterAddress,
  PASSWORD,
  SECRET,
  STAFF_HOST,
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
const publicDb = createDatabase({
  connectionString: env('TEST_PUBLIC_DATABASE_URL'),
  maxConnections: 2,
});

/** The forms app's secret and clock, for these tests only. */
const FORMS_TOKEN = 'a-test-forms-token-of-more-than-thirty-two-characters';
let clock = Date.now();

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
    census: { formsOrigin: 'https://unete.ejemplo.test', wordingVersion: 'v1' },
  },
});
/** The forms app's routes, on their own server (FORMS_PORT). */
const formsApp = buildFormsApp({
  forms: {
    db: publicDb,
    token: FORMS_TOKEN,
    wordingVersion: 'v1',
    submitsPerVisitor: 3,
    now: () => clock,
  },
});

const accounts: string[] = [];
const addresses: string[] = [];
const people: string[] = [];

const staffMember = async (...roles: string[]) => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const address = testAddress();
  addresses.push(address);
  const who = browser(app, address);
  await who.send('POST', '/api/auth/sign-in/email', { email: created.email, password: PASSWORD });
  const { totpURI } = (
    await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD })
  ).json<{
    totpURI: string;
  }>();
  await who.send('POST', '/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) });
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

/** The forms app, inside the cluster: its secret, and a visitor's address as the gateway gave it. */
const forms = (path: string, body: object, visitor = '203.0.113.10', token = FORMS_TOKEN) =>
  formsApp.inject({
    method: 'POST',
    url: `/public/census${path}`,
    headers: {
      [FORMS_TOKEN_HEADER]: token,
      'x-forwarded-for': visitor,
      'content-type': 'application/json',
    },
    payload: JSON.stringify(body),
  });

const uniqueName = () => `Censo ${crypto.randomUUID().slice(0, 8)}`;

const answer = (fields: Record<string, unknown> = {}) => ({
  name: uniqueName(),
  email: `censo.${crypto.randomUUID().slice(0, 8)}@ejemplo.test`,
  availability: 'over_5h',
  consentEmail: true,
  consentWhatsapp: true,
  consentPrivacy: true,
  ageOk: true,
  ...fields,
});

let onboarder: Awaited<ReturnType<typeof staffMember>>;
let admin: Awaited<ReturnType<typeof staffMember>>;

beforeAll(async () => {
  await app.ready();
  onboarder = await staffMember('onboarding');
  admin = await staffMember('admin');
});

afterAll(async () => {
  await superuser.query("SET session_replication_role = 'replica'");
  const made = (
    await superuser.query<{ id: string }>(
      `SELECT p.id FROM app.people p WHERE p.id = ANY($1::uuid[]) OR p.full_name LIKE 'Censo %'
          OR p.full_name = 'Persona anonimizada'`,
      [people],
    )
  ).rows.map((row) => row.id);
  for (const table of [
    'app.person_events',
    'app.identities',
    'app.community_presence',
    'app.person_sources',
    'app.person_options',
    'app.consents',
    'app.census_links',
    'app.intake_records',
  ]) {
    await superuser.query(`DELETE FROM ${table} WHERE person_id = ANY($1::uuid[])`, [made]);
  }
  await superuser.query(`DELETE FROM app.intake_records WHERE source = 'census'`);
  await superuser.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [made]);
  await superuser.query('DELETE FROM app.exports WHERE created_by = ANY($1::uuid[])', [accounts]);
  await superuser.query("DELETE FROM app.census_options WHERE label LIKE 'Opción de prueba%'");
  await superuser.query("DELETE FROM app.message_templates WHERE title LIKE 'Censo de prueba%'");
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
  await Promise.all([app.close(), formsApp.close()]);
  await Promise.all([appDb.destroy(), publicDb.destroy()]);
  await superuser.end();
  await authPool.end();
});

describe('the forms app’s routes (M2)', () => {
  it('are served on their own port, which serves nothing else (ADR-0002 §7)', async () => {
    const onStaffPort = await app.inject({
      method: 'POST',
      url: '/public/census/form',
      headers: { [FORMS_TOKEN_HEADER]: FORMS_TOKEN, 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(onStaffPort.statusCode).toBe(404);
    const signIn = await formsApp.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { host: STAFF_HOST, origin: STAFF_ORIGIN, 'content-type': 'application/json' },
      payload: JSON.stringify({ email: 'persona@ejemplo.test', password: 'una-contraseña' }),
    });
    expect(signIn.statusCode).toBe(404);
  });

  it('answer only with the shared secret, as if they weren’t there otherwise', async () => {
    expect(
      (await forms('/form', {}, '203.0.113.11', 'otro-secreto-cualquiera-de-mas-de-32-caracteres'))
        .statusCode,
    ).toBe(404);
    const form = await forms('/form', {});
    expect(form.statusCode).toBe(200);
    expect(form.json()).toMatchObject({ link: 'generic', greeting: null, wordingVersion: 'v1' });
    expect(form.json<{ options: unknown[] }>().options.length).toBeGreaterThan(0);
  });

  it('take a generic answer, which makes someone new; drop a honeypot’s; refuse one too fast or invalid', async () => {
    clock = Date.now();
    const started = clock - 10_000;
    const ok = await forms(
      '/submit',
      { startedAt: started, website: '', answer: answer() },
      '203.0.113.12',
    );
    expect(ok.json()).toEqual({ outcome: 'received' });
    const bot = await forms(
      '/submit',
      { startedAt: started, website: 'spam', answer: answer({ name: 'Bot' }) },
      '203.0.113.13',
    );
    expect(bot.json()).toEqual({ outcome: 'received' });
    const { rows } = await superuser.query("SELECT 1 FROM app.people WHERE full_name = 'Bot'");
    expect(rows).toEqual([]);
    expect(
      (await forms('/submit', { startedAt: clock - 500, answer: answer() }, '203.0.113.14')).json(),
    ).toEqual({ error: 'invalid', field: 'startedAt' });
    expect(
      (
        await forms(
          '/submit',
          { startedAt: started, answer: answer({ email: 'no-es-correo' }) },
          '203.0.113.14',
        )
      ).json(),
    ).toEqual({ error: 'invalid', field: 'email' });
    expect(
      (
        await forms(
          '/submit',
          { startedAt: started, answer: answer({ ageOk: false }) },
          '203.0.113.14',
        )
      ).json(),
    ).toEqual({ error: 'invalid', field: 'ageOk' });
  });

  it('limit answers per visitor', async () => {
    clock = Date.now();
    const visitor = '203.0.113.20';
    const statuses: number[] = [];
    for (let n = 0; n < 4; n += 1) {
      statuses.push(
        (await forms('/submit', { startedAt: clock - 10_000, answer: answer() }, visitor))
          .statusCode,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('the census’s staff side (M2)', () => {
  it('writes a personal link in the team’s message, which the link and its attempt name (Mensajes, PLAN M5)', async () => {
    const added = (
      await onboarder.who.send('POST', '/api/intake', {
        name: `Censo Mensaje ${crypto.randomUUID().slice(0, 6)}`,
        phone: `61${Math.floor(Math.random() * 1e7)
          .toString()
          .padStart(7, '0')}`,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(added.personId);
    const written = await onboarder.who.send('POST', '/api/message-templates', {
      purpose: 'census_link',
      title: `Censo de prueba ${crypto.randomUUID().slice(0, 6)}`,
      body: 'Hola, {nombre}: soy {yo}. Tu enlace: {enlace}',
      bodyNameless: 'Hola: soy {yo}. Tu enlace: {enlace}',
    });
    expect(written.statusCode).toBe(201);
    const templateId = written.json<{ id: string }>().id;

    const made = await onboarder.who.send('POST', `/api/people/${added.personId}/census-link`, {
      templateId,
    });
    expect(made.statusCode).toBe(201);
    const link = made.json<{ id: string; url: string; whatsapp: string }>();
    const text = decodeURIComponent(link.whatsapp.split('?text=')[1] ?? '');
    expect(text).toMatch(/^Hola, Censo: soy \S/u);
    expect(text).toContain(`. Tu enlace: ${link.url}`);
    expect(
      (
        await superuser.query(
          'SELECT template_id, template_version FROM app.census_links WHERE id = $1',
          [link.id],
        )
      ).rows,
    ).toEqual([{ template_id: templateId, template_version: 1 }]);
    expect((await onboarder.who.send('POST', `/api/census-links/${link.id}/sent`)).statusCode).toBe(
      204,
    );
    expect(
      (
        await superuser.query(
          `SELECT data FROM app.person_events WHERE person_id = $1 AND kind = 'contact_attempt'`,
          [added.personId],
        )
      ).rows.map((row: { data: unknown }) => row.data),
    ).toEqual([{ channel: 'whatsapp', outcome: 'left_message', templateId, templateVersion: 1 }]);

    // A message retired meanwhile isn't offered any more: the page is out of date.
    await onboarder.who.send('PATCH', `/api/message-templates/${templateId}`, { active: false });
    expect(
      (
        await onboarder.who.send('POST', `/api/people/${added.personId}/census-link`, {
          templateId,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('makes a personal link, greets its person, takes their answer directly, and shows it on their page', async () => {
    const phone = `61${Math.floor(Math.random() * 1e7)
      .toString()
      .padStart(7, '0')}`;
    const added = (
      await onboarder.who.send('POST', '/api/intake', {
        name: `Censo Pilar ${crypto.randomUUID().slice(0, 6)}`,
        phone,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(added.personId);
    const census = (await onboarder.who.send('GET', '/api/census')).json<{
      queue: { person: { id: string } }[];
    }>();
    expect(census.queue.map((entry) => entry.person.id)).toContain(added.personId);

    const made = await onboarder.who.send('POST', `/api/people/${added.personId}/census-link`);
    expect(made.statusCode).toBe(201);
    const link = made.json<{ id: string; url: string; whatsapp: string }>();
    expect(link.url).toMatch(/^https:\/\/unete\.ejemplo\.test\/c#token=[\w-]{43}$/u);
    expect(link.whatsapp).toMatch(/^https:\/\/wa\.me\/34\d{9}\?text=/u);
    expect(decodeURIComponent(link.whatsapp)).toContain(link.url);
    expect((await onboarder.who.send('POST', `/api/census-links/${link.id}/sent`)).statusCode).toBe(
      204,
    );
    expect((await onboarder.who.send('POST', `/api/census-links/${link.id}/sent`)).statusCode).toBe(
      404,
    );

    const token = decodeURIComponent(link.url.split('#token=')[1] ?? '');
    clock = Date.now();
    const form = (await forms('/form', { token }, '203.0.113.30')).json<{
      greeting: string;
      link: string;
      options: { id: string; label: string }[];
    }>();
    expect(form).toMatchObject({ greeting: 'Censo', link: 'personal' });
    const design = form.options.find((option) => option.label === 'Diseño')?.id;
    const submitted = await forms(
      '/submit',
      {
        token,
        startedAt: clock - 30_000,
        answer: answer({
          name: 'Censo Pilar Actualizada',
          preferredName: 'Pili',
          options: [design],
        }),
      },
      '203.0.113.30',
    );
    expect(submitted.json()).toEqual({ outcome: 'updated' });

    const page = (await onboarder.who.send('GET', `/api/people/${added.personId}`)).json<{
      person: {
        name: string;
        options: { label: string }[];
        consents: { privacy: { granted: boolean } };
        profileCompletedAt: string;
      };
      timeline: { kind: string }[];
    }>();
    expect(page.person.name).toBe('Pili');
    expect(page.person.options.map((o) => o.label)).toEqual(['Diseño']);
    expect(page.person.consents.privacy).toMatchObject({ granted: true });
    expect(page.person.profileCompletedAt).not.toBeNull();
    expect(page.timeline.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['form_submitted', 'contact_attempt']),
    );
    expect(
      (
        await forms(
          '/submit',
          { token: 'x'.repeat(43), startedAt: clock - 30_000, answer: answer() },
          '203.0.113.31',
        )
      ).json(),
    ).toEqual({
      error: 'invalidLink',
    });
  });

  it('shows a generic answer that matched someone in the Bandeja, without its contact details', async () => {
    const email = `censo.${crypto.randomUUID().slice(0, 8)}@ejemplo.test`;
    const phone = `61${Math.floor(Math.random() * 1e7)
      .toString()
      .padStart(7, '0')}`;
    const added = (
      await onboarder.who.send('POST', '/api/intake', {
        name: uniqueName(),
        email,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(added.personId);
    clock = Date.now();
    const submitted = await forms(
      '/submit',
      {
        startedAt: clock - 30_000,
        answer: answer({ email, phone: `+34 ${phone}`, preferredName: 'Otro nombre' }),
      },
      '203.0.113.40',
    );
    // The same answer as for someone new: the generic link never tells whether a phone or email is known.
    expect(submitted.json()).toEqual({ outcome: 'received' });
    const bandeja = await onboarder.who.send('GET', '/api/bandeja');
    const item = bandeja
      .json<{
        items: { person: { id: string } | null; conflicts: { census?: Record<string, unknown> } }[];
      }>()
      .items.find((entry) => entry.person?.id === added.personId && entry.conflicts.census);
    expect(item?.conflicts.census).toMatchObject({
      preferredName: 'Otro nombre',
      availability: 'over_5h',
      consentPrivacy: true,
    });
    expect(Object.keys(item?.conflicts.census ?? {})).not.toEqual(
      expect.arrayContaining(['email']),
    );
    expect(bandeja.body).not.toContain(email);
    expect(bandeja.body).not.toContain(phone);
  });

  it('lets admins edit the lists, export a person and erase them; others may not', async () => {
    const created = await admin.who.send('POST', '/api/census/options', {
      kind: 'skill',
      label: 'Opción de prueba',
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json<{ id: string }>();
    expect(
      (await admin.who.send('PATCH', `/api/census/options/${id}`, { active: false })).statusCode,
    ).toBe(204);
    // A new order, all at once, and only for the whole list as it stands.
    const skills = (await admin.who.send('GET', '/api/census/options'))
      .json<{ options: { id: string; kind: string; position: number }[] }>()
      .options.filter((option) => option.kind === 'skill');
    const reversed = skills.map((option) => option.id).reverse();
    expect(
      (await admin.who.send('PUT', '/api/census/options/order', { kind: 'skill', ids: reversed }))
        .statusCode,
    ).toBe(204);
    const reordered = (await admin.who.send('GET', '/api/census/options'))
      .json<{ options: { id: string; kind: string; position: number }[] }>()
      .options.filter((option) => option.kind === 'skill')
      .sort((a, b) => a.position - b.position)
      .map((option) => option.id);
    expect(reordered).toEqual(reversed);
    expect(
      (
        await admin.who.send('PUT', '/api/census/options/order', {
          kind: 'skill',
          ids: reversed.slice(1),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await onboarder.who.send('PUT', '/api/census/options/order', {
          kind: 'skill',
          ids: reversed,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await onboarder.who.send('POST', '/api/census/options', { kind: 'skill', label: 'Otra' }))
        .statusCode,
    ).toBe(403);

    const added = (
      await onboarder.who.send('POST', '/api/intake', {
        name: `Censo Borrable ${crypto.randomUUID().slice(0, 6)}`,
        email: `borrable.${crypto.randomUUID().slice(0, 6)}@ejemplo.test`,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(added.personId);
    expect(
      (await onboarder.who.send('GET', `/api/people/${added.personId}/export`)).statusCode,
    ).toBe(403);
    // Not for a navigation another site started.
    const pushed = await admin.who.send('GET', `/api/people/${added.personId}/export`, undefined, {
      'sec-fetch-site': 'cross-site',
    });
    expect(pushed.statusCode).toBe(403);
    const exported = await admin.who.send(
      'GET',
      `/api/people/${added.personId}/export`,
      undefined,
      {
        'sec-fetch-site': 'same-origin',
      },
    );
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('attachment');
    expect(exported.json<{ identities: { value: string }[] }>().identities[0]?.value).toMatch(
      /@ejemplo\.test$/u,
    );
    expect(
      (await onboarder.who.send('POST', `/api/people/${added.personId}/erase`)).statusCode,
    ).toBe(403);
    expect((await admin.who.send('POST', `/api/people/${added.personId}/erase`)).statusCode).toBe(
      204,
    );
    expect((await admin.who.send('POST', `/api/people/${added.personId}/erase`)).statusCode).toBe(
      409,
    );
    const erased = (await admin.who.send('GET', `/api/people/${added.personId}`)).json<{
      person: { fullName: string; identities: unknown[]; anonymisedAt: string | null };
    }>();
    expect(erased.person).toMatchObject({ fullName: 'Persona anonimizada', identities: [] });
    expect(erased.person.anonymisedAt).not.toBeNull();
  });

  it('exports every column of a person marked personal data, the internal summary too (PLAN M5)', async () => {
    const added = (
      await onboarder.who.send('POST', '/api/intake', {
        name: `Censo Exportable ${crypto.randomUUID().slice(0, 6)}`,
        decision: 'new',
      })
    ).json<{ personId: string }>();
    people.push(added.personId);
    expect(
      (
        await onboarder.who.send('PATCH', `/api/people/${added.personId}`, {
          summary: 'Resumen para exportar',
        })
      ).statusCode,
    ).toBe(204);
    const exported = (
      await admin.who.send('GET', `/api/people/${added.personId}/export`, undefined, {
        'sec-fetch-site': 'same-origin',
      })
    ).json<{ person: Record<string, unknown> }>();
    expect(exported.person.summary).toBe('Resumen para exportar');
    // Generated columns (name_folded, the name folded for search) say nothing the name doesn't.
    const { rows } = await superuser.query<{ column: string }>(
      `SELECT a.attname AS column FROM pg_attribute a
        WHERE a.attrelid = 'app.people'::regclass AND a.attnum > 0 AND NOT a.attisdropped
          AND col_description(a.attrelid, a.attnum) = 'personal data' AND a.attgenerated = ''`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.map((row) => row.column).filter((column) => !(column in exported.person))).toEqual(
      [],
    );
  });
});
