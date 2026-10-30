import { createAuthPool } from '@backoffice/db/auth-pool';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAuth, SESSION_SECONDS, USER_NOT_VERIFIED } from '../src/auth/auth.js';
import { resetAuthenticator } from '../src/auth/reset-authenticator.js';
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

/** A new account, enrolled through the endpoints as the enrolment page does, and signed in with its code. */
const enrolled = async () => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const who = visitor();
  expect(
    (
      await who.send('POST', '/api/auth/sign-in/email', {
        email: created.email,
        password: PASSWORD,
      })
    ).statusCode,
  ).toBe(200);
  const enabled = await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD });
  const { totpURI } = enabled.json<{ totpURI: string }>();
  const verified = await who.send('POST', '/api/auth/two-factor/verify-totp', {
    code: totpCode(totpURI),
  });
  expect(verified.statusCode).toBe(200);
  return { ...created, who, cookie: String(verified.headers['set-cookie']) };
};

/** Adds a passkey on `device` to the signed-in `who`'s account, as Ajustes does. */
const addPasskey = async (
  who: Visitor,
  device: ReturnType<typeof createPasskeyDevice>,
  { verified = true, name = 'Portátil' } = {},
) => {
  const options = await who.send('GET', '/api/auth/passkey/generate-register-options');
  expect(options.statusCode).toBe(200);
  return who.send('POST', '/api/auth/passkey/verify-registration', {
    response: device.register(options.json(), { verified }),
    name,
  });
};

/** Signs `who` in with `device`'s passkey, as the sign-in page does. */
const signInWith = async (
  who: Visitor,
  device: ReturnType<typeof createPasskeyDevice>,
  { verified = true } = {},
) => {
  const options = await who.send('GET', '/api/auth/passkey/generate-authenticate-options');
  expect(options.statusCode).toBe(200);
  return who.send('POST', '/api/auth/passkey/verify-authentication', {
    response: device.authenticate(options.json(), { verified }),
  });
};

/** The account's sessions, newest first, as the database has them. */
const sessionsOf = async (userId: string) =>
  (
    await authPool.query<{ id: string; aal: number; ends_in: number; lasts: number }>(
      `SELECT id, aal, extract(epoch FROM expires_at - now())::int AS ends_in,
              extract(epoch FROM expires_at - created_at)::int AS lasts
         FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    )
  ).rows;

const HOURS = 60 * 60;

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
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
  await authPool.end();
});

describe('passkeys (PLAN D22)', () => {
  it('are added from a signed-in session, and then sign in alone, at the second factor’s level', async () => {
    const account = await enrolled();
    const device = createPasskeyDevice();
    const added = await addPasskey(account.who, device);
    expect(added.statusCode).toBe(200);

    // Ajustes lists what tells them apart, never a key.
    const listed = await account.who.send('GET', '/api/passkeys');
    expect(listed.json()).toEqual({
      passkeys: [
        {
          id: expect.any(String),
          name: 'Portátil',
          provider: null,
          synced: true,
          createdAt: expect.any(String),
        },
      ],
    });

    const elsewhere = visitor();
    const signedIn = await signInWith(elsewhere, device);
    expect(signedIn.statusCode).toBe(200);
    // The session's token stays in its cookie, out of the page's reach.
    expect(signedIn.body).not.toContain('token');
    expect(signedIn.json()).not.toHaveProperty('session');
    expect((await elsewhere.send('GET', '/api/session')).json()).toMatchObject({
      stage: 'signed-in',
      user: { id: account.id },
    });
    expect((await sessionsOf(account.id))[0]?.aal).toBe(2);
  });

  it('count only when the device checked who holds it: one that didn’t is neither added nor let in', async () => {
    const account = await enrolled();
    const unverified = await addPasskey(account.who, createPasskeyDevice(), { verified: false });
    expect(unverified.statusCode).toBe(401);
    expect(unverified.json()).toMatchObject({ code: USER_NOT_VERIFIED });
    expect((await account.who.send('GET', '/api/passkeys')).json()).toEqual({ passkeys: [] });

    const device = createPasskeyDevice();
    expect((await addPasskey(account.who, device)).statusCode).toBe(200);
    const before = (await sessionsOf(account.id)).length;
    const elsewhere = visitor();
    const refused = await signInWith(elsewhere, device, { verified: false });
    expect(refused.statusCode).toBe(401);
    expect(refused.json()).toMatchObject({ code: USER_NOT_VERIFIED });
    expect(await sessionsOf(account.id)).toHaveLength(before);
    expect((await elsewhere.send('GET', '/api/session')).statusCode).toBe(401);
  });

  it('are added, listed and removed only by a signed-in session, never one a password alone opened', async () => {
    const stranger = visitor();
    expect(
      (await stranger.send('GET', '/api/auth/passkey/generate-register-options')).statusCode,
    ).toBe(401);
    expect((await stranger.send('GET', '/api/passkeys')).statusCode).toBe(401);
    expect(
      (await stranger.send('POST', '/api/auth/passkey/delete-passkey', { id: 'cualquiera' }))
        .statusCode,
    ).toBe(401);

    // An account still to enrol has a session after its password, which reaches the enrolment and nothing else.
    const created = await createAccount(authPool);
    accounts.push(created.id);
    const enrolling = visitor();
    await enrolling.send('POST', '/api/auth/sign-in/email', {
      email: created.email,
      password: PASSWORD,
    });
    expect((await enrolling.send('GET', '/api/session')).json()).toMatchObject({ stage: 'enrol' });
    expect(
      (await enrolling.send('GET', '/api/auth/passkey/generate-register-options')).statusCode,
    ).toBe(401);
    expect(
      (
        await enrolling.send('POST', '/api/auth/passkey/verify-registration', {
          response: {},
        })
      ).statusCode,
    ).toBe(401);
    // And Better Auth's other passkey endpoints stay out of reach.
    for (const path of ['/passkey/list-user-passkeys', '/passkey/update-passkey']) {
      expect((await enrolling.send('GET', `/api/auth${path}`)).statusCode).toBe(404);
      expect((await enrolling.send('POST', `/api/auth${path}`, {})).statusCode).toBe(404);
    }
  });

  it('are neither listed nor removed by a session a password opened before its account enrolled elsewhere', async () => {
    const created = await createAccount(authPool);
    accounts.push(created.id);
    const early = visitor();
    await early.send('POST', '/api/auth/sign-in/email', {
      email: created.email,
      password: PASSWORD,
    });
    const who = visitor();
    await who.send('POST', '/api/auth/sign-in/email', { email: created.email, password: PASSWORD });
    const enabled = await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD });
    await who.send('POST', '/api/auth/two-factor/verify-totp', {
      code: totpCode(enabled.json<{ totpURI: string }>().totpURI),
    });
    expect((await addPasskey(who, createPasskeyDevice())).statusCode).toBe(200);
    const { passkeys } = (await who.send('GET', '/api/passkeys')).json<{
      passkeys: { id: string }[];
    }>();
    expect(passkeys).toHaveLength(1);

    // The early session is still there, at aal1 for life: Better Auth alone would let it do both.
    expect((await early.send('GET', '/api/session')).json()).toEqual({ stage: 'signed-out' });
    expect((await early.send('GET', '/api/passkeys')).statusCode).toBe(401);
    expect(
      (await early.send('POST', '/api/auth/passkey/delete-passkey', { id: passkeys[0]?.id }))
        .statusCode,
    ).toBe(401);
    expect((await who.send('GET', '/api/passkeys')).json()).toEqual({ passkeys });
  });

  it('are added only within 12 hours of a second factor (PLAN D23)', async () => {
    const account = await enrolled();
    const [session] = await sessionsOf(account.id);
    await authPool.query(
      `UPDATE sessions SET created_at = now() - interval '13 hours', expires_at = now() + interval '1 hour'
        WHERE id = $1`,
      [session?.id],
    );
    const options = await account.who.send('GET', '/api/auth/passkey/generate-register-options');
    expect(options.statusCode).toBe(403);
    expect(options.json()).toEqual({ error: 'stepUp' });
  });

  it('once removed, or after the owner’s reset of a lost authenticator, let nobody in', async () => {
    const account = await enrolled();
    const kept = createPasskeyDevice();
    const removed = createPasskeyDevice();
    expect((await addPasskey(account.who, kept, { name: 'Teléfono' })).statusCode).toBe(200);
    expect((await addPasskey(account.who, removed, { name: 'Portátil' })).statusCode).toBe(200);
    const { passkeys } = (await account.who.send('GET', '/api/passkeys')).json<{
      passkeys: { id: string; name: string }[];
    }>();
    const laptop = passkeys.find((passkey) => passkey.name === 'Portátil');
    expect(
      (await account.who.send('POST', '/api/auth/passkey/delete-passkey', { id: laptop?.id }))
        .statusCode,
    ).toBe(200);
    expect((await signInWith(visitor(), removed)).statusCode).toBe(401);
    expect((await signInWith(visitor(), kept)).statusCode).toBe(200);

    expect(await resetAuthenticator(authPool, account.id)).toMatchObject({ kind: 'reset' });
    expect(
      (await authPool.query('SELECT 1 FROM passkeys WHERE user_id = $1', [account.id])).rowCount,
    ).toBe(0);
    expect((await signInWith(visitor(), kept)).statusCode).toBe(401);
  });
});

describe('sessions (PLAN D22)', () => {
  it('start with 48 hours, move on as they are used, and end a week after sign-in at the latest', async () => {
    const account = await enrolled();
    const [session] = await sessionsOf(account.id);
    expect(session?.ends_in).toBeGreaterThan(48 * HOURS - 60);
    expect(session?.ends_in).toBeLessThanOrEqual(48 * HOURS);

    // The cookie lasts the week; the row's end decides.
    expect(account.cookie).toContain(`Max-Age=${SESSION_SECONDS}`);

    // Used an hour before it would end: it lives 48 hours from now again.
    await authPool.query(
      `UPDATE sessions SET expires_at = now() + interval '1 hour' WHERE id = $1`,
      [session?.id],
    );
    expect((await account.who.send('GET', '/api/session')).statusCode).toBe(200);
    const moved = (await sessionsOf(account.id)).find((row) => row.id === session?.id);
    expect(moved?.ends_in).toBeGreaterThan(48 * HOURS - 60);

    // Near the end of its week, use moves it only to the week's end.
    await authPool.query(
      `UPDATE sessions SET created_at = now() - interval '6 days 23 hours', expires_at = now() + interval '5 minutes'
        WHERE id = $1`,
      [session?.id],
    );
    expect((await account.who.send('GET', '/api/session')).statusCode).toBe(200);
    const capped = (await sessionsOf(account.id)).find((row) => row.id === session?.id);
    expect(capped?.lasts).toBe(SESSION_SECONDS);

    // Unused past its end, it is over.
    await authPool.query(
      `UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [session?.id],
    );
    expect((await account.who.send('GET', '/api/session')).json()).toEqual({ stage: 'signed-out' });
  });
});
