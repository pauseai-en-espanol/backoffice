import type { DB } from '@backoffice/db/generated/db';

import { sql, type Transaction } from 'kysely';

/** The roles a staff member can hold, as `app.staff_role` has them (ADR-0002). */
export const STAFF_ROLES = ['admin', 'onboarding', 'outreach'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);

/** The team, as every staff member sees it (Equipo). */
export interface StaffMember {
  userId: string;
  displayName: string;
  active: boolean;
  roles: StaffRole[];
  invitedBy: string | null;
  createdAt: string;
  deactivatedAt: string | null;
  /** Their own person record, if an admin linked it (PLAN M5, step 5); it grants nothing. */
  personId: string | null;
}

const instant = (column: string) => sql<string>`to_json(${sql.ref(column)})#>>'{}'`;

/** In STAFF_ROLES's order, so every list shows them alike. */
const ordered = (roles: readonly string[]): StaffRole[] =>
  STAFF_ROLES.filter((role) => roles.includes(role));

/** Every staff member RLS shows the actor (all of them, to any staff member), active first, then by name. */
export const listStaff = async (trx: Transaction<DB>): Promise<StaffMember[]> => {
  const rows = await trx
    .selectFrom('app.staff as s')
    .select([
      's.user_id',
      's.display_name',
      's.active',
      's.invited_by',
      's.person_id',
      instant('s.created_at').as('created_at'),
      sql<string | null>`to_json(s.deactivated_at)#>>'{}'`.as('deactivated_at'),
      sql<
        string[]
      >`coalesce((SELECT array_agg(r.role::text) FROM app.staff_roles r WHERE r.user_id = s.user_id),
                             '{}')`.as('roles'),
    ])
    .orderBy('s.active', 'desc')
    .orderBy(sql`lower(s.display_name)`)
    .execute();
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    active: row.active,
    roles: ordered(row.roles),
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    deactivatedAt: row.deactivated_at,
    personId: row.person_id,
  }));
};

export type PersonLinkResult = 'linked' | 'notFound' | 'personGone' | 'personTaken';

/**
 * Links a team account to its own person record, or unlinks it with null (PLAN M5, step 5), in the admin's
 * transaction (RLS lets only admins). Said in words first: an account that isn't there, a person no longer there
 * (merged or erased) or linked to another account; the database keeps the same rules if two admins race.
 */
export const linkPerson = async (
  trx: Transaction<DB>,
  userId: string,
  personId: string | null,
): Promise<PersonLinkResult> => {
  if (personId !== null) {
    const { rows } = await sql<{ live: boolean; taken: boolean }>`
      SELECT p.merged_into IS NULL AND p.anonymised_at IS NULL AS live,
             EXISTS (SELECT 1 FROM app.staff s WHERE s.person_id = p.id AND s.user_id <> ${userId}) AS taken
        FROM app.people p WHERE p.id = ${personId}`.execute(trx);
    const person = rows[0];
    if (!person?.live) {
      return 'personGone';
    }
    if (person.taken) {
      return 'personTaken';
    }
  }
  const linked = await trx
    .updateTable('app.staff')
    .set({ person_id: personId })
    .where('user_id', '=', userId)
    .returning('user_id')
    .executeTakeFirst();
  return linked ? 'linked' : 'notFound';
};

/** For each account without a person, the person who shares its sign-in email (admins only, the database's own). */
export const personSuggestions = async (
  trx: Transaction<DB>,
): Promise<{ userId: string; person: { id: string; name: string | null } }[]> => {
  const { rows } = await sql<{ user_id: string; person_id: string; name: string | null }>`
    SELECT s.user_id, s.person_id, coalesce(p.preferred_name, p.full_name) AS name
      FROM private.staff_person_suggestions() s JOIN app.people p ON p.id = s.person_id
     ORDER BY s.user_id, s.person_id`.execute(trx);
  return rows.map((row) => ({
    userId: row.user_id,
    person: { id: row.person_id, name: row.name },
  }));
};

/**
 * The actor as staff: their name and roles, if they are active staff. RLS shows staff rows only to active staff, so a
 * deactivated member, or an account that never was staff, gets undefined.
 */
export const staffSelf = async (
  trx: Transaction<DB>,
  userId: string,
): Promise<{ displayName: string; roles: StaffRole[] } | undefined> => {
  const row = await trx
    .selectFrom('app.staff as s')
    .select([
      's.display_name',
      sql<
        string[]
      >`coalesce((SELECT array_agg(r.role::text) FROM app.staff_roles r WHERE r.user_id = s.user_id),
                             '{}')`.as('roles'),
    ])
    .where('s.user_id', '=', userId)
    .where('s.active', '=', true)
    .executeTakeFirst();
  return row ? { displayName: row.display_name, roles: ordered(row.roles) } : undefined;
};

/** Whether the actor may administer (the database's own answer, as every policy asks it). */
export const isAdmin = async (trx: Transaction<DB>): Promise<boolean> => {
  const { rows } = await sql<{
    admin: boolean;
  }>`SELECT private.staff_can('admin') AS admin`.execute(trx);
  return rows[0]?.admin === true;
};

export interface StaffChange {
  displayName?: string;
  active?: boolean;
  roles?: StaffRole[];
}

export type StaffChangeResult = 'updated' | 'notFound' | 'lastAdmin';

/**
 * Renames, deactivates or reactivates a staff member, or sets their roles, in the admin's transaction (RLS lets only
 * admins). The last active admin is kept: refused here with 'lastAdmin', so the admin hears why, and by the database
 * (private.keep_an_admin) if two changes race.
 */
export const updateStaff = async (
  trx: Transaction<DB>,
  userId: string,
  change: StaffChange,
): Promise<StaffChangeResult> => {
  // Locked, so two admins changing the team take turns, and the count of admins below stays true until commit.
  const members = await trx
    .selectFrom('app.staff')
    .select(['user_id', 'active'])
    .forUpdate()
    .execute();
  const member = members.find((row) => row.user_id === userId);
  if (!member) {
    return 'notFound';
  }
  const admins = await trx
    .selectFrom('app.staff_roles')
    .select('user_id')
    .where('role', '=', 'admin')
    .execute();
  const activeAdmins = admins.filter((row) =>
    members.some((m) => m.user_id === row.user_id && m.active),
  );
  const isActiveAdmin = activeAdmins.some((row) => row.user_id === userId);
  const losesAdmin =
    isActiveAdmin &&
    (change.active === false || (change.roles !== undefined && !change.roles.includes('admin')));
  if (losesAdmin && activeAdmins.length <= 1) {
    return 'lastAdmin';
  }

  if (change.displayName !== undefined || change.active !== undefined) {
    await trx
      .updateTable('app.staff')
      .set({
        ...(change.displayName === undefined ? {} : { display_name: change.displayName }),
        ...(change.active === undefined ? {} : { active: change.active }),
      })
      .where('user_id', '=', userId)
      .execute();
  }
  if (change.roles !== undefined) {
    const held = (
      await trx.selectFrom('app.staff_roles').select('role').where('user_id', '=', userId).execute()
    ).map((row) => row.role);
    const removed = held.filter((role) => !change.roles?.includes(role));
    const added = change.roles.filter((role) => !held.includes(role));
    if (added.length > 0) {
      await trx
        .insertInto('app.staff_roles')
        .values(added.map((role) => ({ user_id: userId, role })))
        .execute();
    }
    if (removed.length > 0) {
      await trx
        .deleteFrom('app.staff_roles')
        .where('user_id', '=', userId)
        .where('role', 'in', removed)
        .execute();
    }
  }
  return 'updated';
};

/** A staff member's display name, as RLS shows it to staff; undefined for anyone else. */
export const displayNameOf = async (
  trx: Transaction<DB>,
  userId: string,
): Promise<string | undefined> =>
  (
    await trx
      .selectFrom('app.staff')
      .select('display_name')
      .where('user_id', '=', userId)
      .executeTakeFirst()
  )?.display_name;
