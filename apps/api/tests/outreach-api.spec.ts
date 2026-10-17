import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
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
  },
});

const accounts: string[] = [];
const addresses: string[] = [];

const staffMember = async (...roles: string[]) => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const address = testAddress();
  addresses.push(address);
  const who = browser(app, address);
  await who.send('POST', '/api/auth/sign-in/email', { email: created.email, password: PASSWORD });
  const { totpURI } = (
    await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD })
  ).json<{ totpURI: string }>();
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

/** Every name these tests make starts so, for the clean-up; all fictional. */
const unique = () => crypto.randomUUID().slice(0, 8);
const slugOf = () => `prueba-${unique()}`;

let outreacher: Awaited<ReturnType<typeof staffMember>>;
let colleague: Awaited<ReturnType<typeof staffMember>>;
let onboarder: Awaited<ReturnType<typeof staffMember>>;
let admin: Awaited<ReturnType<typeof staffMember>>;

beforeAll(async () => {
  await app.ready();
  outreacher = await staffMember('outreach');
  colleague = await staffMember('outreach');
  onboarder = await staffMember('onboarding');
  admin = await staffMember('admin');
});

afterAll(async () => {
  await superuser.query("SET session_replication_role = 'replica'");
  const campaigns = `(SELECT id FROM app.campaigns WHERE slug LIKE 'prueba-%')`;
  const contacts = `(SELECT id FROM app.contacts WHERE org_display LIKE 'Prueba %'
                        OR external_ref LIKE 'outreach:prueba-%')`;
  await superuser.query(`DELETE FROM app.contact_events WHERE contact_id IN ${contacts}`);
  await superuser.query(`DELETE FROM app.campaign_targets WHERE campaign_id IN ${campaigns}
                            OR contact_id IN ${contacts}`);
  await superuser.query(`DELETE FROM app.campaign_anchors WHERE campaign_id IN ${campaigns}`);
  await superuser.query(`DELETE FROM app.campaign_templates WHERE campaign_id IN ${campaigns}`);
  await superuser.query("DELETE FROM app.campaigns WHERE slug LIKE 'prueba-%'");
  await superuser.query(`DELETE FROM app.contacts WHERE id IN ${contacts}`);
  const organisations = `(SELECT id FROM app.organisations
                            WHERE name LIKE 'Prueba %' OR external_ref LIKE 'outreach-org:Prueba %')`;
  await superuser.query(
    `DELETE FROM app.organisation_notes WHERE organisation_id IN ${organisations}`,
  );
  await superuser.query(`DELETE FROM app.organisations WHERE id IN ${organisations}`);
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
  await appDb.destroy();
  await superuser.end();
  await authPool.end();
});

const newContact = async (fields: Record<string, unknown> = {}) => {
  const made = await outreacher.who.send('POST', '/api/outreach/contacts', {
    orgDisplay: `Prueba Asociación ${unique()}`,
    personName: 'Berta Ejemplo',
    role: 'Presidencia',
    email: `Berta.${unique()}@Ejemplo.test`,
    tier: 'A',
    reason: 'Preside una asociación de ejemplo',
    sources: ['https://ejemplo.test/fuente'],
    ...fields,
  });
  expect(made.statusCode).toBe(201);
  return made.json<{ id: string }>().id;
};

describe('organisations and contacts (M3)', () => {
  it('are outreach staff’s to keep, never onboarding staff’s', async () => {
    const org = await outreacher.who.send('POST', '/api/outreach/organisations', {
      name: `Prueba Sindicato ${unique()}`,
      kind: 'union',
      territory: 'Aragón',
      website: 'https://ejemplo.test',
    });
    expect(org.statusCode).toBe(201);
    const organisationId = org.json<{ id: string }>().id;
    const id = await newContact({ organisationId, phone: '612 345 678' });

    const listed = await outreacher.who.send(
      'GET',
      `/api/outreach/contacts?q=${encodeURIComponent('Berta')}&tier=A&kind=union`,
    );
    const summary = listed
      .json<{ contacts: Record<string, unknown>[] }>()
      .contacts.find((contact) => contact.id === id);
    expect(summary).toMatchObject({
      personName: 'Berta Ejemplo',
      organisation: { id: organisationId, kind: 'union' },
      stage: 'identified',
      needsReview: false,
    });
    // Lists never carry contact details.
    expect(summary).not.toHaveProperty('email');
    expect(listed.body).not.toContain('@ejemplo.test');

    const page = (await outreacher.who.send('GET', `/api/outreach/contacts/${id}`)).json<{
      contact: { email: string; phone: string; treatment: string };
      timeline: { kind: string }[];
    }>();
    expect(page.contact.email).toMatch(/^berta\.[\da-f]{8}@ejemplo\.test$/u);
    expect(page.contact).toMatchObject({ phone: '+34612345678', treatment: 'neutral' });
    expect(page.timeline.map((event) => event.kind)).toEqual(['created']);

    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/contacts/${id}`, {
          stage: 'qualified',
          treatment: 'femenino',
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await outreacher.who.send('POST', `/api/outreach/contacts/${id}/notes`, {
          body: 'Una nota',
        })
      ).statusCode,
    ).toBe(201);
    const after = (await outreacher.who.send('GET', `/api/outreach/contacts/${id}`)).json<{
      contact: { stage: string };
      timeline: { kind: string; body: string | null }[];
    }>();
    expect(after.contact.stage).toBe('qualified');
    expect(after.timeline.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['note', 'stage_changed']),
    );

    const orgPage = (
      await outreacher.who.send('GET', `/api/outreach/organisations/${organisationId}`)
    ).json<{ organisation: { kind: string }; contacts: { id: string }[] }>();
    expect(orgPage.organisation.kind).toBe('union');
    expect(orgPage.contacts.map((contact) => contact.id)).toEqual([id]);

    // Nobody's: the contact above has no owner yet; once someone takes it, it isn't.
    const nobodys = async () =>
      (await outreacher.who.send('GET', '/api/outreach/contacts?owner=none'))
        .json<{ contacts: { id: string }[] }>()
        .contacts.map((contact) => contact.id);
    expect(await nobodys()).toContain(id);
    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/contacts/${id}`, {
          ownerId: outreacher.id,
        })
      ).statusCode,
    ).toBe(204);
    expect(await nobodys()).not.toContain(id);
    const mine = (await outreacher.who.send('GET', '/api/outreach/contacts?owner=me')).json<{
      contacts: { id: string }[];
    }>();
    expect(mine.contacts.map((contact) => contact.id)).toContain(id);

    expect((await onboarder.who.send('GET', '/api/outreach/contacts')).statusCode).toBe(403);
    expect((await onboarder.who.send('GET', `/api/outreach/contacts/${id}`)).statusCode).toBe(403);
  });

  it('keep notes on a timeline, an organisation’s too, each dated when it happened if not today (PLAN M5)', async () => {
    const org = await outreacher.who.send('POST', '/api/outreach/organisations', {
      name: `Prueba Fundación ${unique()}`,
      kind: 'ngo',
    });
    const organisationId = org.json<{ id: string }>().id;
    const id = await newContact({ organisationId });
    const note = (path: string, body: Record<string, unknown>) =>
      outreacher.who.send('POST', `/api/outreach/${path}/notes`, body);

    expect(
      (await note(`contacts/${id}`, { body: 'Nos vimos en una jornada', happenedOn: '2026-03-01' }))
        .statusCode,
    ).toBe(201);
    expect((await note(`contacts/${id}`, { body: 'Hoy' })).statusCode).toBe(201);
    const timeline = (await outreacher.who.send('GET', `/api/outreach/contacts/${id}`)).json<{
      timeline: { kind: string; body: string | null; happenedOn: string | null }[];
    }>().timeline;
    // By the day it happened: today's first, the one in March last, after the contact was created today.
    expect(timeline.map(({ kind, body, happenedOn }) => ({ kind, body, happenedOn }))).toEqual([
      { kind: 'note', body: 'Hoy', happenedOn: null },
      { kind: 'created', body: null, happenedOn: null },
      { kind: 'note', body: 'Nos vimos en una jornada', happenedOn: '2026-03-01' },
    ]);

    // Written today, then one from February: the day it happened orders them, not when they were written.
    expect(
      (await note(`organisations/${organisationId}`, { body: 'Quieren una charla' })).statusCode,
    ).toBe(201);
    expect(
      (
        await note(`organisations/${organisationId}`, {
          body: 'Su junta nos recibió',
          happenedOn: '2026-02-10',
        })
      ).statusCode,
    ).toBe(201);
    const page = (
      await outreacher.who.send('GET', `/api/outreach/organisations/${organisationId}`)
    ).json<{
      organisation: Record<string, unknown>;
      notes: { body: string; happenedOn: string | null; actor: { userId: string } }[];
    }>();
    expect(page.organisation).not.toHaveProperty('notes');
    expect(page.notes.map(({ body, happenedOn }) => ({ body, happenedOn }))).toEqual([
      { body: 'Quieren una charla', happenedOn: null },
      { body: 'Su junta nos recibió', happenedOn: '2026-02-10' },
    ]);
    expect(page.notes[0]?.actor.userId).toBe(outreacher.id);

    // Never a day to come, never empty; the notes field is the timeline's now; outsiders can't.
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    for (const path of [`contacts/${id}`, `organisations/${organisationId}`]) {
      expect((await note(path, { body: 'Mañana', happenedOn: tomorrow })).statusCode).toBe(422);
      expect((await note(path, { body: '  ' })).statusCode).toBe(400);
      expect((await note(path, { body: 'Una', happenedOn: '1 de marzo' })).statusCode).toBe(400);
    }
    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/organisations/${organisationId}`, {
          notes: 'Otra',
        })
      ).statusCode,
    ).toBe(400);
    expect((await note(`organisations/${crypto.randomUUID()}`, { body: 'Nadie' })).statusCode).toBe(
      404,
    );
    expect(
      (
        await onboarder.who.send('POST', `/api/outreach/organisations/${organisationId}/notes`, {
          body: 'Yo',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('say why they matter, unless they are still to review, and take valid details only', async () => {
    const unsourced = await outreacher.who.send('POST', '/api/outreach/contacts', {
      orgDisplay: `Prueba Medio ${unique()}`,
      reason: 'Cubre tecnología',
    });
    expect(unsourced.json()).toEqual({ error: 'invalid', field: 'reason' });
    const toReview = await outreacher.who.send('POST', '/api/outreach/contacts', {
      orgDisplay: `Prueba Medio ${unique()}`,
      needsReview: true,
    });
    expect(toReview.statusCode).toBe(201);
    for (const [fields, field] of [
      [{ email: 'no-es-correo' }, 'email'],
      [{ phone: '12' }, 'phone'],
      [{ emailsExtra: ['bien@ejemplo.test', 'mal'] }, 'emailsExtra'],
    ] as const) {
      const refused = await outreacher.who.send('POST', '/api/outreach/contacts', {
        orgDisplay: `Prueba Medio ${unique()}`,
        needsReview: true,
        ...fields,
      });
      expect(refused.json()).toEqual({ error: 'invalid', field });
    }
    expect(
      (
        await outreacher.who.send('POST', '/api/outreach/contacts', {
          orgDisplay: `Prueba Medio ${unique()}`,
          needsReview: true,
          treatment: 'señora',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('are erased by admins only, and stay erased', async () => {
    const id = await newContact();
    expect(
      (await outreacher.who.send('POST', `/api/outreach/contacts/${id}/erase`)).statusCode,
    ).toBe(403);
    expect((await admin.who.send('POST', `/api/outreach/contacts/${id}/erase`)).statusCode).toBe(
      204,
    );
    expect((await admin.who.send('POST', `/api/outreach/contacts/${id}/erase`)).statusCode).toBe(
      409,
    );
    const page = (await admin.who.send('GET', `/api/outreach/contacts/${id}`)).json<{
      contact: {
        personName: string | null;
        email: string | null;
        hold: boolean;
        anonymised: boolean;
      };
    }>();
    expect(page.contact).toMatchObject({
      personName: null,
      email: null,
      hold: true,
      anonymised: true,
    });
    expect(
      (await admin.who.send('PATCH', `/api/outreach/contacts/${id}`, { personName: 'Otra vez' }))
        .statusCode,
    ).toBe(404);
  });
});

describe('campaigns, letters and Siguiente (M3)', () => {
  it('write each letter from its template and anchor, hand it over, and record that it went', async () => {
    const created = await outreacher.who.send('POST', '/api/outreach/campaigns', {
      slug: slugOf(),
      name: 'Prueba de campaña',
      signature: 'Equipo de ejemplo',
      status: 'active',
    });
    expect(created.statusCode).toBe(201);
    const campaign = created.json<{ id: string }>().id;

    const unknownField = await outreacher.who.send(
      'PUT',
      `/api/outreach/campaigns/${campaign}/templates/A`,
      { subject: 'Hola {{org}}', body: '{{saludo}} {{cargo}}', sources: [] },
    );
    expect(unknownField.json()).toEqual({ error: 'invalid', field: 'body', fields: ['cargo'] });
    expect(
      (
        await outreacher.who.send('PUT', `/api/outreach/campaigns/${campaign}/templates/A`, {
          subject: 'Para {{org}}',
          body: '{{saludo}}\n\n{{anchor}}\n\n{{firma}}',
          maxWords: 200,
          sources: ['https://ejemplo.test/carta'],
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await outreacher.who.send('PUT', `/api/outreach/campaigns/${campaign}/anchors/empleo`, {
          label: 'Empleo',
          text: 'Un párrafo con una cifra de ejemplo.',
          sources: ['https://ejemplo.test/cifra'],
        })
      ).statusCode,
    ).toBe(204);

    const ready = await newContact({ anchor: 'empleo', phone: '+34 612 000 222' });
    const unreviewed = await newContact({ anchor: 'empleo', needsReview: true });
    const added = await outreacher.who.send('POST', `/api/outreach/campaigns/${campaign}/targets`, {
      contactIds: [ready, unreviewed],
    });
    expect(added.json()).toEqual({ added: 2 });
    expect(
      (
        await outreacher.who.send('POST', `/api/outreach/campaigns/${campaign}/targets`, {
          contactIds: [ready],
        })
      ).json(),
    ).toEqual({ added: 0 });

    const page = (await outreacher.who.send('GET', `/api/outreach/campaigns/${campaign}`)).json<{
      templates: { tier: string; version: number }[];
      anchors: { key: string }[];
      targets: { id: string; status: string; contact: { id: string } }[];
    }>();
    expect(page.templates).toMatchObject([{ tier: 'A', version: 1 }]);
    expect(page.anchors.map((anchor) => anchor.key)).toEqual(['empleo']);
    const targetOf = (contact: string) =>
      page.targets.find((target) => target.contact.id === contact)?.id ?? '';

    // Siguiente: the one that can go, with its letter; the unreviewed one is counted, not offered.
    const next = (
      await outreacher.who.send('GET', `/api/outreach/next?campaign=${campaign}`)
    ).json<{
      target: { id: string };
      handover: {
        letter: { ok: boolean; subject: string; body: string; sources: string[] };
        to: string[];
        mailto: string;
        whatsapp: string;
        templateVersion: number;
      };
      remaining: number;
      blocked: number;
    }>();
    expect(next.target.id).toBe(targetOf(ready));
    expect(next).toMatchObject({ remaining: 1, blocked: 1 });
    // "Ahora no": left for later in this visit, it isn't offered again.
    expect(
      (
        await outreacher.who.send(
          'GET',
          `/api/outreach/next?campaign=${campaign}&skip=${targetOf(ready)}`,
        )
      ).json(),
    ).toMatchObject({ target: null, remaining: 0, blocked: 1 });
    expect(
      (await outreacher.who.send('GET', `/api/outreach/next?skip=no-es-un-id`)).statusCode,
    ).toBe(400);
    expect(next.handover.letter).toMatchObject({
      ok: true,
      body: expect.stringContaining('Estimado/a Berta Ejemplo:'),
      sources: ['https://ejemplo.test/carta', 'https://ejemplo.test/cifra'],
    });
    expect(next.handover.mailto).toMatch(/^mailto:berta\.[\da-f]{8}@ejemplo\.test\?subject=/u);
    expect(next.handover.whatsapp).toMatch(/^https:\/\/wa\.me\/34612000222\?text=/u);

    // The unreviewed one's letter says why it can't go, and it can't be made ready.
    const blocked = (
      await outreacher.who.send('GET', `/api/outreach/targets/${targetOf(unreviewed)}/letter`)
    ).json<{ letter: { ok: boolean; problems: { kind: string }[] }; mailto: string | null }>();
    expect(blocked).toMatchObject({
      letter: { ok: false, problems: [{ kind: 'needsReview' }] },
      mailto: null,
    });
    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/targets/${targetOf(unreviewed)}`, {
          status: 'ready',
        })
      ).json(),
    ).toEqual({ error: 'needsReview' });

    // "Sí, enviado", once.
    const sent = await outreacher.who.send('POST', `/api/outreach/targets/${next.target.id}/sent`, {
      templateVersion: next.handover.templateVersion,
    });
    expect(sent.statusCode).toBe(204);
    expect(
      (await outreacher.who.send('POST', `/api/outreach/targets/${next.target.id}/sent`, {}))
        .statusCode,
    ).toBe(409);
    const contact = (await outreacher.who.send('GET', `/api/outreach/contacts/${ready}`)).json<{
      contact: { stage: string };
      targets: { status: string; sentAt: string | null }[];
    }>();
    expect(contact.contact.stage).toBe('contacted');
    expect(contact.targets[0]).toMatchObject({ status: 'sent', sentAt: expect.any(String) });
    expect(
      (await outreacher.who.send('GET', `/api/outreach/next?campaign=${campaign}`)).json(),
    ).toMatchObject({ target: null, remaining: 0, blocked: 1 });

    // Someone written to stays; the anchor they use stays too.
    expect(
      (await outreacher.who.send('DELETE', `/api/outreach/targets/${next.target.id}`)).json(),
    ).toEqual({ error: 'sent' });
    expect(
      (
        await outreacher.who.send('DELETE', `/api/outreach/campaigns/${campaign}/anchors/empleo`)
      ).json(),
    ).toEqual({ error: 'inUse' });
    expect(
      (await outreacher.who.send('DELETE', `/api/outreach/targets/${targetOf(unreviewed)}`))
        .statusCode,
    ).toBe(204);

    // Plantillas: the preview for anyone, a target or not.
    const preview = await outreacher.who.send(
      'GET',
      `/api/outreach/campaigns/${campaign}/preview?contact=${ready}`,
    );
    expect(preview.json<{ letter: { ok: boolean } }>().letter.ok).toBe(true);

    const listed = (await outreacher.who.send('GET', '/api/outreach/campaigns')).json<{
      campaigns: { id: string; counts: Record<string, number> }[];
    }>();
    expect(listed.campaigns.find((c) => c.id === campaign)?.counts).toEqual({ sent: 1 });
    expect((await onboarder.who.send('GET', '/api/outreach/campaigns')).statusCode).toBe(403);
  });

  it('let one person take a target, so Siguiente offers it to nobody else, and keep its history', async () => {
    const campaign = (
      await outreacher.who.send('POST', '/api/outreach/campaigns', {
        slug: slugOf(),
        name: 'Prueba de reparto',
        status: 'active',
        signature: 'Firma',
      })
    ).json<{ id: string }>().id;
    // An empty signature stays empty, never null.
    expect(
      (await outreacher.who.send('PATCH', `/api/outreach/campaigns/${campaign}`, { signature: '' }))
        .statusCode,
    ).toBe(204);
    await outreacher.who.send('PUT', `/api/outreach/campaigns/${campaign}/templates/A`, {
      subject: 'Asunto',
      body: '{{saludo}}',
      sources: [],
    });
    const contact = await newContact();
    await outreacher.who.send('POST', `/api/outreach/campaigns/${campaign}/targets`, {
      contactIds: [contact],
    });
    const colleague = await staffMember('outreach');
    const next = (who: typeof outreacher) =>
      who.who
        .send('GET', `/api/outreach/next?campaign=${campaign}`)
        .then((answer) => answer.json<{ target: { id: string } | null }>());
    const offered = (await next(outreacher)).target?.id ?? '';
    expect((await next(colleague)).target?.id).toBe(offered);

    // Taken by one: the other isn't offered it, can't take it, and can't record it as sent.
    expect(
      (await outreacher.who.send('POST', `/api/outreach/targets/${offered}/claim`)).statusCode,
    ).toBe(204);
    expect((await next(colleague)).target).toBeNull();
    expect(
      (await colleague.who.send('POST', `/api/outreach/targets/${offered}/claim`)).json(),
    ).toEqual({ error: 'taken' });
    expect(
      (await colleague.who.send('POST', `/api/outreach/targets/${offered}/sent`, {})).json(),
    ).toEqual({ error: 'taken' });

    // Sent, with a template version the campaign never had: the send is kept, the version isn't.
    expect(
      (
        await outreacher.who.send('POST', `/api/outreach/targets/${offered}/sent`, {
          templateVersion: 99,
        })
      ).statusCode,
    ).toBe(204);
    const kept = await superuser.query(
      'SELECT status::text, template_version FROM app.campaign_targets WHERE id = $1',
      [offered],
    );
    expect(kept.rows[0]).toEqual({ status: 'sent', template_version: null });
    // Written to: it never goes back to the queue.
    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/targets/${offered}`, {
          status: 'pending',
        })
      ).json(),
    ).toEqual({ error: 'sent' });
    expect((await next(outreacher)).target).toBeNull();
  });

  it('refuse a slug already taken', async () => {
    const slug = slugOf();
    expect(
      (await outreacher.who.send('POST', '/api/outreach/campaigns', { slug, name: 'Una' }))
        .statusCode,
    ).toBe(201);
    expect(
      (await outreacher.who.send('POST', '/api/outreach/campaigns', { slug, name: 'Otra' })).json(),
    ).toMatchObject({ error: 'taken' });
  });
});

describe('private records, "Solo yo" (PLAN M5, step 6)', () => {
  type Page = {
    contact: { private: boolean; email: string | null; emailsExtra: string[] };
    timeline: { kind: string; body: string | null; private: boolean }[];
  };
  const page = async (who: typeof outreacher, id: string) =>
    (await who.who.send('GET', `/api/outreach/contacts/${id}`)).json<Page>();
  const listed = async (who: typeof outreacher, query = '') =>
    (await who.who.send('GET', `/api/outreach/contacts${query}`))
      .json<{ contacts: { id: string; private: boolean }[] }>()
      .contacts.map((contact) => contact.id);

  it('are their own person’s alone: nobody else on the team sees them, an admin neither', async () => {
    const email = `privada.${unique()}@ejemplo.test`;
    const id = await newContact({ email, private: true, needsReview: true });
    expect((await page(outreacher, id)).contact.private).toBe(true);
    expect(await listed(outreacher, '?visibility=private')).toContain(id);
    expect(await listed(outreacher, '?visibility=team')).not.toContain(id);
    for (const other of [colleague, admin]) {
      expect(await listed(other)).not.toContain(id);
      expect((await other.who.send('GET', `/api/outreach/contacts/${id}`)).statusCode).toBe(404);
      expect(
        (await other.who.send('PATCH', `/api/outreach/contacts/${id}`, { stage: 'qualified' }))
          .statusCode,
      ).toBe(404);
      expect(
        (await other.who.send('POST', `/api/outreach/contacts/${id}/notes`, { body: 'Hola' }))
          .statusCode,
      ).toBe(404);
    }
    // Nor do they block anyone: a colleague's team contact with the same address just goes in.
    const theirs = await colleague.who.send('POST', '/api/outreach/contacts', {
      orgDisplay: `Prueba Medio ${unique()}`,
      email,
      reason: 'Cubre tecnología',
      sources: ['https://ejemplo.test/fuente'],
    });
    expect(theirs.statusCode).toBe(201);
  });

  it('keep private notes on a team contact, and once shared stay the team’s', async () => {
    const id = await newContact();
    const note = (body: Record<string, unknown>) =>
      outreacher.who.send('POST', `/api/outreach/contacts/${id}/notes`, body);
    expect((await note({ body: 'Para el equipo' })).statusCode).toBe(201);
    expect((await note({ body: 'Solo para mí', private: true })).statusCode).toBe(201);
    const notes = async (who: typeof outreacher) =>
      (await page(who, id)).timeline
        .filter((event) => event.kind === 'note')
        .map(({ body, private: isPrivate }) => ({ body, private: isPrivate }));
    expect(await notes(outreacher)).toEqual(
      expect.arrayContaining([
        { body: 'Para el equipo', private: false },
        { body: 'Solo para mí', private: true },
      ]),
    );
    expect(await notes(colleague)).toEqual([{ body: 'Para el equipo', private: false }]);
    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/contacts/${id}`, { private: true })
      ).json(),
    ).toEqual({ error: 'shared' });
  });

  it('are shared when their person says, into a team contact that is the same person if there is one', async () => {
    const email = `doble.${unique()}@ejemplo.test`;
    const other = `otra.${unique()}@ejemplo.test`;
    const mine = await newContact({ email: other, private: true });
    const team = await newContact({ email });
    await outreacher.who.send('PATCH', `/api/outreach/contacts/${mine}`, { emailsExtra: [email] });
    await outreacher.who.send('POST', `/api/outreach/contacts/${mine}/notes`, {
      body: 'Lo que hablamos',
    });
    const matches = (
      await outreacher.who.send('GET', `/api/outreach/contacts/${mine}/matches`)
    ).json<{ contacts: { id: string }[] }>().contacts;
    expect(matches.map((contact) => contact.id)).toEqual([team]);
    // Only its own person merges it.
    expect(
      (
        await colleague.who.send('POST', `/api/outreach/contacts/${mine}/merge`, { into: team })
      ).json(),
    ).toEqual({ error: 'stale' });
    expect(
      (await outreacher.who.send('POST', `/api/outreach/contacts/${mine}/merge`, { into: team }))
        .statusCode,
    ).toBe(204);
    expect((await outreacher.who.send('GET', `/api/outreach/contacts/${mine}`)).statusCode).toBe(
      404,
    );
    const merged = await page(outreacher, team);
    // The team's address stays; the private one's own joins as an extra.
    expect(merged.contact).toMatchObject({ email, emailsExtra: [other] });
    expect(merged.timeline.map((event) => [event.kind, event.private])).toEqual(
      expect.arrayContaining([
        ['shared', false],
        ['note', true],
      ]),
    );
    expect((await page(colleague, team)).timeline.map((event) => event.kind)).not.toContain('note');

    // Sharing without a match: the contact becomes the team's, and its timeline says so.
    const alone = await newContact({ private: true });
    expect(
      (await outreacher.who.send('PATCH', `/api/outreach/contacts/${alone}`, { private: false }))
        .statusCode,
    ).toBe(204);
    expect((await page(colleague, alone)).timeline.map((event) => event.kind)).toEqual(['shared']);
  });

  it('take their notes along when shared or merged, if their person ticks it (PLAN R52)', async () => {
    const notesSeenBy = async (who: typeof outreacher, id: string) =>
      (await page(who, id)).timeline
        .filter((event) => event.kind === 'note')
        .map((event) => event.body);

    const alone = await newContact({ private: true });
    await outreacher.who.send('POST', `/api/outreach/contacts/${alone}/notes`, {
      body: 'Lo que hablamos a solas',
    });
    expect(
      (
        await outreacher.who.send('PATCH', `/api/outreach/contacts/${alone}`, {
          private: false,
          shareHistory: true,
        })
      ).statusCode,
    ).toBe(204);
    expect(await notesSeenBy(colleague, alone)).toEqual(['Lo que hablamos a solas']);

    const email = `historial.${unique()}@ejemplo.test`;
    const mine = await newContact({ email: `mia.${unique()}@ejemplo.test`, private: true });
    const team = await newContact({ email });
    await outreacher.who.send('PATCH', `/api/outreach/contacts/${mine}`, { emailsExtra: [email] });
    await outreacher.who.send('POST', `/api/outreach/contacts/${mine}/notes`, {
      body: 'Antes de fusionar',
    });
    expect(
      (
        await outreacher.who.send('POST', `/api/outreach/contacts/${mine}/merge`, {
          into: team,
          shareHistory: true,
        })
      ).statusCode,
    ).toBe(204);
    expect(await notesSeenBy(colleague, team)).toEqual(['Antes de fusionar']);

    const org = (
      await outreacher.who.send('POST', '/api/outreach/organisations', {
        name: `Prueba Historial ${unique()}`,
        kind: 'ngo',
        private: true,
      })
    ).json<{ id: string }>().id;
    await outreacher.who.send('POST', `/api/outreach/organisations/${org}/notes`, {
      body: 'De la organización',
    });
    await outreacher.who.send('PATCH', `/api/outreach/organisations/${org}`, {
      private: false,
      shareHistory: true,
    });
    const orgNotes = (await colleague.who.send('GET', `/api/outreach/organisations/${org}`)).json<{
      notes: { body: string }[];
    }>().notes;
    expect(orgNotes.map((note) => note.body)).toEqual(['De la organización']);
  });

  it('keep a team contact out of a private organisation, and campaigns to team contacts', async () => {
    const org = (
      await outreacher.who.send('POST', '/api/outreach/organisations', {
        name: `Prueba Privada ${unique()}`,
        kind: 'ngo',
        private: true,
      })
    ).json<{ id: string }>().id;
    const orgs = async (who: typeof outreacher) =>
      (await who.who.send('GET', '/api/outreach/organisations?visibility=private'))
        .json<{ organisations: { id: string; private: boolean }[] }>()
        .organisations.map((organisation) => organisation.id);
    expect(await orgs(outreacher)).toContain(org);
    expect(await orgs(colleague)).not.toContain(org);
    expect(
      (
        await outreacher.who.send('POST', '/api/outreach/contacts', {
          orgDisplay: 'Prueba de equipo',
          organisationId: org,
          needsReview: true,
        })
      ).json(),
    ).toEqual({ error: 'organisationPrivate' });

    const campaign = (
      await outreacher.who.send('POST', '/api/outreach/campaigns', {
        slug: slugOf(),
        name: 'Prueba privada',
      })
    ).json<{ id: string }>().id;
    const mine = await newContact({ private: true });
    const added = await outreacher.who.send('POST', `/api/outreach/campaigns/${campaign}/targets`, {
      contactIds: [mine],
    });
    expect(added.json()).toEqual({ added: 0 });
  });

  it('reach a rights request through admins, and a departed member’s go to whoever an admin chooses', async () => {
    const email = `derechos.${unique()}@ejemplo.test`;
    const id = (
      await colleague.who.send('POST', '/api/outreach/contacts', {
        orgDisplay: `Prueba Derechos ${unique()}`,
        email,
        needsReview: true,
        private: true,
      })
    ).json<{ id: string }>().id;
    await colleague.who.send('POST', `/api/outreach/contacts/${id}/notes`, {
      body: 'Nos contó algo',
    });

    expect((await outreacher.who.send('GET', `/api/outreach/rights?q=${email}`)).statusCode).toBe(
      403,
    );
    const found = (
      await admin.who.send(
        'GET',
        `/api/outreach/rights?q=${encodeURIComponent(email.toUpperCase())}`,
      )
    ).json<{ contacts: { id: string; private: boolean }[] }>().contacts;
    expect(found).toEqual([expect.objectContaining({ id, private: true })]);
    const exported = await admin.who.send('GET', `/api/outreach/contacts/${id}/export`);
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('attachment');
    expect(exported.body).toContain('Nos contó algo');
    expect(exported.body).not.toContain(colleague.id);
    expect(
      (
        await superuser.query(
          "SELECT count(*)::int AS n FROM app.exports WHERE kind = 'contact_json' AND filter->>'contact' = $1",
          [id],
        )
      ).rows,
    ).toEqual([{ n: 1 }]);

    // The colleague leaves: their records wait, counted, until an admin hands them over.
    expect(
      (await admin.who.send('PATCH', `/api/staff/${colleague.id}`, { active: false })).statusCode,
    ).toBe(204);
    const records = (await admin.who.send('GET', '/api/staff/private-records')).json<{
      records: { userId: string; contacts: number; notes: number }[];
    }>().records;
    expect(records.find((record) => record.userId === colleague.id)).toMatchObject({
      contacts: 1,
      notes: 1,
    });
    expect((await outreacher.who.send('GET', '/api/staff/private-records')).statusCode).toBe(403);
    const handOver = (to: string, from = colleague.id) =>
      admin.who.send('POST', `/api/staff/${from}/private-records`, { to });
    expect((await handOver(onboarder.id)).json()).toEqual({ error: 'heir' });
    expect((await handOver(admin.id, outreacher.id)).json()).toEqual({ error: 'stillActive' });
    expect((await handOver(outreacher.id)).json()).toMatchObject({ moved: expect.any(Number) });
    expect((await page(outreacher, id)).contact.private).toBe(true);
    expect(
      (await admin.who.send('PATCH', `/api/staff/${colleague.id}`, { active: true })).statusCode,
    ).toBe(204);
  });
});

describe('importing from the outreach repo (M3)', () => {
  const files = (slug: string, contacts?: string) => ({
    campaign: `slug: ${slug}\nname: Prueba importada\nlanguage: es\nfromName: Equipo\nfromEmail: Equipo@Ejemplo.test\nsignature: |\n  Equipo de ejemplo\n`,
    contacts:
      contacts ??
      [
        'version: 1',
        'contacts:',
        '  - id: uno',
        '    org: Prueba Sindicato Importado',
        '    orgDisplay: Prueba Sindicato Importado — Aragón',
        '    territory: Aragón',
        '    scope: regional',
        '    sector: Educación',
        '    email: uno@ejemplo.test',
        '    tier: A',
        '    anchor: empleo',
        '    priority: 1',
        '    source: https://ejemplo.test/uno',
        '    phone: no-es-un-telefono',
        '  - id: dos',
        '    org: Prueba Sindicato Importado',
        '    orgDisplay: Prueba Sindicato Importado — Teruel',
        '    email: dos@ejemplo.test',
        '    tier: B',
        '    anchor: empleo',
        '    person:',
        '      name: Dos Ejemplo',
        '      role: Secretaría',
        '  - id: tres',
        '    org: Prueba Otra Organización',
        '    email: tres@ejemplo.test',
        '    tier: B',
        '    anchor: empleo',
        '    source: https://ejemplo.test/tres',
        '    hold: true',
        '    holdReason: Lo lleva otro equipo',
        '',
      ].join('\n'),
    anchors:
      'version: 1\nanchors:\n  empleo:\n    label: Empleo\n    text: Un párrafo de ejemplo.\n    sources:\n      - https://ejemplo.test/cifra\n',
    templates: {
      A: '---\nsubject: Para {{org}}\nmaxWords: 300\nsources:\n  - https://ejemplo.test/carta\n---\n{{saludo}}\n\n{{anchor}}\n\n{{firma}}\n',
      B: '---\nsubject: Hola {{org}}\n---\n{{saludo}}\n\n{{firma}}\n',
    },
    tracking:
      'id,org,person,email,tier,status,sent_at,replied_at,meeting_at,owner,notes\n' +
      'uno,X,,uno@ejemplo.test,A,replied,2026-09-01,2026-09-03,,Persona Ejemplo,Respondió\n' +
      'tres,X,,tres@ejemplo.test,B,sent,2026-09-02,,,,\n' +
      'fantasma,X,,x@ejemplo.test,B,sent,2026-09-01,,,,\n',
  });

  it('dry runs, then writes a campaign with its contacts, targets, templates and anchors, once', async () => {
    const slug = slugOf();
    const dry = await admin.who.send('POST', '/api/outreach/import', {
      dryRun: true,
      files: files(slug),
    });
    expect(dry.statusCode).toBe(200);
    const preview = dry.json<{
      counts: Record<string, number>;
      problems: unknown[];
      warnings: { file: string; line?: number; message: string }[];
    }>();
    expect(preview.counts).toEqual({
      organisations: 2,
      contacts: 3,
      targets: 3,
      templates: 2,
      anchors: 1,
    });
    expect(preview.problems).toEqual([]);
    expect(preview.warnings.map((w) => [w.file, w.line])).toEqual(
      expect.arrayContaining([
        ['contacts/contacts.yaml', 3],
        ['tracking.csv', 4],
      ]),
    );
    // A dry run writes nothing.
    const none = await superuser.query('SELECT 1 FROM app.campaigns WHERE slug = $1', [slug]);
    expect(none.rows).toEqual([]);

    // Admins only, in the API: with history or without (history alone the database also keeps to admins).
    const { tracking: _history, ...noHistory } = files(slug);
    for (const sent of [files(slug), noHistory]) {
      expect(
        (await outreacher.who.send('POST', '/api/outreach/import', { dryRun: true, files: sent }))
          .statusCode,
      ).toBe(403);
    }

    const done = await admin.who.send('POST', '/api/outreach/import', {
      dryRun: false,
      files: files(slug),
    });
    expect(done.json()).toMatchObject({ dryRun: false, counts: { contacts: 3, targets: 3 } });
    const rows = await superuser.query<{
      id: string;
      stage: string;
      needs_review: boolean;
      status: string | null;
      notes: string | null;
    }>(
      `SELECT split_part(c.external_ref, ':', 3) AS id, c.stage::text AS stage, c.needs_review, t.status::text AS status,
              t.notes
         FROM app.contacts c LEFT JOIN app.campaign_targets t ON t.contact_id = c.id
        WHERE c.external_ref LIKE $1 ORDER BY 1`,
      [`outreach:${slug}:%`],
    );
    expect(rows.rows).toEqual([
      { id: 'dos', stage: 'identified', needs_review: true, status: 'pending', notes: null },
      // Held, but already written to: the history is kept, and the hold keeps them out of every queue.
      { id: 'tres', stage: 'contacted', needs_review: false, status: 'sent', notes: null },
      {
        id: 'uno',
        stage: 'engaged',
        needs_review: false,
        status: 'replied',
        notes: 'Respondió\nResponsable en el repositorio: Persona Ejemplo',
      },
    ]);

    const again = await admin.who.send('POST', '/api/outreach/import', {
      dryRun: false,
      files: files(slug),
    });
    expect(again.statusCode).toBe(422);
    expect(again.json<{ problems: { file: string }[] }>().problems).toEqual([
      expect.objectContaining({ file: 'campaign.yaml' }),
    ]);
  });

  it('takes a campaign far larger than the API’s usual 64 KB body', async () => {
    const contacts = [
      'contacts:',
      ...Array.from({ length: 500 }, (_, n) =>
        [
          `  - id: contacto-${n}`,
          '    org: Prueba Organización Grande',
          `    orgDisplay: Prueba Organización Grande — Sección ${n}`,
          `    email: buzon.${n}@ejemplo.test`,
          '    tier: B',
          '    anchor: empleo',
          `    source: https://ejemplo.test/fuente/${n}`,
          '    notes: Una nota de ejemplo para que el archivo pese lo que pesa uno de verdad.',
        ].join('\n'),
      ),
      '',
    ].join('\n');
    expect(contacts.length).toBeGreaterThan(128 * 1024);
    const dry = await admin.who.send('POST', '/api/outreach/import', {
      dryRun: true,
      files: files(slugOf(), contacts),
    });
    expect(dry.statusCode).toBe(200);
    expect(dry.json<{ counts: { contacts: number } }>().counts.contacts).toBe(500);
  });

  it('refuses a body from someone not signed in before reading it', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/outreach/import',
      headers: {
        host: new URL(STAFF_ORIGIN).host,
        origin: STAFF_ORIGIN,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        dryRun: true,
        files: { campaign: 'x'.repeat(1024 * 1024), contacts: '' },
      }),
    });
    expect(anonymous.statusCode).toBe(401);
    const elsewhere = await admin.who.send(
      'POST',
      '/api/outreach/import',
      { dryRun: true, files: files(slugOf()) },
      { origin: 'https://otro.example.test' },
    );
    expect(elsewhere.statusCode).toBe(403);
  });

  it('lists every problem with its file and line, and writes nothing', async () => {
    const slug = slugOf();
    const broken = await admin.who.send('POST', '/api/outreach/import', {
      dryRun: false,
      files: files(
        slug,
        'contacts:\n  - id: uno\n    org: Prueba Mala\n    email: no-es-correo\n  - id: uno\n    org: Prueba Mala\n',
      ),
    });
    expect(broken.statusCode).toBe(422);
    expect(
      broken
        .json<{ problems: { file: string; line?: number }[] }>()
        .problems.map((p) => [p.file, p.line]),
    ).toEqual([
      ['contacts/contacts.yaml', 2],
      ['contacts/contacts.yaml', 5],
    ]);
    const none = await superuser.query('SELECT 1 FROM app.campaigns WHERE slug = $1', [slug]);
    expect(none.rows).toEqual([]);
  });
});
