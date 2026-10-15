import type { Principal } from './harness.js';

import { INVITATION_IDS, type StaffRole, tokenHash, USERS } from '../fixtures.js';

/**
 * The access matrix (ADR-0002, test matrix). Every table and view in `app` has an entry, or the completeness test
 * fails. Each entry lists fixture rows, the operations tried on them, and who may perform each operation, by staff
 * role and channel; the cases (every principal × row × operation) are generated from it, and anyone a rule doesn't
 * name must be denied. Fixture names and addresses are fictional.
 */

/** Who may do something: the staff roles admitted through the staff app (`web`) and through the bot (`bot`). */
export interface Rule {
  web?: readonly StaffRole[];
  bot?: readonly StaffRole[];
}

const ANY_STAFF: readonly StaffRole[] = ['admin', 'onboarding', 'outreach'];
const ADMIN: Rule = { web: ['admin'] };
const NOBODY: Rule = {};

export interface Row {
  /** Names the row in test titles. */
  id: string;
  /** SQL condition that selects exactly this row. */
  where: string;
  select: Rule;
  /** An UPDATE's SET clause, and who may run it. */
  update?: { set: string; rule: Rule };
  delete?: Rule;
}

export interface Insert {
  id: string;
  /** The whole INSERT statement. */
  sql: string;
  rule: Rule;
}

export interface RelationSpec {
  rows: readonly Row[];
  inserts: readonly Insert[];
}

const user = (key: keyof typeof USERS): string => `'${USERS[key]}'`;

export const RELATIONS: Readonly<Record<string, RelationSpec>> = {
  'app.staff': {
    rows: [
      {
        id: 'an onboarder',
        where: `user_id = ${user('onboarder')}`,
        select: { web: ANY_STAFF },
        update: { set: "display_name = 'Nombre cambiado'", rule: ADMIN },
        delete: NOBODY,
      },
      {
        id: 'deactivating an onboarder',
        where: `user_id = ${user('onboarder')}`,
        select: { web: ANY_STAFF },
        update: { set: 'active = false', rule: ADMIN },
      },
    ],
    inserts: [
      {
        id: 'an account that is not staff',
        sql: `INSERT INTO app.staff (user_id, display_name) VALUES (${user('notStaff')}, 'Persona nueva')`,
        rule: NOBODY,
      },
    ],
  },
  'app.staff_roles': {
    rows: [
      {
        id: "an onboarder's role",
        where: `user_id = ${user('onboarder')} AND role = 'onboarding'`,
        select: { web: ANY_STAFF },
        update: { set: "role = 'outreach'", rule: NOBODY },
        delete: ADMIN,
      },
    ],
    inserts: [
      {
        id: 'a role for an outreacher',
        sql: `INSERT INTO app.staff_roles (user_id, role) VALUES (${user('outreacher')}, 'onboarding')`,
        rule: ADMIN,
      },
    ],
  },
  'app.invitations': {
    rows: [
      {
        id: 'a pending invitation',
        where: `id = '${INVITATION_IDS.pending}'`,
        select: ADMIN,
        update: { set: 'revoked_at = now()', rule: ADMIN },
        // Pending: kept until decided or expired.
        delete: NOBODY,
      },
      {
        id: 'a revoked invitation',
        where: `id = '${INVITATION_IDS.revoked}'`,
        select: ADMIN,
        update: { set: 'revoked_at = now()', rule: NOBODY },
        delete: ADMIN,
      },
    ],
    inserts: [
      {
        id: 'an invitation',
        sql: `INSERT INTO app.invitations (email, roles, token_hash, expires_at)
              VALUES ('nueva@ejemplo.test', '{outreach}', '${tokenHash('matriz')}', now() + interval '7 days')`,
        rule: ADMIN,
      },
    ],
  },
  'app.audit_log': {
    rows: [
      {
        id: "the onboarder's staff row being made",
        where: `table_name = 'staff' AND action = 'insert' AND row_id = '${USERS.onboarder}'`,
        select: ADMIN,
        update: { set: "action = 'cambiada'", rule: NOBODY },
        delete: NOBODY,
      },
    ],
    inserts: [
      {
        id: 'an entry',
        sql: `INSERT INTO app.audit_log (action, table_name, row_id) VALUES ('inventada', 'staff', 'x')`,
        rule: NOBODY,
      },
    ],
  },
};

const APP = 'pauseai_backoffice_app' as const;

/**
 * Every way a request can reach the database: the app role as each kind of staff member, at each level and channel,
 * or with no actor; and the other runtime roles, which reach no `app` table in M0.
 */
export const PRINCIPALS: readonly Principal[] = [
  { id: 'admin web', role: APP, userId: USERS.adminA, aal: 2, channel: 'web' },
  { id: 'admin web aal1', role: APP, userId: USERS.adminA, aal: 1, channel: 'web' },
  { id: 'admin bot', role: APP, userId: USERS.adminA, aal: 2, channel: 'bot' },
  { id: 'admin no channel', role: APP, userId: USERS.adminA, aal: 2 },
  { id: 'onboarding web', role: APP, userId: USERS.onboarder, aal: 2, channel: 'web' },
  { id: 'onboarding bot', role: APP, userId: USERS.onboarder, aal: 2, channel: 'bot' },
  { id: 'outreach web', role: APP, userId: USERS.outreacher, aal: 2, channel: 'web' },
  { id: 'onboarding and outreach web', role: APP, userId: USERS.both, aal: 2, channel: 'web' },
  { id: 'deactivated web', role: APP, userId: USERS.inactive, aal: 2, channel: 'web' },
  { id: 'no role web', role: APP, userId: USERS.noRole, aal: 2, channel: 'web' },
  { id: 'not staff web', role: APP, userId: USERS.notStaff, aal: 2, channel: 'web' },
  { id: 'no actor', role: APP },
  { id: 'auth', role: 'pauseai_backoffice_auth' },
  { id: 'ingest', role: 'pauseai_backoffice_ingest' },
  { id: 'public', role: 'pauseai_backoffice_public' },
];

/** The staff roles each fixture user holds while active (fixtures.ts). */
export const ROLES_OF: Readonly<Record<string, readonly StaffRole[]>> = {
  [USERS.adminA]: ['admin'],
  [USERS.onboarder]: ['onboarding'],
  [USERS.outreacher]: ['outreach'],
  [USERS.both]: ['onboarding', 'outreach'],
};
