import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { MailMessage } from '../src/mail/mailer.js';

import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { endSessions } from '../src/auth/cleanup.js';
import { createInvitedAccounts } from '../src/auth/invited-accounts.js';
import { createPasswordLinks } from '../src/auth/password-links.js';
import { createPasswordMail } from '../src/auth/password-mail.js';
import { createInvitationSender } from '../src/staff/invitations.js';
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

/** Every email the API sends, instead of sending it; `failNext` makes the next one fail. */
const outbox: MailMessage[] = [];
let failNext = false;
const mailer = {
  send: async (message: MailMessage) => {
    if (failNext) {
      failNext = false;
      throw Object.assign(new Error('a message the logs must never see'), { responseCode: 550 });
    }
    outbox.push(message);
  },
};

const options = {
  pool: authPool,
  secret: SECRET,
  staffOrigin: STAFF_ORIGIN,
  totpIssuer: TOTP_ISSUER,
};
const passwordMail = createPasswordMail({
  mailer,
  staffOrigin: STAFF_ORIGIN,
  productName: TOTP_ISSUER,
});
const app = buildApp({
  api: {
    auth: { auth: createAuth({ ...options, passwordMail }), staffOrigin: STAFF_ORIGIN },
    app: appDb,
    invitations: {
      accounts: createInvitedAccounts(options),
      send: createInvitationSender({ mailer, staffOrigin: STAFF_ORIGIN, productName: TOTP_ISSUER }),
    },
    passwordLinks: createPasswordLinks({ ...options, passwordMail }),
    endSessions: (userId) => endSessions(authPool, userId),
  },
});

const accounts: string[] = [];
const addresses: string[] = [];

type Visitor = ReturnType<typeof browser>;

const visitor = (address = testAddress()): Visitor => {
  addresses.push(address);
  return browser(app, address);
};

const signIn = (who: Visitor, email: string, password = PASSWORD) =>
  who.send('POST', '/api/auth/sign-in/email', { email, password });

/** Signs an account in and enrols TOTP through the endpoints, as the enrolment page does. */
const enrol = async (who: Visitor, email: string, password = PASSWORD) => {
  expect((await signIn(who, email, password)).statusCode).toBe(200);
  const enabled = await who.send('POST', '/api/auth/two-factor/enable', { password });
  expect(enabled.statusCode).toBe(200);
  const { totpURI } = enabled.json<{ totpURI: string }>();
  expect(
    (await who.send('POST', '/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) }))
      .statusCode,
  ).toBe(200);
  return totpURI;
};

/** An enrolled account made admin by the owner's SQL (docs/runbooks/first-admin.md), signed in. */
const signedInAdmin = async () => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const who = visitor();
  await enrol(who, created.email);
  await superuser.query(
    `INSERT INTO app.staff (user_id, display_name) SELECT id, name FROM auth.users WHERE id = $1 AND two_factor_enabled`,
    [created.id],
  );
  await superuser.query(`INSERT INTO app.staff_roles (user_id, role) VALUES ($1, 'admin')`, [
    created.id,
  ]);
  return { ...created, who };
};

const tokenFrom = (message: MailMessage | undefined): string => {
  const match = /#token=(\S+)/u.exec(message?.text ?? '');
  if (!match?.[1]) {
    throw new Error('No link in the email');
  }
  return decodeURIComponent(match[1]);
};

let admin: Awaited<ReturnType<typeof signedInAdmin>>;

beforeAll(async () => {
  await app.ready();
  admin = await signedInAdmin();
});

afterAll(async () => {
  // Staff rows keep their accounts (a foreign key): the test's go first, with what names them.
  await superuser.query(
    `DELETE FROM app.invitations WHERE created_by = ANY($1::uuid[]) OR accepted_by = ANY($1::uuid[])`,
    [accounts],
  );
  await superuser.query('DELETE FROM app.staff_roles WHERE user_id = ANY($1::uuid[])', [accounts]);
  await superuser.query('DELETE FROM app.staff WHERE user_id = ANY($1::uuid[])', [accounts]);
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

describe('the staff API (M0)', () => {
  it('answers only on the staff host, and says where a request stands', async () => {
    const elsewhere = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { host: 'otro.example.test' },
    });
    expect(elsewhere.statusCode).toBe(404);
    const stranger = await visitor().send('GET', '/api/session');
    expect(stranger.statusCode).toBe(401);
    expect(stranger.json()).toEqual({ stage: 'signed-out' });
    const session = await admin.who.send('GET', '/api/session');
    expect(session.json()).toMatchObject({
      stage: 'signed-in',
      user: { id: admin.id, email: admin.email },
      staff: { roles: ['admin'] },
    });
    expect(session.headers['cache-control']).toBe('no-store');
  });

  it('gives a signed-in account that is not staff a session and nothing else', async () => {
    const created = await createAccount(authPool);
    accounts.push(created.id);
    const who = visitor();
    await enrol(who, created.email);
    expect((await who.send('GET', '/api/session')).json()).toMatchObject({
      stage: 'signed-in',
      staff: null,
    });
    expect((await who.send('GET', '/api/staff')).json()).toMatchObject({ staff: [] });
    expect((await who.send('GET', '/api/invitations')).statusCode).toBe(403);
  });

  it('invites someone, who makes an account, enrols, and joins the team with the roles offered', async () => {
    outbox.length = 0;
    const email = `nueva-${crypto.randomUUID()}@ejemplo.test`;
    const invited = await admin.who.send('POST', '/api/invitations', {
      email,
      roles: ['onboarding'],
    });
    expect(invited.statusCode).toBe(201);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe(email);
    const token = tokenFrom(outbox[0]);

    const newcomer = visitor();
    const lookup = await newcomer.send('POST', '/api/invitations/lookup', { token });
    expect(lookup.json()).toEqual({
      email,
      roles: ['onboarding'],
      account: false,
      session: 'none',
    });
    const accepted = await newcomer.send('POST', '/api/invitations/accept', {
      token,
      name: 'Persona nueva',
      password: PASSWORD,
    });
    expect(accepted.statusCode).toBe(201);
    const { rows } = await authPool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const id = rows[0]?.id ?? '';
    accounts.push(id);
    // Once only.
    expect((await visitor().send('POST', '/api/invitations/lookup', { token })).statusCode).toBe(
      404,
    );

    // Before TOTP, the staff row exists but the database gives the account nothing.
    expect((await signIn(newcomer, email)).statusCode).toBe(200);
    expect((await newcomer.send('GET', '/api/session')).json()).toMatchObject({
      stage: 'enrol',
      staff: null,
    });
    expect((await newcomer.send('GET', '/api/staff')).statusCode).toBe(401);

    const fresh = visitor();
    await enrol(fresh, email);
    expect((await fresh.send('GET', '/api/session')).json()).toMatchObject({
      stage: 'signed-in',
      staff: { displayName: 'Persona nueva', roles: ['onboarding'] },
    });
    const team = (await fresh.send('GET', '/api/staff')).json<{ staff: { userId: string }[] }>();
    expect(team.staff.map((member) => member.userId)).toContain(admin.id);
    // Not an admin: no invitations, no changes, no audit log.
    expect((await fresh.send('GET', '/api/invitations')).statusCode).toBe(403);
    expect((await fresh.send('GET', '/api/audit')).statusCode).toBe(403);
    expect(
      (await fresh.send('PATCH', `/api/staff/${admin.id}`, { active: false })).statusCode,
    ).toBe(403);

    // The admin changes their roles, then deactivates them, which signs them out everywhere.
    expect(
      (await admin.who.send('PATCH', `/api/staff/${id}`, { roles: ['onboarding', 'outreach'] }))
        .statusCode,
    ).toBe(204);
    expect((await fresh.send('GET', '/api/session')).json()).toMatchObject({
      staff: { roles: ['onboarding', 'outreach'] },
    });
    expect((await admin.who.send('PATCH', `/api/staff/${id}`, { active: false })).statusCode).toBe(
      204,
    );
    expect((await fresh.send('GET', '/api/session')).statusCode).toBe(401);
    const member = (await admin.who.send('GET', '/api/staff'))
      .json<{ staff: { userId: string; active: boolean; deactivatedAt: string | null }[] }>()
      .staff.find((m) => m.userId === id);
    expect(member).toMatchObject({ active: false });
    expect(member?.deactivatedAt).not.toBeNull();
  });

  it('refuses inviting someone already in the team, and keeps nothing when the email fails', async () => {
    const already = await admin.who.send('POST', '/api/invitations', {
      email: admin.email,
      roles: ['outreach'],
    });
    expect(already.statusCode).toBe(409);
    expect(already.json()).toEqual({ error: 'alreadyStaff' });

    const email = `fallida-${crypto.randomUUID()}@ejemplo.test`;
    failNext = true;
    const failed = await admin.who.send('POST', '/api/invitations', { email, roles: ['outreach'] });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: 'mail' });
    const listed = (await admin.who.send('GET', '/api/invitations')).json<{
      invitations: { email: string }[];
    }>();
    expect(listed.invitations.map((i) => i.email)).not.toContain(email);

    const invalid = await admin.who.send('POST', '/api/invitations', {
      email: 'no es un correo',
      roles: ['outreach'],
    });
    expect(invalid.json()).toEqual({ error: 'invalid', field: 'email' });
    const noRoles = await admin.who.send('POST', '/api/invitations', { email, roles: [] });
    expect(noRoles.json()).toEqual({ error: 'invalid', field: 'roles' });
  });

  it('revokes a pending invitation, then deletes it', async () => {
    const email = `revocada-${crypto.randomUUID()}@ejemplo.test`;
    const { id } = (
      await admin.who.send('POST', '/api/invitations', { email, roles: ['outreach'] })
    ).json<{
      id: string;
    }>();
    expect((await admin.who.send('DELETE', `/api/invitations/${id}`)).statusCode).toBe(404);
    expect((await admin.who.send('POST', `/api/invitations/${id}/revoke`)).statusCode).toBe(204);
    expect((await admin.who.send('POST', `/api/invitations/${id}/revoke`)).statusCode).toBe(404);
    expect((await admin.who.send('DELETE', `/api/invitations/${id}`)).statusCode).toBe(204);
  });

  it('refuses a write without the staff origin, and a field it does not take', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/staff/${admin.id}`,
      headers: {
        host: STAFF_HOST,
        origin: 'https://otro.example.test',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ displayName: 'Otro' }),
    });
    expect([401, 403]).toContain(response.statusCode);
    const extra = await admin.who.send('PATCH', `/api/staff/${admin.id}`, {
      email: 'x@ejemplo.test',
    });
    expect(extra.statusCode).toBe(400);
  });

  it('sends a password link to an enrolled member, at most one per 15 minutes', async () => {
    outbox.length = 0;
    const first = await admin.who.send('POST', `/api/staff/${admin.id}/password-link`);
    expect(first.statusCode).toBe(202);
    expect(outbox[0]?.text).toContain(`${STAFF_ORIGIN}/nueva-contrasena#token=`);
    const second = await admin.who.send('POST', `/api/staff/${admin.id}/password-link`);
    expect(second.statusCode).toBe(429);
  });

  it('shows the audit log to admins, newest first, without anyone’s email or name', async () => {
    const page = await admin.who.send('GET', '/api/audit?limit=5');
    expect(page.statusCode).toBe(200);
    const body = page.json<{
      entries: { table: string; channel: string | null }[];
      next: string | null;
    }>();
    expect(body.entries.length).toBeGreaterThan(0);
    expect(body.entries.length).toBeLessThanOrEqual(5);
    expect(body.next).not.toBeNull();
    expect(JSON.stringify(body.entries.map((e) => ({ ...e, actor: null })))).not.toMatch(
      /@ejemplo\.test|Persona nueva/u,
    );
    const older = await admin.who.send('GET', `/api/audit?limit=5&before=${body.next}`);
    expect(older.statusCode).toBe(200);
  });
});
