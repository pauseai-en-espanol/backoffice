import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { STEP_UP_ATTEMPTS } from '../src/auth/step-up.js';
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
import { createPasskeyDevice } from './passkey-fixtures.js';
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

type Visitor = ReturnType<typeof browser>;

const visitor = (): Visitor => {
  const address = testAddress();
  addresses.push(address);
  return browser(app, address);
};

/** Another address for the next attempt, so Better Auth's limit per address (3 codes in 10 seconds) stays out of it. */
const elsewhere = () => {
  const address = testAddress();
  addresses.push(address);
  return { 'x-forwarded-for': address };
};

/** An admin, enrolled and signed in with a code, and the authenticator's key to make more. */
const signedInAdmin = async () => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const who = visitor();
  await who.send('POST', '/api/auth/sign-in/email', { email: created.email, password: PASSWORD });
  const enabled = await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD });
  const { totpURI } = enabled.json<{ totpURI: string }>();
  expect(
    (await who.send('POST', '/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) }))
      .statusCode,
  ).toBe(200);
  await superuser.query(
    `INSERT INTO app.staff (user_id, display_name) VALUES ($1, 'Persona de ejemplo')`,
    [created.id],
  );
  await superuser.query(`INSERT INTO app.staff_roles (user_id, role) VALUES ($1, 'admin')`, [
    created.id,
  ]);
  return { ...created, who, totpURI };
};

/** The account's one session signed in 13 hours ago: its second factor is no longer recent. */
const ageSession = async (userId: string) => {
  await authPool.query(
    `UPDATE sessions SET created_at = now() - interval '13 hours', expires_at = now() + interval '1 hour'
      WHERE user_id = $1`,
    [userId],
  );
  await authPool.query(
    'DELETE FROM session_step_ups WHERE session_id IN (SELECT id FROM sessions WHERE user_id = $1)',
    [userId],
  );
};

const ID = '0190f8c4-0000-7000-8000-00000000ffff';

/** The riskiest actions (PLAN D23), as the staff app calls them. */
const RISKIEST: readonly [method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string][] = [
  // Equipo.
  ['PATCH', `/api/staff/${ID}`],
  ['POST', `/api/staff/${ID}/private-records`],
  ['PUT', `/api/staff/${ID}/person`],
  ['POST', `/api/staff/${ID}/password-link`],
  ['POST', '/api/invitations'],
  ['POST', `/api/invitations/${ID}/revoke`],
  ['DELETE', `/api/invitations/${ID}`],
  // The audit log.
  ['GET', '/api/audit'],
  // What admins change in Ajustes.
  ['PATCH', '/api/settings'],
  ['PUT', '/api/airtable/link'],
  ['DELETE', '/api/airtable/link'],
  ['PATCH', '/api/airtable'],
  ['POST', '/api/arrival-channels'],
  ['PUT', '/api/arrival-channels/order'],
  ['PATCH', `/api/arrival-channels/${ID}`],
  ['POST', '/api/census/options'],
  ['PUT', '/api/census/options/order'],
  ['PATCH', `/api/census/options/${ID}`],
  // Exports, the rights lookup and erasure.
  ['GET', '/api/export/people.csv'],
  ['GET', `/api/people/${ID}/export`],
  ['POST', `/api/people/${ID}/erase`],
  ['GET', '/api/outreach/rights?q=persona'],
  ['GET', `/api/outreach/contacts/${ID}/export`],
  ['POST', `/api/outreach/contacts/${ID}/erase`],
  // The books (ADR-0006): closing a year, and their exports.
  ['POST', '/api/accounting/years/2025/close'],
  ['GET', '/api/accounting/exports/journal.csv'],
];

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
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

describe('confirming it’s you again (PLAN D23)', () => {
  it('stops each of the riskiest actions once the second factor is over 12 hours old, and nothing else', async () => {
    const admin = await signedInAdmin();
    expect((await admin.who.send('GET', '/api/session')).json()).toMatchObject({
      recentSecondFactor: true,
    });
    await ageSession(admin.id);
    expect((await admin.who.send('GET', '/api/session')).json()).toMatchObject({
      stage: 'signed-in',
      recentSecondFactor: false,
    });
    for (const [method, path] of RISKIEST) {
      const answer = await admin.who.send(method, path, method === 'GET' ? undefined : {});
      expect({ method, path, status: answer.statusCode, body: answer.json() }).toEqual({
        method,
        path,
        status: 403,
        body: { error: 'stepUp' },
      });
    }
    // Everyday work goes on.
    expect((await admin.who.send('GET', '/api/staff')).statusCode).toBe(200);
    expect((await admin.who.send('GET', '/api/people')).statusCode).toBe(200);
    expect((await admin.who.send('GET', '/api/settings')).statusCode).toBe(200);
  });

  it('lets them run again for 12 hours after a code typed again', async () => {
    const admin = await signedInAdmin();
    await ageSession(admin.id);
    expect((await admin.who.send('GET', '/api/audit')).statusCode).toBe(403);
    const confirmed = await admin.who.send(
      'POST',
      '/api/step-up',
      { code: totpCode(admin.totpURI) },
      elsewhere(),
    );
    expect(confirmed.statusCode).toBe(204);
    expect((await admin.who.send('GET', '/api/session')).json()).toMatchObject({
      recentSecondFactor: true,
    });
    expect((await admin.who.send('GET', '/api/audit')).statusCode).toBe(200);
    // The confirmation lasts 12 hours too.
    await authPool.query(
      `UPDATE session_step_ups SET second_factor_at = now() - interval '12 hours 1 minute'`,
    );
    expect((await admin.who.send('GET', '/api/audit')).statusCode).toBe(403);
  });

  it(`ends the session at the ${STEP_UP_ATTEMPTS}th wrong code, and counts attempts sent at once`, async () => {
    const admin = await signedInAdmin();
    await ageSession(admin.id);
    const wrong = String((Number(totpCode(admin.totpURI)) + 500_000) % 1_000_000).padStart(6, '0');
    for (let attempt = 1; attempt < STEP_UP_ATTEMPTS; attempt += 1) {
      const answer = await admin.who.send('POST', '/api/step-up', { code: wrong }, elsewhere());
      expect(answer.json()).toEqual({ error: 'invalidCode' });
    }
    const last = await admin.who.send('POST', '/api/step-up', { code: wrong }, elsewhere());
    expect(last.statusCode).toBe(401);
    expect(last.json()).toEqual({ error: 'tooManyCodes' });
    expect((await admin.who.send('GET', '/api/session')).statusCode).toBe(401);

    // Sent all at once, they still count one each: never more than the budget is checked.
    const other = await signedInAdmin();
    await ageSession(other.id);
    const answers = await Promise.all(
      Array.from({ length: STEP_UP_ATTEMPTS + 3 }, () =>
        other.who.send('POST', '/api/step-up', { code: wrong }, elsewhere()),
      ),
    );
    const checked = answers.filter(
      (answer) => answer.json<{ error: string }>().error === 'invalidCode',
    );
    expect(checked.length).toBeLessThanOrEqual(STEP_UP_ATTEMPTS);
    expect((await other.who.send('GET', '/api/session')).statusCode).toBe(401);
  });

  it('asks a code only from a signed-in session on the staff origin', async () => {
    const admin = await signedInAdmin();
    expect(
      (await visitor().send('POST', '/api/step-up', { code: totpCode(admin.totpURI) })).statusCode,
    ).toBe(401);
    expect(
      (
        await admin.who.send(
          'POST',
          '/api/step-up',
          { code: totpCode(admin.totpURI) },
          { origin: 'https://otro.ejemplo.test' },
        )
      ).statusCode,
    ).toBe(403);
  });

  it('never lets a signed-in session check codes through Better Auth, where nothing counts them', async () => {
    const admin = await signedInAdmin();
    for (const path of [
      '/api/auth/two-factor/verify-totp',
      '/api/auth/two-factor/verify-backup-code',
    ]) {
      expect((await admin.who.send('POST', path, { code: '000000' })).statusCode).toBe(403);
    }
  });

  it('takes a passkey instead, which signs in afresh', async () => {
    const admin = await signedInAdmin();
    const device = createPasskeyDevice();
    const options = await admin.who.send('GET', '/api/auth/passkey/generate-register-options');
    expect(
      (
        await admin.who.send('POST', '/api/auth/passkey/verify-registration', {
          response: device.register(options.json()),
        })
      ).statusCode,
    ).toBe(200);
    await ageSession(admin.id);
    // Adding another is one of the riskiest actions too.
    expect(
      (await admin.who.send('GET', '/api/auth/passkey/generate-register-options')).json(),
    ).toEqual({ error: 'stepUp' });
    const challenge = await admin.who.send(
      'GET',
      '/api/auth/passkey/generate-authenticate-options',
    );
    expect(
      (
        await admin.who.send('POST', '/api/auth/passkey/verify-authentication', {
          response: device.authenticate(challenge.json()),
        })
      ).statusCode,
    ).toBe(200);
    expect((await admin.who.send('GET', '/api/session')).json()).toMatchObject({
      recentSecondFactor: true,
    });
    expect((await admin.who.send('GET', '/api/audit')).statusCode).toBe(200);
  });
});
