import type { Principal } from './harness.js';

import {
  ANA_PHONE,
  EXPORT_ID,
  IMPORT_ID,
  INTAKE_ID,
  INVITATION_IDS,
  PEOPLE,
  type StaffRole,
  tokenHash,
  USERS,
} from '../fixtures.js';

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
/** Onboarding staff and admins, through the staff app; never the bot, which has its own functions (ADR-0004). */
const ONBOARDING: Rule = { web: ['admin', 'onboarding'] };
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
const ana = `'${PEOPLE.ana}'`;

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
  'app.settings': {
    rows: [
      {
        id: 'the settings',
        where: 'id',
        select: { web: ANY_STAFF },
        update: { set: 'follow_up_days = 6', rule: ADMIN },
        delete: NOBODY,
      },
    ],
    inserts: [
      { id: 'another row', sql: 'INSERT INTO app.settings (id) VALUES (false)', rule: NOBODY },
    ],
  },
  'app.people': {
    rows: [
      {
        id: 'a person',
        where: `id = ${ana}`,
        select: ONBOARDING,
        update: { set: "province = 'Provincia de ejemplo'", rule: ONBOARDING },
        delete: NOBODY,
      },
      {
        id: 'a tombstone',
        where: `id = '${PEOPLE.anaDuplicate}'`,
        select: ONBOARDING,
        update: { set: "province = 'Provincia de ejemplo'", rule: NOBODY },
      },
    ],
    inserts: [
      {
        id: 'a person, not through intake',
        sql: "INSERT INTO app.people (full_name) VALUES ('Persona directa')",
        rule: NOBODY,
      },
    ],
  },
  'app.identities': {
    rows: [
      {
        id: "a person's phone",
        where: `value = '${ANA_PHONE}'`,
        select: ONBOARDING,
        update: { set: 'verified = true', rule: ONBOARDING },
        delete: ONBOARDING,
      },
    ],
    inserts: [
      {
        id: 'an email added by hand',
        sql: `INSERT INTO app.identities (person_id, kind, value, source)
              VALUES (${ana}, 'email', 'matriz@ejemplo.test', 'manual')`,
        rule: ONBOARDING,
      },
      {
        id: 'an identity claiming to come from Airtable',
        sql: `INSERT INTO app.identities (person_id, kind, value, source)
              VALUES (${ana}, 'airtable', 'recMatrizEjemplo1', 'airtable')`,
        rule: NOBODY,
      },
    ],
  },
  'app.person_sources': {
    rows: [
      {
        id: "a person's source",
        where: `person_id = ${ana} AND source = 'manual'`,
        select: ONBOARDING,
        update: { set: "source = 'csv'", rule: NOBODY },
        delete: NOBODY,
      },
    ],
    inserts: [
      {
        id: 'a source',
        sql: `INSERT INTO app.person_sources (person_id, source) VALUES (${ana}, 'csv')`,
        rule: NOBODY,
      },
    ],
  },
  'app.community_presence': {
    rows: [
      {
        id: "a person's open period",
        where: `person_id = ${ana}`,
        select: ONBOARDING,
        update: { set: "chat = 'Otro chat'", rule: ONBOARDING },
        delete: NOBODY,
      },
    ],
    inserts: [
      {
        id: 'a closed period',
        sql: `INSERT INTO app.community_presence (person_id, joined_on, left_on)
              VALUES (${ana}, current_date - 30, current_date - 20)`,
        rule: ONBOARDING,
      },
    ],
  },
  'app.person_events': {
    rows: [
      {
        id: "a person's first event",
        where: `person_id = ${ana} AND kind = 'created'`,
        select: ONBOARDING,
        update: { set: "body = 'cambiado'", rule: NOBODY },
        delete: NOBODY,
      },
    ],
    inserts: [
      {
        id: 'a note',
        sql: `INSERT INTO app.person_events (person_id, kind, body) VALUES (${ana}, 'note', 'Nota de ejemplo')`,
        rule: ONBOARDING,
      },
      {
        id: 'a stage change, by hand',
        sql: `INSERT INTO app.person_events (person_id, kind, data)
              VALUES (${ana}, 'stage_changed', '{"from": "new", "to": "active"}')`,
        rule: NOBODY,
      },
    ],
  },
  'app.imports': {
    rows: [
      {
        id: 'an import',
        where: `id = '${IMPORT_ID}'`,
        select: ONBOARDING,
        update: { set: "counts = '{}'", rule: NOBODY },
        delete: NOBODY,
      },
    ],
    inserts: [
      { id: 'an import', sql: "INSERT INTO app.imports (kind) VALUES ('csv')", rule: NOBODY },
    ],
  },
  'app.intake_records': {
    rows: [
      {
        id: 'an intake record',
        where: `id = '${INTAKE_ID}'`,
        select: ONBOARDING,
        update: { set: "status = 'discarded'", rule: NOBODY },
        delete: NOBODY,
      },
    ],
    inserts: [
      {
        id: 'an intake record, not through submit_intake',
        sql: `INSERT INTO app.intake_records (source, external_id, payload)
              VALUES ('manual', 'directo', '{"name": "Persona directa"}')`,
        rule: NOBODY,
      },
    ],
  },
  'app.exports': {
    rows: [
      {
        id: 'an export',
        where: `id = '${EXPORT_ID}'`,
        select: ADMIN,
        update: { set: 'row_count = 2', rule: NOBODY },
        delete: NOBODY,
      },
    ],
    inserts: [
      {
        id: 'an export',
        sql: "INSERT INTO app.exports (kind, row_count) VALUES ('people_csv', 3)",
        rule: ADMIN,
      },
    ],
  },
  'app.people_attention': {
    rows: [{ id: "a person's reasons", where: `person_id = ${ana}`, select: ONBOARDING }],
    inserts: [],
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
