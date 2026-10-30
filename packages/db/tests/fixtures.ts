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
  /** Keeps the books (ADR-0006): tesorería alone. */
  treasurer: id(10),
} as const;

export type StaffRole = 'admin' | 'onboarding' | 'outreach' | 'tesoreria';
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
  treasurer: ['tesoreria'],
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

/** People for the matrix and the onboarding rules: fictional names, numbers from Spain's fictional-looking ranges. */
export const PEOPLE = {
  /** New, owned by the onboarder, with a phone, an open presence and an intake record. */
  ana: '0190f8c4-0000-7000-8000-0000000003a1',
  /** A tombstone, merged into ana. */
  anaDuplicate: '0190f8c4-0000-7000-8000-0000000003a2',
} as const;

export const ANA_PHONE = '+34600000001';
export const IMPORT_ID = '0190f8c4-0000-7000-8000-0000000004a1';
export const INTAKE_ID = '0190f8c4-0000-7000-8000-0000000004b1';
export const EXPORT_ID = '0190f8c4-0000-7000-8000-0000000004c1';
export const CENSUS_LINK_ID = '0190f8c4-0000-7000-8000-0000000004d1';
/** Ana's personal census link's token; only its hash is stored. */
export const CENSUS_TOKEN = 'token-de-censo-de-ana';
/** A welcome message the team wrote (PLAN M5, Mensajes), at version 1, with its version for someone without a name. */
export const MESSAGE_TEMPLATE_ID = '0190f8c4-0000-7000-8000-0000000004e1';
/** The onboarder's own welcome ("Solo yo", PLAN R71), which only they see. */
export const OWN_MESSAGE_TEMPLATE_ID = '0190f8c4-0000-7000-8000-0000000004e2';

/** Outreach (M3): an organisation, its contacts, and a campaign with a template, an anchor and two targets. */
export const OUTREACH = {
  organisation: '0190f8c4-0000-7000-8000-0000000005a1',
  /** Berta, a person at the organisation, owned by the outreacher; pending in the campaign. */
  berta: '0190f8c4-0000-7000-8000-0000000005b1',
  /** The organisation's own inbox, with no person; already sent to. */
  inbox: '0190f8c4-0000-7000-8000-0000000005b2',
  /** Suggested by a tool, still to be reviewed; in no campaign. */
  unreviewed: '0190f8c4-0000-7000-8000-0000000005b3',
  campaign: '0190f8c4-0000-7000-8000-0000000005c1',
  pendingTarget: '0190f8c4-0000-7000-8000-0000000005d1',
  sentTarget: '0190f8c4-0000-7000-8000-0000000005d2',
  /** A note on the organisation's timeline (PLAN M5, step 6). */
  organisationNote: '0190f8c4-0000-7000-8000-0000000005e1',
  /** The outreacher's own ("Solo yo", PLAN M5, step 6): an organisation, a contact there, and their notes. */
  privateOrganisation: '0190f8c4-0000-7000-8000-0000000005a2',
  privateContact: '0190f8c4-0000-7000-8000-0000000005b4',
  /** A private note on Berta, a team contact; and one on the team organisation. */
  privateNote: '0190f8c4-0000-7000-8000-0000000005f1',
  privateOrganisationNote: '0190f8c4-0000-7000-8000-0000000005e2',
} as const;

/**
 * The books (M6, ADR-0006), by year relative to today so no test depends on the date: the year before last, closed
 * (an income posted in it, its closing and last year's opening entry made by the database); last year, open with
 * nothing but that opening entry, so it can be closed; this year, open, with two drafts and a posted income.
 */
export const ACCOUNTING = {
  /** Tesorería's bank account, 5720001, under the seeded 572. */
  bank: '0190f8c4-0000-7000-8000-0000000006a1',
  /** A donor, with a tax ID and a province (D24), who gave the posted income. */
  donor: '0190f8c4-0000-7000-8000-0000000006b1',
  /** An organisation nothing names yet. */
  supplier: '0190f8c4-0000-7000-8000-0000000006b2',
  project: '0190f8c4-0000-7000-8000-0000000006c1',
  /** Posted in the year before last, which is closed. */
  closedEntry: '0190f8c4-0000-7000-8000-0000000006d1',
  /** This year's: a draft expense, balanced, without receipts. */
  draft: '0190f8c4-0000-7000-8000-0000000006d2',
  /** This year's: a draft with a receipt. */
  draftWithReceipt: '0190f8c4-0000-7000-8000-0000000006d3',
  /** This year's: a posted income, from the donor, for the project, with a receipt. */
  posted: '0190f8c4-0000-7000-8000-0000000006d4',
  draftLine: '0190f8c4-0000-7000-8000-0000000006e1',
  postedLine: '0190f8c4-0000-7000-8000-0000000006e2',
  receipt: '0190f8c4-0000-7000-8000-0000000006f1',
  draftReceipt: '0190f8c4-0000-7000-8000-0000000006f2',
} as const;

/** A fictional IBAN (the bank and branch codes are zeros) whose check digits are right. */
export const EXAMPLE_IBAN = 'ES5500000000000000000001';

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
    await client.query(
      `INSERT INTO app.people (id, full_name, stage, owner_id) VALUES ($1, 'Ana Ejemplo Uno', 'new', $3),
                                                                      ($2, 'Ana Ejemplo', 'new', NULL)`,
      [PEOPLE.ana, PEOPLE.anaDuplicate, USERS.onboarder],
    );
    await client.query(
      `INSERT INTO app.identities (person_id, kind, value, source) VALUES ($1, 'phone', $2, 'manual')`,
      [PEOPLE.ana, ANA_PHONE],
    );
    await client.query(`INSERT INTO app.person_sources (person_id, source) VALUES ($1, 'manual')`, [
      PEOPLE.ana,
    ]);
    await client.query(
      `INSERT INTO app.community_presence (person_id, joined_on, chat) VALUES ($1, current_date, 'Chat de ejemplo')`,
      [PEOPLE.ana],
    );
    await client.query(`UPDATE app.people SET merged_into = $1 WHERE id = $2`, [
      PEOPLE.ana,
      PEOPLE.anaDuplicate,
    ]);
    await client.query(`INSERT INTO app.imports (id, kind, counts) VALUES ($1, 'csv', '{}')`, [
      IMPORT_ID,
    ]);
    await client.query(
      `INSERT INTO app.intake_records (id, source, external_id, payload, status, person_id, import_id)
       VALUES ($1, 'csv', 'fila-de-ejemplo', '{"name": "Ana Ejemplo Uno"}', 'attached', $2, $3)`,
      [INTAKE_ID, PEOPLE.ana, IMPORT_ID],
    );
    await client.query(
      `INSERT INTO app.exports (id, kind, row_count) VALUES ($1, 'people_csv', 1)`,
      [EXPORT_ID],
    );
    await client.query(
      `INSERT INTO app.person_options (person_id, option_id)
       SELECT $1, id FROM app.census_options WHERE kind = 'skill' AND label = 'Diseño'`,
      [PEOPLE.ana],
    );
    await client.query(
      `INSERT INTO app.consents (person_id, kind, granted, wording_version, source)
       VALUES ($1, 'privacy', true, 'v1', 'census')`,
      [PEOPLE.ana],
    );
    await client.query(
      `INSERT INTO app.census_links (id, person_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + interval '30 days')`,
      [CENSUS_LINK_ID, PEOPLE.ana, tokenHash(CENSUS_TOKEN)],
    );
    await client.query(
      `INSERT INTO app.message_templates (id, purpose, title, body, body_nameless)
       VALUES ($1, 'welcome', 'Bienvenida de ejemplo', 'Hola, {nombre}: soy {yo}.', 'Hola: soy {yo}.')`,
      [MESSAGE_TEMPLATE_ID],
    );
    await client.query(
      `INSERT INTO app.message_templates (id, purpose, title, body, private_to)
       VALUES ($1, 'welcome', 'Mi bienvenida de ejemplo', '¡Hola! Soy {yo}.', $2)`,
      [OWN_MESSAGE_TEMPLATE_ID, USERS.onboarder],
    );
    await client.query(
      `INSERT INTO app.organisations (id, name, kind, territory) VALUES ($1, 'Asociación Ejemplo', 'association', 'Aragón')`,
      [OUTREACH.organisation],
    );
    await client.query(
      `INSERT INTO app.organisation_notes (id, organisation_id, body)
       VALUES ($1, $2, 'Una nota de ejemplo sobre la asociación')`,
      [OUTREACH.organisationNote, OUTREACH.organisation],
    );
    await client.query(
      `INSERT INTO app.contacts (id, organisation_id, org_display, person_name, role, email, tier, anchor, owner_id,
                                 reason, sources, needs_review)
       VALUES ($1, $4, 'Asociación Ejemplo', 'Berta Ejemplo', 'Presidencia', 'berta@ejemplo.test', 'A', 'empleo', $5,
               'Preside una asociación de ejemplo', '{https://ejemplo.test/fuente}', false),
              ($2, $4, 'Asociación Ejemplo', NULL, NULL, 'info@ejemplo.test', 'B', NULL, NULL,
               'El buzón de la asociación', '{https://ejemplo.test/fuente}', false),
              ($3, NULL, 'Fundación Ejemplo', NULL, NULL, NULL, 'B', NULL, NULL, NULL, '{}', true)`,
      [
        OUTREACH.berta,
        OUTREACH.inbox,
        OUTREACH.unreviewed,
        OUTREACH.organisation,
        USERS.outreacher,
      ],
    );
    await client.query(
      `INSERT INTO app.organisations (id, name, kind, private_to)
       VALUES ($1, 'Asociación Privada de Ejemplo', 'association', $2)`,
      [OUTREACH.privateOrganisation, USERS.outreacher],
    );
    await client.query(
      `INSERT INTO app.contacts (id, organisation_id, org_display, person_name, email, needs_review, private_to)
       VALUES ($1, $2, 'Asociación Privada de Ejemplo', 'Carla Ejemplo', 'carla@ejemplo.test', true, $3)`,
      [OUTREACH.privateContact, OUTREACH.privateOrganisation, USERS.outreacher],
    );
    await client.query(
      `INSERT INTO app.contact_events (id, contact_id, kind, body, private_to)
       VALUES ($1, $2, 'note', 'Una nota privada sobre Berta', $3)`,
      [OUTREACH.privateNote, OUTREACH.berta, USERS.outreacher],
    );
    await client.query(
      `INSERT INTO app.organisation_notes (id, organisation_id, body, private_to)
       VALUES ($1, $2, 'Una nota privada sobre la asociación', $3)`,
      [OUTREACH.privateOrganisationNote, OUTREACH.organisation, USERS.outreacher],
    );
    await client.query(
      `INSERT INTO app.campaigns (id, slug, name, signature) VALUES ($1, 'campana-de-ejemplo', 'Campaña de ejemplo', 'Firma')`,
      [OUTREACH.campaign],
    );
    await client.query(
      `INSERT INTO app.campaign_templates (campaign_id, tier, subject, body)
       VALUES ($1, 'A', 'Asunto de ejemplo', '{{saludo}}\n\n{{anchor}}\n\n{{firma}}')`,
      [OUTREACH.campaign],
    );
    await client.query(
      `INSERT INTO app.campaign_anchors (campaign_id, key, label, text, sources)
       VALUES ($1, 'empleo', 'Empleo', 'Un párrafo de ejemplo.', '{https://ejemplo.test/fuente}')`,
      [OUTREACH.campaign],
    );
    await client.query(
      `INSERT INTO app.campaign_targets (id, campaign_id, contact_id, status, sent_at)
       VALUES ($1, $3, $4, 'pending', NULL), ($2, $3, $5, 'sent', now() - interval '2 days')`,
      [
        OUTREACH.pendingTarget,
        OUTREACH.sentTarget,
        OUTREACH.campaign,
        OUTREACH.berta,
        OUTREACH.inbox,
      ],
    );
    await loadAccounting(client);
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

/** The books' fixtures (ACCOUNTING), stamped as the treasurer through the staff app. */
const loadAccounting = async (client: pg.Client): Promise<void> => {
  await client.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.aal', '2', true),
            set_config('app.channel', 'web', true)`,
    [USERS.treasurer],
  );
  const A = ACCOUNTING;
  const thisYear = `extract(year FROM current_date)::integer`;
  /** An entry with its lines, as [account code, debit, credit]; posted unless `draft`. */
  const entry = async (
    id: string,
    date: string,
    description: string,
    kind: string,
    lines: readonly (readonly [string, number, number, string?])[],
    options: { draft?: boolean; counterparty?: string; project?: string } = {},
  ): Promise<void> => {
    await client.query(
      `INSERT INTO app.journal_entries (id, entry_date, description, kind, counterparty_id, project_id)
       VALUES ($1, ${date}, $2, $3, $4, $5)`,
      [id, description, kind, options.counterparty ?? null, options.project ?? null],
    );
    for (const [code, debit, credit, lineId] of lines) {
      await client.query(
        `INSERT INTO app.journal_lines (id, entry_id, account_id, debit_cents, credit_cents)
         SELECT coalesce($1::uuid, uuidv7()), $2, a.id, $4, $5 FROM app.ledger_accounts a WHERE a.code = $3`,
        [lineId ?? null, id, code, debit, credit],
      );
    }
    if (!options.draft) {
      await client.query(`UPDATE app.journal_entries SET status = 'posted' WHERE id = $1`, [id]);
    }
  };

  await client.query(
    `INSERT INTO app.ledger_accounts (id, code, name, kind, parent_code, treasury, iban)
     VALUES ($1, '5720001', 'Cuenta de ejemplo', 'asset', '572', true, $2)`,
    [A.bank, EXAMPLE_IBAN],
  );
  await client.query(
    `INSERT INTO app.counterparties (id, kind, name, tax_id, province)
     VALUES ($1, 'person', 'Persona donante de ejemplo', '00000000T', 'Teruel'),
            ($2, 'organisation', 'Proveedor de ejemplo', NULL, NULL)`,
    [A.donor, A.supplier],
  );
  await client.query(
    `INSERT INTO app.projects (id, name, funder_id, description)
     VALUES ($1, 'Proyecto de ejemplo', $2, 'Una financiación de ejemplo')`,
    [A.project, A.donor],
  );

  await client.query(`INSERT INTO app.fiscal_years (year) VALUES (${thisYear} - 2)`);
  await entry(A.closedEntry, `make_date(${thisYear} - 2, 6, 15)`, 'Donación de ejemplo', 'income', [
    ['5720001', 5000, 0],
    ['7400002', 0, 5000],
  ]);
  // Closing it opens last year, with the bank's balance carried forward.
  await client.query(
    `UPDATE app.fiscal_years SET status = 'closed', assembly_on = current_date WHERE year = ${thisYear} - 2`,
  );
  await client.query(`INSERT INTO app.fiscal_years (year) VALUES (${thisYear})`);
  await entry(
    A.draft,
    `make_date(${thisYear}, 1, 2)`,
    'Factura de luz de ejemplo',
    'expense',
    [
      ['628', 1250, 0, A.draftLine],
      ['5720001', 0, 1250],
    ],
    { draft: true },
  );
  await entry(
    A.draftWithReceipt,
    `make_date(${thisYear}, 1, 2)`,
    'Material de ejemplo',
    'expense',
    [
      ['629', 800, 0],
      ['5720001', 0, 800],
    ],
    { draft: true },
  );
  await entry(
    A.posted,
    `make_date(${thisYear}, 1, 2)`,
    'Donación de ejemplo',
    'income',
    [
      ['5720001', 2000, 0, A.postedLine],
      ['7400002', 0, 2000],
    ],
    { counterparty: A.donor, project: A.project },
  );
  await client.query(
    `INSERT INTO app.receipts (id, entry_id, file_name, content_type, byte_size, sha256)
     VALUES ($1, $2, 'justificante-de-ejemplo.pdf', 'application/pdf', 1024, repeat('a', 64)),
            ($3, $4, 'ticket-de-ejemplo.jpg', 'image/jpeg', 2048, repeat('b', 64))`,
    [A.receipt, A.posted, A.draftReceipt, A.draftWithReceipt],
  );
};
