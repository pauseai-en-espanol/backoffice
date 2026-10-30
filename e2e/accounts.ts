import { hashPassword } from 'better-auth/crypto';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('../.env')) {
  process.loadEnvFile('../.env');
}

/** A fictional password, long enough for the 12-character rule. */
export const PASSWORD = 'una contraseña de ejemplo';

export type StaffRole = 'admin' | 'onboarding' | 'outreach' | 'tesoreria';

const pool = (name: string) => {
  const connectionString = process.env[name];
  if (!connectionString) {
    throw new Error(`${name} is not set (see .env.example)`);
  }
  return new pg.Pool({ connectionString, max: 1 });
};

/**
 * A new account as an invitation creates it (email verified, a password, no TOTP), straight into Better Auth's tables
 * as its own role, since sign-up is closed. Each test makes its own, so tests never share a sign-in. Test data is
 * fictional and stays in the local database (`pnpm db:reset` starts again).
 */
export const createAccount = async (name = `Persona de prueba ${randomInt(1e6)}`) => {
  const auth = pool('AUTH_DATABASE_URL');
  try {
    const email = `persona-${crypto.randomUUID()}@ejemplo.test`;
    const { rows } = await auth.query<{ id: string }>(
      `INSERT INTO auth.users (name, email, email_verified) VALUES ($1, $2, true) RETURNING id`,
      [name, email],
    );
    const id = rows[0]?.id ?? '';
    await auth.query(
      `INSERT INTO auth.accounts (account_id, provider_id, user_id, password, updated_at)
       VALUES ($1, 'credential', $2, $3, now())`,
      [id, id, await hashPassword(PASSWORD)],
    );
    return { id, email, name };
  } finally {
    await auth.end();
  }
};

/** Runs SQL as the database owner, as the owner runs what a runbook prints. */
export const asOwner = async <T extends object>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> => {
  const owner = pool('DATABASE_URL');
  try {
    return (await owner.query<T>(sql, values)).rows;
  } finally {
    await owner.end();
  }
};

/** Makes an account staff with these roles, as the first admin's runbook does (docs/runbooks/first-admin.md). */
export const makeStaff = async (account: { id: string; name: string }, roles: StaffRole[]) => {
  await asOwner('INSERT INTO app.staff (user_id, display_name) VALUES ($1, $2)', [
    account.id,
    account.name,
  ]);
  for (const role of roles) {
    await asOwner('INSERT INTO app.staff_roles (user_id, role) VALUES ($1, $2)', [
      account.id,
      role,
    ]);
  }
};

/**
 * A visitor address from the documentation range (RFC 3849), so each test is its own visitor at the gateway. Random in
 * its first 64 bits, which is what Better Auth's limiter counts an IPv6 address by.
 */
export const visitorAddress = () =>
  `2001:db8:${randomInt(0, 0x10000).toString(16)}:${randomInt(0, 0x10000).toString(16)}::1`;
