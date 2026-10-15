import type pg from 'pg';

import { createHash } from 'node:crypto';

/**
 * Fictional staff and invitations for the database tests (the RLS matrix, the data rules) and the API's database
 * tests. Names and addresses are obviously made up (CLAUDE.md); ids are fixed so tests can name them.
 */

const id = (n: number): string =>
  `0190f8c4-0000-7000-8000-0000000001${n.toString().padStart(2, '0')}`;

export const USERS = {
  adminA: id(1),
  adminB: id(2),
  onboarder: id(3),
  outreacher: id(4),
  both: id(5),
  inactive: id(6),
  noRole: id(7),
  /** An account that isn't staff. */
  notStaff: id(8),
  /** An account with a verified email and a pending invitation for it. */
  newcomer: id(9),
} as const;

export type StaffRole = 'admin' | 'onboarding' | 'outreach';
export type UserKey = keyof typeof USERS;

/** Each staff member's roles; `inactive` is deactivated. `notStaff` and `newcomer` aren't staff at all. */
export const STAFF: Readonly<Partial<Record<UserKey, readonly StaffRole[]>>> = {
  adminA: ['admin'],
  adminB: ['admin', 'onboarding'],
  onboarder: ['onboarding'],
  outreacher: ['outreach'],
  both: ['onboarding', 'outreach'],
  inactive: ['onboarding'],
  noRole: [],
};

export const INACTIVE: readonly UserKey[] = ['inactive'];

export const emailOf = (user: UserKey): string => `${user.toLowerCase()}@ejemplo.test`;

export const INVITATION_IDS = {
  pending: '0190f8c4-0000-7000-8000-0000000002a1',
  revoked: '0190f8c4-0000-7000-8000-0000000002a2',
  expired: '0190f8c4-0000-7000-8000-0000000002a3',
} as const;

/** The raw tokens of the fixture invitations; only their SHA-256 is stored. */
export const INVITATION_TOKENS = {
  pending: 'token-de-prueba-pendiente',
  revoked: 'token-de-prueba-revocado',
  expired: 'token-de-prueba-caducado',
} as const;

export const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Loads the fixtures as superuser, through the same triggers the app runs. */
export const loadFixtures = async (client: pg.Client): Promise<void> => {
  await client.query('BEGIN');
  try {
    for (const [key, userId] of Object.entries(USERS) as [UserKey, string][]) {
      await client.query(
        `INSERT INTO auth.users (id, name, email, email_verified, two_factor_enabled)
         VALUES ($1, $2, $3, true, true)`,
        [userId, `Persona ${key}`, emailOf(key)],
      );
    }
    for (const [key, roles] of Object.entries(STAFF) as [UserKey, StaffRole[]][]) {
      await client.query('INSERT INTO app.staff (user_id, display_name) VALUES ($1, $2)', [
        USERS[key],
        `Persona ${key}`,
      ]);
      for (const role of roles) {
        await client.query('INSERT INTO app.staff_roles (user_id, role) VALUES ($1, $2)', [
          USERS[key],
          role,
        ]);
      }
    }
    for (const key of INACTIVE) {
      await client.query('UPDATE app.staff SET active = false WHERE user_id = $1', [USERS[key]]);
    }

    // Invitations are stamped with their maker: adminA, through the staff app.
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.aal', '2', true),
              set_config('app.channel', 'web', true)`,
      [USERS.adminA],
    );
    await client.query(
      `INSERT INTO app.invitations (id, email, roles, token_hash, expires_at)
       VALUES ($1, $2, '{onboarding}', $3, now() + interval '7 days'),
              ($4, 'revocada@ejemplo.test', '{outreach}', $5, now() + interval '7 days')`,
      [
        INVITATION_IDS.pending,
        emailOf('newcomer'),
        tokenHash(INVITATION_TOKENS.pending),
        INVITATION_IDS.revoked,
        tokenHash(INVITATION_TOKENS.revoked),
      ],
    );
    await client.query('UPDATE app.invitations SET revoked_at = now() WHERE id = $1', [
      INVITATION_IDS.revoked,
    ]);
    // An expired one can only be made in the past, past the stamp trigger: as superuser, with triggers off.
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query(
      `INSERT INTO app.invitations (id, email, roles, token_hash, expires_at, created_by, created_at)
       VALUES ($1, 'caducada@ejemplo.test', '{onboarding}', $2, now() - interval '1 day', $3,
               now() - interval '8 days')`,
      [INVITATION_IDS.expired, tokenHash(INVITATION_TOKENS.expired), USERS.adminA],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
