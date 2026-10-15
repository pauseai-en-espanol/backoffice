import type { DB } from '@backoffice/db/generated/db';
import type { RawBuilder, Transaction } from 'kysely';

import {
  bySendOrder,
  type Letter,
  type LetterAnchor,
  mailtoLink,
  renderLetter,
  type Tier,
  type Treatment,
} from '@backoffice/domain/outreach';
import { whatsappLink } from '@backoffice/domain/whatsapp';
import { sql } from 'kysely';

/**
 * Outreach's reads and writes (staff API spec, M3), each in the caller's transaction: the database decides again who
 * may see and change what. Nothing here sends anything; a letter comes back as text and links for a person to use.
 */

export const ORGANISATION_KINDS = [
  'party',
  'union',
  'ngo',
  'university',
  'media',
  'company',
  'public_body',
  'association',
  'other',
] as const;
export const RELATIONSHIP_STAGES = [
  'identified',
  'qualified',
  'contacted',
  'engaged',
  'ally',
  'declined',
  'dormant',
] as const;
export const TARGET_STATUSES = [
  'pending',
  'ready',
  'sent',
  'replied',
  'meeting',
  'declined',
  'bounced',
  'no_response',
  'skip',
] as const;
export const TREATMENTS = ['neutral', 'masculino', 'femenino'] as const;

export type OrganisationKind = (typeof ORGANISATION_KINDS)[number];
export type TargetStatus = (typeof TARGET_STATUSES)[number];

/** `%` and `_` match themselves in a search. */
const pattern = (q: string): string => `%${q.trim().replaceAll(/[\\%_]/gu, (c) => `\\${c}`)}%`;

const instant = (column: RawBuilder<unknown>) => sql`to_json(${column})#>>'{}'`;

// Contacts ----------------------------------------------------------------------------------------------------------

const CONTACT_COLUMNS = sql`
  c.id, c.org_display, c.organisation_id, o.name AS org_name, o.kind::text AS org_kind, c.person_name, c.role, c.tier,
  c.territory, c.sector, c.stage::text AS stage, c.owner_id, s.display_name AS owner_name, c.needs_review, c.hold,
  c.tags, c.anonymised_at IS NOT NULL AS anonymised`;
const CONTACT_FROM = sql`
  app.contacts c
  LEFT JOIN app.organisations o ON o.id = c.organisation_id
  LEFT JOIN app.staff s ON s.user_id = c.owner_id`;

interface ContactRow {
  id: string;
  org_display: string;
  organisation_id: string | null;
  org_name: string | null;
  org_kind: string | null;
  person_name: string | null;
  role: string | null;
  tier: Tier;
  territory: string | null;
  sector: string | null;
  stage: string;
  owner_id: string | null;
  owner_name: string | null;
  needs_review: boolean;
  hold: boolean;
  tags: string[];
  anonymised: boolean;
}

const toContactSummary = (row: ContactRow) => ({
  id: row.id,
  orgDisplay: row.org_display,
  organisation:
    row.organisation_id && row.org_name
      ? { id: row.organisation_id, name: row.org_name, kind: row.org_kind }
      : null,
  personName: row.person_name,
  role: row.role,
  tier: row.tier,
  territory: row.territory,
  sector: row.sector,
  stage: row.stage,
  owner: row.owner_id ? { userId: row.owner_id, displayName: row.owner_name } : null,
  needsReview: row.needs_review,
  hold: row.hold,
  tags: row.tags,
  anonymised: row.anonymised,
});

export type ContactSummary = ReturnType<typeof toContactSummary>;

export interface ContactFilter {
  q?: string | undefined;
  tier?: Tier | undefined;
  territory?: string | undefined;
  kind?: OrganisationKind | undefined;
  stage?: string | undefined;
  /** A user id, `me`, or `none` (nobody's). */
  owner?: string | undefined;
  review?: boolean | undefined;
  hold?: boolean | undefined;
}

/** Contactos: by organisation, then person, at most 500. */
export const listContacts = async (
  trx: Transaction<DB>,
  filter: ContactFilter,
  me: string,
): Promise<ContactSummary[]> => {
  const where: RawBuilder<unknown>[] = [sql`true`];
  if (filter.q?.trim()) {
    const like = pattern(filter.q);
    where.push(
      sql`(c.org_display ILIKE ${like} OR c.person_name ILIKE ${like} OR c.role ILIKE ${like} OR o.name ILIKE ${like})`,
    );
  }
  if (filter.tier) {
    where.push(sql`c.tier = ${filter.tier}`);
  }
  if (filter.territory?.trim()) {
    where.push(sql`lower(c.territory) = lower(${filter.territory.trim()})`);
  }
  if (filter.kind) {
    where.push(sql`o.kind = ${filter.kind}::app.organisation_kind`);
  }
  if (filter.stage) {
    where.push(sql`c.stage = ${filter.stage}::app.relationship_stage`);
  }
  if (filter.owner) {
    where.push(
      filter.owner === 'none'
        ? sql`c.owner_id IS NULL`
        : sql`c.owner_id = ${filter.owner === 'me' ? me : filter.owner}`,
    );
  }
  if (filter.review !== undefined) {
    where.push(sql`c.needs_review = ${filter.review}`);
  }
  if (filter.hold !== undefined) {
    where.push(sql`c.hold = ${filter.hold}`);
  }
  const { rows } = await sql<ContactRow>`
    SELECT ${CONTACT_COLUMNS} FROM ${CONTACT_FROM}
     WHERE ${sql.join(where, sql` AND `)}
     ORDER BY c.org_display, c.person_name NULLS FIRST, c.id
     LIMIT 500`.execute(trx);
  return rows.map(toContactSummary);
};

/** A contact's fields as the API names them, and their columns, with the cast each takes. */
export const CONTACT_FIELDS = {
  organisationId: ['organisation_id', 'uuid'],
  orgDisplay: ['org_display', 'text'],
  personName: ['person_name', 'text'],
  role: ['role', 'text'],
  treatment: ['treatment', 'text'],
  greetingName: ['greeting_name', 'text'],
  email: ['email', 'text'],
  emailsExtra: ['emails_extra', 'text[]'],
  phone: ['phone', 'text'],
  website: ['website', 'text'],
  territory: ['territory', 'text'],
  scope: ['scope', 'text'],
  sector: ['sector', 'text'],
  tier: ['tier', 'text'],
  anchor: ['anchor', 'text'],
  tags: ['tags', 'text[]'],
  stage: ['stage', 'app.relationship_stage'],
  ownerId: ['owner_id', 'uuid'],
  reason: ['reason', 'text'],
  sources: ['sources', 'text[]'],
  needsReview: ['needs_review', 'boolean'],
  hold: ['hold', 'boolean'],
  holdReason: ['hold_reason', 'text'],
  notes: ['notes', 'text'],
} as const;

export type ContactInput = Partial<Record<keyof typeof CONTACT_FIELDS, unknown>>;

/** Columns and values for an insert or update, from fields already checked and normalised by the route. */
const assignments = <F extends Readonly<Record<string, readonly [string, string]>>>(
  fields: F,
  input: Partial<Record<keyof F, unknown>>,
) =>
  Object.entries(input)
    .filter(([key, value]) => Object.hasOwn(fields, key) && value !== undefined)
    .map(([key, value]) => {
      const [column, cast] = fields[key as keyof F] ?? ['', 'text'];
      const array = cast.endsWith('[]');
      const cleared = typeof value === 'string' && value.trim() === '' ? null : value;
      return {
        column: sql.ref(column),
        value: sql`${array ? (cleared ?? []) : cleared}::${sql.raw(cast)}`,
      };
    });

export const createContact = async (trx: Transaction<DB>, input: ContactInput): Promise<string> => {
  const set = assignments(CONTACT_FIELDS, input);
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.contacts (${sql.join(set.map((a) => a.column))})
    VALUES (${sql.join(set.map((a) => a.value))}) RETURNING id`.execute(trx);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error('The new contact came back with no id');
  }
  return id;
};

/** Whether the contact was there to change: an erased one isn't. */
export const updateContact = async (
  trx: Transaction<DB>,
  id: string,
  input: ContactInput,
): Promise<boolean> => {
  const set = assignments(CONTACT_FIELDS, input);
  if (set.length === 0) {
    return (
      (
        await sql`SELECT 1 FROM app.contacts WHERE id = ${id} AND anonymised_at IS NULL`.execute(
          trx,
        )
      ).rows.length === 1
    );
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.contacts SET ${sql.join(set.map((a) => sql`${a.column} = ${a.value}`))}
     WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

/** A contact's page: everything about them, the campaigns they're in and their timeline. */
export const getContact = async (trx: Transaction<DB>, id: string) => {
  const row = (
    await sql<
      ContactRow & {
        treatment: Treatment;
        greeting_name: string | null;
        email: string | null;
        emails_extra: string[];
        phone: string | null;
        website: string | null;
        scope: string | null;
        anchor: string | null;
        reason: string | null;
        sources: string[];
        hold_reason: string | null;
        notes: string | null;
        created_at: string;
      }
    >`
      SELECT ${CONTACT_COLUMNS}, c.treatment, c.greeting_name, c.email, c.emails_extra, c.phone, c.website, c.scope,
             c.anchor, c.reason, c.sources, c.hold_reason, c.notes, ${instant(sql`c.created_at`)} AS created_at
        FROM ${CONTACT_FROM} WHERE c.id = ${id}`.execute(trx)
  ).rows[0];
  if (!row) {
    return undefined;
  }
  const targets = (
    await sql<{
      id: string;
      campaign_id: string;
      slug: string;
      name: string;
      status: TargetStatus;
      sent_at: string | null;
      replied_at: string | null;
      meeting_at: string | null;
    }>`
      SELECT t.id, ca.id AS campaign_id, ca.slug, ca.name, t.status::text AS status,
             ${instant(sql`t.sent_at`)} AS sent_at, ${instant(sql`t.replied_at`)} AS replied_at,
             ${instant(sql`t.meeting_at`)} AS meeting_at
        FROM app.campaign_targets t JOIN app.campaigns ca ON ca.id = t.campaign_id
       WHERE t.contact_id = ${id} ORDER BY t.created_at DESC`.execute(trx)
  ).rows.map((target) => ({
    id: target.id,
    campaign: { id: target.campaign_id, slug: target.slug, name: target.name },
    status: target.status,
    sentAt: target.sent_at,
    repliedAt: target.replied_at,
    meetingAt: target.meeting_at,
  }));
  const timeline = (
    await sql<{
      id: string;
      kind: string;
      at: string;
      actor_id: string | null;
      actor_name: string | null;
      channel: 'web' | 'bot' | null;
      campaign_id: string | null;
      body: string | null;
      data: Record<string, unknown>;
    }>`
      SELECT e.id, e.kind::text AS kind, ${instant(sql`e.created_at`)} AS at, e.actor_id, s.display_name AS actor_name,
             e.channel, e.campaign_id, e.body, e.data
        FROM app.contact_events e LEFT JOIN app.staff s ON s.user_id = e.actor_id
       WHERE e.contact_id = ${id}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT 500`.execute(trx)
  ).rows.map((event) => ({
    id: event.id,
    kind: event.kind,
    at: event.at,
    actor: event.actor_id ? { userId: event.actor_id, displayName: event.actor_name } : null,
    channel: event.channel,
    campaignId: event.campaign_id,
    body: event.body,
    data: event.data,
  }));
  return {
    contact: {
      ...toContactSummary(row),
      organisationId: row.organisation_id,
      treatment: row.treatment,
      greetingName: row.greeting_name,
      email: row.email,
      emailsExtra: row.emails_extra,
      phone: row.phone,
      website: row.website,
      scope: row.scope,
      anchor: row.anchor,
      reason: row.reason,
      sources: row.sources,
      holdReason: row.hold_reason,
      notes: row.notes,
      createdAt: row.created_at,
    },
    targets,
    timeline,
  };
};

export const addContactNote = async (
  trx: Transaction<DB>,
  id: string,
  body: string,
): Promise<void> => {
  await sql`INSERT INTO app.contact_events (contact_id, kind, body) VALUES (${id}, 'note', ${body})`.execute(
    trx,
  );
};

/** Erasure, through the database's own function (admins only): whether it was done now. */
export const eraseContact = async (trx: Transaction<DB>, id: string): Promise<boolean> =>
  (await sql<{ done: boolean }>`SELECT private.anonymise_contact(${id}) AS done`.execute(trx))
    .rows[0]?.done === true;

// Organisations -----------------------------------------------------------------------------------------------------

export const ORGANISATION_FIELDS = {
  name: ['name', 'text'],
  kind: ['kind', 'app.organisation_kind'],
  territory: ['territory', 'text'],
  website: ['website', 'text'],
  notes: ['notes', 'text'],
} as const;

export type OrganisationInput = Partial<Record<keyof typeof ORGANISATION_FIELDS, unknown>>;

/** Organizaciones, by name, with how many contacts each has, at most 500. */
export const listOrganisations = async (
  trx: Transaction<DB>,
  filter: { q?: string | undefined; kind?: OrganisationKind | undefined },
) => {
  const where: RawBuilder<unknown>[] = [sql`true`];
  if (filter.q?.trim()) {
    where.push(sql`o.name ILIKE ${pattern(filter.q)}`);
  }
  if (filter.kind) {
    where.push(sql`o.kind = ${filter.kind}::app.organisation_kind`);
  }
  const { rows } = await sql<{
    id: string;
    name: string;
    kind: OrganisationKind;
    territory: string | null;
    website: string | null;
    contacts: number;
  }>`
    SELECT o.id, o.name, o.kind::text AS kind, o.territory, o.website,
           (SELECT count(*)::int FROM app.contacts c WHERE c.organisation_id = o.id AND c.anonymised_at IS NULL)
             AS contacts
      FROM app.organisations o
     WHERE ${sql.join(where, sql` AND `)}
     ORDER BY o.name, o.id
     LIMIT 500`.execute(trx);
  return rows;
};

export const getOrganisation = async (trx: Transaction<DB>, id: string) => {
  const organisation = (
    await sql<{
      id: string;
      name: string;
      kind: OrganisationKind;
      territory: string | null;
      website: string | null;
      notes: string | null;
      created_at: string;
    }>`
      SELECT id, name, kind::text AS kind, territory, website, notes, ${instant(sql`created_at`)} AS created_at
        FROM app.organisations WHERE id = ${id}`.execute(trx)
  ).rows[0];
  if (!organisation) {
    return undefined;
  }
  const contacts = (
    await sql<ContactRow>`
      SELECT ${CONTACT_COLUMNS} FROM ${CONTACT_FROM}
       WHERE c.organisation_id = ${id}
       ORDER BY c.org_display, c.person_name NULLS FIRST, c.id`.execute(trx)
  ).rows.map(toContactSummary);
  const { created_at: createdAt, ...rest } = organisation;
  return { organisation: { ...rest, createdAt }, contacts };
};

export const createOrganisation = async (
  trx: Transaction<DB>,
  input: OrganisationInput,
): Promise<string> => {
  const set = assignments(ORGANISATION_FIELDS, input);
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.organisations (${sql.join(set.map((a) => a.column))})
    VALUES (${sql.join(set.map((a) => a.value))}) RETURNING id`.execute(trx);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error('The new organisation came back with no id');
  }
  return id;
};

export const updateOrganisation = async (
  trx: Transaction<DB>,
  id: string,
  input: OrganisationInput,
): Promise<boolean> => {
  const set = assignments(ORGANISATION_FIELDS, input);
  if (set.length === 0) {
    return (
      (await sql`SELECT 1 FROM app.organisations WHERE id = ${id}`.execute(trx)).rows.length === 1
    );
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.organisations SET ${sql.join(set.map((a) => sql`${a.column} = ${a.value}`))}
     WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

// Campaigns ---------------------------------------------------------------------------------------------------------

export const CAMPAIGN_FIELDS = {
  slug: ['slug', 'text'],
  name: ['name', 'text'],
  goal: ['goal', 'text'],
  language: ['language', 'text'],
  fromName: ['from_name', 'text'],
  fromEmail: ['from_email', 'text'],
  signature: ['signature', 'text'],
  status: ['status', 'text'],
  ownerId: ['owner_id', 'uuid'],
} as const;

export type CampaignInput = Partial<Record<keyof typeof CAMPAIGN_FIELDS, unknown>>;

/** Campañas, newest first, with how many targets are at each status. */
export const listCampaigns = async (trx: Transaction<DB>) => {
  const { rows } = await sql<{
    id: string;
    slug: string;
    name: string;
    status: string;
    language: string;
    owner_id: string | null;
    owner_name: string | null;
    created_at: string;
    counts: Record<string, number> | null;
  }>`
    SELECT ca.id, ca.slug, ca.name, ca.status, ca.language, ca.owner_id, s.display_name AS owner_name,
           ${instant(sql`ca.created_at`)} AS created_at,
           (SELECT jsonb_object_agg(x.status, x.n)
              FROM (SELECT t.status::text AS status, count(*)::int AS n
                      FROM app.campaign_targets t WHERE t.campaign_id = ca.id GROUP BY 1) x) AS counts
      FROM app.campaigns ca LEFT JOIN app.staff s ON s.user_id = ca.owner_id
     ORDER BY ca.created_at DESC, ca.id`.execute(trx);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    language: row.language,
    owner: row.owner_id ? { userId: row.owner_id, displayName: row.owner_name } : null,
    createdAt: row.created_at,
    counts: row.counts ?? {},
  }));
};

export const createCampaign = async (
  trx: Transaction<DB>,
  input: CampaignInput,
): Promise<string> => {
  const set = assignments(CAMPAIGN_FIELDS, input);
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.campaigns (${sql.join(set.map((a) => a.column))})
    VALUES (${sql.join(set.map((a) => a.value))}) RETURNING id`.execute(trx);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error('The new campaign came back with no id');
  }
  return id;
};

export const updateCampaign = async (
  trx: Transaction<DB>,
  id: string,
  input: CampaignInput,
): Promise<boolean> => {
  const set = assignments(CAMPAIGN_FIELDS, input);
  if (set.length === 0) {
    return (await sql`SELECT 1 FROM app.campaigns WHERE id = ${id}`.execute(trx)).rows.length === 1;
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.campaigns SET ${sql.join(set.map((a) => sql`${a.column} = ${a.value}`))}
     WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

const TARGET_COLUMNS = sql`
  t.id AS target_id, t.campaign_id, t.status::text AS status, t.owner_id AS target_owner_id,
  ts.display_name AS target_owner_name, t.priority, t.anchor AS target_anchor, t.next_action,
  to_char(t.next_action_due, 'YYYY-MM-DD') AS next_action_due, ${instant(sql`t.sent_at`)} AS sent_at,
  ${instant(sql`t.replied_at`)} AS replied_at, ${instant(sql`t.meeting_at`)} AS meeting_at, t.notes AS target_notes,
  ${CONTACT_COLUMNS}`;
const TARGET_FROM = sql`
  app.campaign_targets t
  JOIN (${CONTACT_FROM}) ON c.id = t.contact_id
  LEFT JOIN app.staff ts ON ts.user_id = t.owner_id`;

interface TargetRow extends ContactRow {
  target_id: string;
  campaign_id: string;
  status: TargetStatus;
  target_owner_id: string | null;
  target_owner_name: string | null;
  priority: number | null;
  target_anchor: string | null;
  next_action: string | null;
  next_action_due: string | null;
  sent_at: string | null;
  replied_at: string | null;
  meeting_at: string | null;
  target_notes: string | null;
}

const toTarget = (row: TargetRow) => ({
  id: row.target_id,
  contact: toContactSummary(row),
  status: row.status,
  owner: row.target_owner_id
    ? { userId: row.target_owner_id, displayName: row.target_owner_name }
    : null,
  priority: row.priority,
  anchor: row.target_anchor,
  nextAction: row.next_action,
  nextActionDue: row.next_action_due,
  sentAt: row.sent_at,
  repliedAt: row.replied_at,
  meetingAt: row.meeting_at,
  notes: row.target_notes,
});

export type Target = ReturnType<typeof toTarget>;

/** The order targets go out in (`bySendOrder`): priority, tier, then the contact. */
const inSendOrder = (targets: Target[]): Target[] =>
  [...targets].sort((a, b) =>
    bySendOrder(
      { priority: a.priority, tier: a.contact.tier, id: a.contact.id },
      { priority: b.priority, tier: b.contact.tier, id: b.contact.id },
    ),
  );

export const getTarget = async (trx: Transaction<DB>, id: string): Promise<Target | undefined> => {
  const row = (
    await sql<TargetRow>`SELECT ${TARGET_COLUMNS} FROM ${TARGET_FROM} WHERE t.id = ${id}`.execute(
      trx,
    )
  ).rows[0];
  return row ? toTarget(row) : undefined;
};

/** A campaign's page: its details, templates, anchors and targets in send order. */
export const getCampaign = async (trx: Transaction<DB>, id: string) => {
  const campaign = (
    await sql<{
      id: string;
      slug: string;
      name: string;
      goal: string | null;
      language: string;
      from_name: string | null;
      from_email: string | null;
      signature: string;
      status: string;
      owner_id: string | null;
      owner_name: string | null;
      created_at: string;
    }>`
      SELECT ca.id, ca.slug, ca.name, ca.goal, ca.language, ca.from_name, ca.from_email, ca.signature, ca.status,
             ca.owner_id, s.display_name AS owner_name, ${instant(sql`ca.created_at`)} AS created_at
        FROM app.campaigns ca LEFT JOIN app.staff s ON s.user_id = ca.owner_id
       WHERE ca.id = ${id}`.execute(trx)
  ).rows[0];
  if (!campaign) {
    return undefined;
  }
  const templates = (
    await sql<{
      tier: Tier;
      subject: string;
      body: string;
      max_words: number | null;
      sources: string[];
      notes: string | null;
      version: number;
      updated_at: string;
    }>`
      SELECT tier, subject, body, max_words, sources, notes, version, ${instant(sql`updated_at`)} AS updated_at
        FROM app.campaign_templates WHERE campaign_id = ${id} ORDER BY tier`.execute(trx)
  ).rows.map((row) => ({
    tier: row.tier,
    subject: row.subject,
    body: row.body,
    maxWords: row.max_words,
    sources: row.sources,
    notes: row.notes,
    version: row.version,
    updatedAt: row.updated_at,
  }));
  const anchors = (
    await sql<{ key: string; label: string; text: string; sources: string[] }>`
      SELECT key, label, text, sources FROM app.campaign_anchors WHERE campaign_id = ${id} ORDER BY key`.execute(
      trx,
    )
  ).rows;
  const targets = (
    await sql<TargetRow>`SELECT ${TARGET_COLUMNS} FROM ${TARGET_FROM} WHERE t.campaign_id = ${id}`.execute(
      trx,
    )
  ).rows.map(toTarget);
  return {
    campaign: {
      id: campaign.id,
      slug: campaign.slug,
      name: campaign.name,
      goal: campaign.goal,
      language: campaign.language,
      fromName: campaign.from_name,
      fromEmail: campaign.from_email,
      signature: campaign.signature,
      status: campaign.status,
      owner: campaign.owner_id
        ? { userId: campaign.owner_id, displayName: campaign.owner_name }
        : null,
      createdAt: campaign.created_at,
    },
    templates,
    anchors,
    targets: inSendOrder(targets),
  };
};

export const campaignExists = async (trx: Transaction<DB>, id: string): Promise<boolean> =>
  (await sql`SELECT 1 FROM app.campaigns WHERE id = ${id}`.execute(trx)).rows.length === 1;

/** A tier's template, made or replaced. */
export const putTemplate = async (
  trx: Transaction<DB>,
  campaign: string,
  tier: Tier,
  template: {
    subject: string;
    body: string;
    maxWords: number | null;
    sources: string[];
    notes: string | null;
  },
): Promise<void> => {
  await sql`
    INSERT INTO app.campaign_templates (campaign_id, tier, subject, body, max_words, sources, notes)
    VALUES (${campaign}, ${tier}, ${template.subject}, ${template.body}, ${template.maxWords},
            ${template.sources}::text[], ${template.notes})
    ON CONFLICT (campaign_id, tier) DO UPDATE
       SET subject = excluded.subject, body = excluded.body, max_words = excluded.max_words,
           sources = excluded.sources, notes = excluded.notes`.execute(trx);
};

export const putAnchor = async (
  trx: Transaction<DB>,
  campaign: string,
  key: string,
  anchor: { label: string; text: string; sources: string[] },
): Promise<void> => {
  await sql`
    INSERT INTO app.campaign_anchors (campaign_id, key, label, text, sources)
    VALUES (${campaign}, ${key}, ${anchor.label}, ${anchor.text}, ${anchor.sources}::text[])
    ON CONFLICT (campaign_id, key) DO UPDATE
       SET label = excluded.label, text = excluded.text, sources = excluded.sources`.execute(trx);
};

/**
 * Removes an anchor no one in the campaign still uses: `inUse` when a target, or a target's contact, names it;
 * `notFound` when there's no such anchor.
 */
export const deleteAnchor = async (
  trx: Transaction<DB>,
  campaign: string,
  key: string,
): Promise<'deleted' | 'inUse' | 'notFound'> => {
  const used = await sql`
    SELECT 1 FROM app.campaign_targets t JOIN app.contacts c ON c.id = t.contact_id
     WHERE t.campaign_id = ${campaign} AND coalesce(t.anchor, c.anchor) = ${key} LIMIT 1`.execute(
    trx,
  );
  if (used.rows.length > 0) {
    return 'inUse';
  }
  const { rows } = await sql<{ id: string }>`
    DELETE FROM app.campaign_anchors WHERE campaign_id = ${campaign} AND key = ${key} RETURNING id`.execute(
    trx,
  );
  return rows.length === 1 ? 'deleted' : 'notFound';
};

/** Adds contacts to a campaign as pending, leaving those already in it: how many were added. */
export const addTargets = async (
  trx: Transaction<DB>,
  campaign: string,
  contactIds: readonly string[],
): Promise<number> => {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO app.campaign_targets (campaign_id, contact_id)
    SELECT ${campaign}, c.id FROM app.contacts c
     WHERE c.id = ANY (${contactIds}::uuid[]) AND c.anonymised_at IS NULL
    ON CONFLICT (campaign_id, contact_id) DO NOTHING
    RETURNING id`.execute(trx);
  return rows.length;
};

export const TARGET_FIELDS = {
  status: ['status', 'app.target_status'],
  ownerId: ['owner_id', 'uuid'],
  priority: ['priority', 'integer'],
  anchor: ['anchor', 'text'],
  nextAction: ['next_action', 'text'],
  nextActionDue: ['next_action_due', 'date'],
  notes: ['notes', 'text'],
} as const;

export type TargetInput = Partial<Record<keyof typeof TARGET_FIELDS, unknown>>;

export const updateTarget = async (
  trx: Transaction<DB>,
  id: string,
  input: TargetInput,
): Promise<boolean> => {
  const set = assignments(TARGET_FIELDS, input);
  if (set.length === 0) {
    return (
      (await sql`SELECT 1 FROM app.campaign_targets WHERE id = ${id}`.execute(trx)).rows.length ===
      1
    );
  }
  const { rows } = await sql<{ id: string }>`
    UPDATE app.campaign_targets SET ${sql.join(set.map((a) => sql`${a.column} = ${a.value}`))}
     WHERE id = ${id} RETURNING id`.execute(trx);
  return rows.length === 1;
};

/** Takes a contact out of a campaign, unless someone has written to them (`sent`); `notFound` if no such target. */
export const deleteTarget = async (
  trx: Transaction<DB>,
  id: string,
): Promise<'deleted' | 'sent' | 'notFound'> => {
  const { rows } = await sql<{ id: string }>`
    DELETE FROM app.campaign_targets WHERE id = ${id} RETURNING id`.execute(trx);
  if (rows.length === 1) {
    return 'deleted';
  }
  return (await sql`SELECT 1 FROM app.campaign_targets WHERE id = ${id}`.execute(trx)).rows
    .length === 1
    ? 'sent'
    : 'notFound';
};

/** "Sí, enviado": the target becomes sent, dated by the database, and mine if it was nobody's. */
export const markSent = async (
  trx: Transaction<DB>,
  id: string,
  me: string,
  templateVersion: number | null,
): Promise<'sent' | 'stale' | 'notFound'> => {
  const { rows } = await sql<{ id: string }>`
    UPDATE app.campaign_targets
       SET status = 'sent', template_version = ${templateVersion}, owner_id = coalesce(owner_id, ${me}::uuid)
     WHERE id = ${id} AND status IN ('pending', 'ready')
    RETURNING id`.execute(trx);
  if (rows.length === 1) {
    return 'sent';
  }
  return (await sql`SELECT 1 FROM app.campaign_targets WHERE id = ${id}`.execute(trx)).rows
    .length === 1
    ? 'stale'
    : 'notFound';
};

// Letters -----------------------------------------------------------------------------------------------------------

export interface Handover {
  letter: Letter;
  to: string[];
  cc: string[];
  mailto: string | null;
  whatsapp: string | null;
  templateVersion: number | null;
}

/** "Sindicato Ejemplo — Aragón" is "Sindicato Ejemplo" for `{{org}}` when the contact has no organisation. */
const orgOf = (name: string | null, display: string): string =>
  name ?? display.split(' — ')[0] ?? display;

/**
 * The letter a contact gets from a campaign, and how to hand it over: `undefined` when there's no such contact or
 * campaign. The target's own anchor, if it has one, wins over the contact's.
 */
export const handoverFor = async (
  trx: Transaction<DB>,
  campaign: string,
  contact: string,
  targetAnchor: string | null = null,
): Promise<Handover | undefined> => {
  const who = (
    await sql<{
      org_display: string;
      org_name: string | null;
      territory: string | null;
      person_name: string | null;
      greeting_name: string | null;
      treatment: Treatment;
      sector: string | null;
      role: string | null;
      tier: Tier;
      anchor: string | null;
      needs_review: boolean;
      hold: boolean;
      anonymised: boolean;
      email: string | null;
      emails_extra: string[];
      phone: string | null;
    }>`
      SELECT c.org_display, o.name AS org_name, c.territory, c.person_name, c.greeting_name, c.treatment, c.sector,
             c.role, c.tier, c.anchor, c.needs_review, c.hold, c.anonymised_at IS NOT NULL AS anonymised, c.email,
             c.emails_extra, c.phone
        FROM app.contacts c LEFT JOIN app.organisations o ON o.id = c.organisation_id
       WHERE c.id = ${contact}`.execute(trx)
  ).rows[0];
  const signature = (
    await sql<{
      signature: string;
    }>`SELECT signature FROM app.campaigns WHERE id = ${campaign}`.execute(trx)
  ).rows[0]?.signature;
  if (!who || signature === undefined) {
    return undefined;
  }
  const template = (
    await sql<{
      subject: string;
      body: string;
      max_words: number | null;
      sources: string[];
      version: number;
    }>`
      SELECT subject, body, max_words, sources, version FROM app.campaign_templates
       WHERE campaign_id = ${campaign} AND tier = ${who.tier}`.execute(trx)
  ).rows[0];
  const anchors: Record<string, LetterAnchor> = Object.fromEntries(
    (
      await sql<{ key: string; text: string; sources: string[] }>`
        SELECT key, text, sources FROM app.campaign_anchors WHERE campaign_id = ${campaign}`.execute(
        trx,
      )
    ).rows.map((row) => [row.key, { text: row.text, sources: row.sources }]),
  );
  const letter = renderLetter({
    template: template
      ? {
          subject: template.subject,
          body: template.body,
          maxWords: template.max_words,
          sources: template.sources,
        }
      : undefined,
    contact: {
      org: orgOf(who.org_name, who.org_display),
      tier: who.tier,
      orgDisplay: who.org_display,
      territory: who.territory,
      personName: who.person_name,
      greetingName: who.greeting_name,
      treatment: who.treatment,
      sector: who.sector,
      role: who.role,
      anchor: targetAnchor ?? who.anchor,
      needsReview: who.needs_review,
      hold: who.hold || who.anonymised,
    },
    anchors,
    signature,
  });
  const to = who.email ? [who.email] : [];
  return {
    letter,
    to,
    cc: who.emails_extra,
    mailto:
      letter.ok && to.length > 0
        ? mailtoLink({ to, cc: who.emails_extra, subject: letter.subject, body: letter.body })
        : null,
    whatsapp: letter.ok && who.phone ? (whatsappLink(who.phone, letter.body) ?? null) : null,
    templateVersion: template?.version ?? null,
  };
};

/**
 * Siguiente: my next target, pending or ready, mine or nobody's, in send order, in one campaign or every active one,
 * past those the person left for later in this visit (`skip`, "Ahora no"). Targets whose contact needs review or is
 * held are passed over and counted.
 */
export const nextTarget = async (
  trx: Transaction<DB>,
  me: string,
  campaign: string | undefined,
  skip: readonly string[] = [],
) => {
  const rows = (
    await sql<TargetRow & { blocked: boolean }>`
      SELECT ${TARGET_COLUMNS}, (c.needs_review OR c.hold OR c.anonymised_at IS NOT NULL) AS blocked
        FROM ${TARGET_FROM} JOIN app.campaigns ca ON ca.id = t.campaign_id
       WHERE t.status IN ('pending', 'ready') AND (t.owner_id IS NULL OR t.owner_id = ${me})
         AND ${campaign ? sql`t.campaign_id = ${campaign}` : sql`ca.status = 'active'`}`.execute(
      trx,
    )
  ).rows;
  const open = inSendOrder(
    rows.filter((row) => !row.blocked && !skip.includes(row.target_id)).map(toTarget),
  );
  const blocked = rows.filter((row) => row.blocked).length;
  const [first] = open;
  if (!first) {
    return { target: null, campaign: null, handover: null, remaining: 0, blocked };
  }
  const campaignId = rows.find((row) => row.target_id === first.id)?.campaign_id ?? '';
  const about = (
    await sql<{ id: string; slug: string; name: string }>`
      SELECT id, slug, name FROM app.campaigns WHERE id = ${campaignId}`.execute(trx)
  ).rows[0];
  return {
    target: first,
    campaign: about ?? null,
    handover: (await handoverFor(trx, campaignId, first.contact.id, first.anchor)) ?? null,
    remaining: open.length,
    blocked,
  };
};

/** The campaign a target is in, for its letter. */
export const targetCampaign = async (
  trx: Transaction<DB>,
  id: string,
): Promise<string | undefined> =>
  (
    await sql<{
      campaign_id: string;
    }>`SELECT campaign_id FROM app.campaign_targets WHERE id = ${id}`.execute(trx)
  ).rows[0]?.campaign_id;
