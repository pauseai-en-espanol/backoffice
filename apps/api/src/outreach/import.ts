import type { DB } from '@backoffice/db/generated/db';
import type { Transaction } from 'kysely';

import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { fieldsIn, MERGE_FIELDS, type Tier } from '@backoffice/domain/outreach';
import { getTranslator } from '@backoffice/i18n/messages';
import { parse as parseCsv } from 'csv-parse/sync';
import { sql } from 'kysely';
import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';

import { TARGET_STATUSES, type TargetStatus } from './outreach.js';

/**
 * The one-off import of a campaign from the `outreach` repo (outreach spec §4): its files' text, read here, written in
 * the caller's transaction as the admin who runs it. Problems stop it; warnings are what it did that someone should
 * know. Nothing in the files is logged.
 */

export interface ImportFiles {
  campaign: string;
  contacts: string;
  anchors?: string;
  templates?: { A?: string; B?: string };
  tracking?: string;
}

export interface ImportNote {
  file: string;
  line?: number;
  message: string;
}

export interface ImportResult {
  counts: {
    organisations: number;
    contacts: number;
    targets: number;
    templates: number;
    anchors: number;
  };
  problems: ImportNote[];
  warnings: ImportNote[];
}

const FILES = {
  campaign: 'campaign.yaml',
  contacts: 'contacts/contacts.yaml',
  anchors: 'templates/anchors.yaml',
  A: 'templates/tier-a.md',
  B: 'templates/tier-b.md',
  tracking: 'tracking.csv',
} as const;

const KEY = /^[a-z0-9_-]{1,60}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An own field of a parsed object: never one from its prototype. */
const field = (from: unknown, key: string): unknown =>
  isPlain(from) && Object.hasOwn(from, key) ? from[key] : undefined;

const text = (value: unknown): string | undefined => {
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const texts = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .map(text)
    .filter((item): item is string => item !== undefined);

/** A YAML file: its value, and each top-level list item's or map entry's line. */
const readYaml = (source: string, file: string, problems: ImportNote[]) => {
  const lineCounter = new LineCounter();
  const doc = parseDocument(source, { lineCounter, uniqueKeys: true });
  if (doc.errors.length > 0) {
    problems.push({
      file,
      line: doc.errors[0]?.linePos?.[0].line,
      message: getTranslator()('outreachImport.problems.unreadable'),
    });
    return undefined;
  }
  const lineOf = (key: string): number[] => {
    const node = doc.get(key, true);
    if (isSeq(node)) {
      return node.items.map((item) => {
        const range = (item as { range?: [number, number, number] }).range;
        return range ? lineCounter.linePos(range[0]).line : 0;
      });
    }
    if (isMap(node)) {
      return node.items.map((pair) => {
        const range = (pair.key as { range?: [number, number, number] }).range;
        return range ? lineCounter.linePos(range[0]).line : 0;
      });
    }
    return [];
  };
  return { value: doc.toJS() as unknown, lineOf };
};

/** A template file: its YAML front matter between `---` lines, then the body. */
const readTemplate = (source: string) => {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines[0]?.trim() !== '---') {
    return undefined;
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) {
    return undefined;
  }
  const doc = parseDocument(lines.slice(1, end).join('\n'));
  if (doc.errors.length > 0) {
    return undefined;
  }
  const meta = doc.toJS() as unknown;
  const subject = text(field(meta, 'subject'));
  if (!subject) {
    return undefined;
  }
  const maxWords = field(meta, 'maxWords');
  return {
    subject,
    body: lines
      .slice(end + 1)
      .join('\n')
      .trim(),
    maxWords:
      typeof maxWords === 'number' && Number.isInteger(maxWords) && maxWords > 0 ? maxWords : null,
    sources: texts(field(meta, 'sources')),
    notes: text(field(meta, 'notes')) ?? null,
  };
};

/** How far a relationship got, from the furthest status any of its campaign rows reached. */
const stageFor = (status: TargetStatus | undefined): string => {
  switch (status) {
    case 'replied':
    case 'meeting': {
      return 'engaged';
    }
    case 'declined': {
      return 'declined';
    }
    case 'sent':
    case 'bounced':
    case 'no_response': {
      return 'contacted';
    }
    default: {
      return 'identified';
    }
  }
};

/** A tracking date: `YYYY-MM-DD` or an ISO instant; undefined for anything else. */
const instantOf = (value: string): string | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/u.test(value)) {
    return undefined;
  }
  const at = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
};

/** A website as the repo wrote it: with its scheme, or a bare domain given one; undefined if it's neither. */
const websiteOf = (value: string): string | undefined => {
  if (/^https?:\/\/\S+$/u.test(value)) {
    return value;
  }
  return /^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/u.test(value) ? `https://${value}` : undefined;
};

const LIMITS = {
  org: 200,
  orgDisplay: 300,
  name: 200,
  role: 200,
  greetingName: 200,
  territory: 100,
  scope: 50,
  sector: 100,
  holdReason: 500,
  notes: 4000,
} as const;

interface ContactPlan {
  id: string;
  line: number | undefined;
  org: string;
  orgDisplay: string;
  personName: string | null;
  role: string | null;
  treatment: string;
  greetingName: string | null;
  email: string | null;
  emailsExtra: string[];
  phone: string | null;
  website: string | null;
  territory: string | null;
  scope: string | null;
  sector: string | null;
  tier: Tier;
  anchor: string | null;
  priority: number | null;
  source: string | undefined;
  notes: string | null;
  needsReview: boolean;
  hold: boolean;
  holdReason: string | null;
}

interface TrackingRow {
  status: TargetStatus;
  sentAt: string | null;
  repliedAt: string | null;
  meetingAt: string | null;
  owner: string | undefined;
  notes: string | undefined;
}

/** Reads every file, then, without problems, writes the campaign: its organisations, contacts, targets, templates. */
export const importCampaign = async (
  trx: Transaction<DB>,
  files: ImportFiles,
): Promise<ImportResult> => {
  const t = getTranslator();
  const problems: ImportNote[] = [];
  const warnings: ImportNote[] = [];
  const counts = { organisations: 0, contacts: 0, targets: 0, templates: 0, anchors: 0 };

  // campaign.yaml
  const campaignFile = readYaml(files.campaign, FILES.campaign, problems);
  const config = campaignFile?.value;
  const slug = text(field(config, 'slug'));
  const name = text(field(config, 'name'));
  const language = text(field(config, 'language')) ?? 'es';
  const fromEmailRaw = text(field(config, 'fromEmail'));
  const fromEmail = fromEmailRaw ? normalizeEmail(fromEmailRaw) : null;
  if (campaignFile) {
    for (const [key, ok] of [
      ['slug', slug !== undefined && SLUG.test(slug) && slug.length <= 80],
      ['name', name !== undefined && name.length <= 200],
      ['language', /^[a-z]{2}$/u.test(language)],
      ['fromEmail', fromEmail !== undefined],
    ] as const) {
      if (!ok) {
        problems.push({
          file: FILES.campaign,
          message: t('outreachImport.problems.campaignField', { field: key }),
        });
      }
    }
  }
  if (slug && SLUG.test(slug)) {
    const taken = await sql`SELECT 1 FROM app.campaigns WHERE slug = ${slug}`.execute(trx);
    if (taken.rows.length > 0) {
      problems.push({
        file: FILES.campaign,
        message: t('outreachImport.problems.slugTaken', { slug }),
      });
    }
  }

  // templates/anchors.yaml
  const anchors: { key: string; label: string; text: string; sources: string[] }[] = [];
  if (files.anchors !== undefined) {
    const anchorsFile = readYaml(files.anchors, FILES.anchors, problems);
    const map = field(anchorsFile?.value, 'anchors');
    const lines = anchorsFile?.lineOf('anchors') ?? [];
    if (isPlain(map)) {
      Object.entries(map).forEach(([key, value], index) => {
        const line = lines[index];
        if (!KEY.test(key)) {
          problems.push({
            file: FILES.anchors,
            line,
            message: t('outreachImport.problems.anchorKey', { key }),
          });
          return;
        }
        const label = text(field(value, 'label'));
        const body = text(field(value, 'text'));
        const sources = texts(field(value, 'sources'));
        if (
          !label ||
          !body ||
          sources.length === 0 ||
          label.length > 200 ||
          body.length > 4000 ||
          sources.some((source) => source.length > 500)
        ) {
          problems.push({
            file: FILES.anchors,
            line,
            message: t('outreachImport.problems.anchorInvalid', { key }),
          });
          return;
        }
        anchors.push({ key, label, text: body, sources });
      });
    }
  }
  const anchorKeys = new Set(anchors.map((anchor) => anchor.key));

  // templates/tier-*.md
  const templates: { tier: Tier; template: NonNullable<ReturnType<typeof readTemplate>> }[] = [];
  for (const tier of ['A', 'B'] as const) {
    const source = files.templates?.[tier];
    if (source === undefined) {
      continue;
    }
    const template = readTemplate(source);
    if (!template) {
      problems.push({
        file: FILES[tier],
        message: t('outreachImport.problems.templateFrontMatter'),
      });
      continue;
    }
    const unknown = fieldsIn(`${template.subject}\n${template.body}`).filter(
      (merge) => !(MERGE_FIELDS as readonly string[]).includes(merge),
    );
    if (unknown.length > 0) {
      problems.push({
        file: FILES[tier],
        message: t('outreachImport.problems.templateFields', { fields: unknown.join(', ') }),
      });
      continue;
    }
    templates.push({ tier, template });
  }

  // contacts/contacts.yaml
  const contactsFile = readYaml(files.contacts, FILES.contacts, problems);
  const list = field(contactsFile?.value, 'contacts');
  const contactLines = contactsFile?.lineOf('contacts') ?? [];
  const contacts: ContactPlan[] = [];
  if (contactsFile && (!Array.isArray(list) || list.length === 0)) {
    problems.push({ file: FILES.contacts, message: t('outreachImport.problems.noContacts') });
  }
  const seen = new Set<string>();
  (Array.isArray(list) ? list : []).forEach((entry: unknown, index) => {
    const line = contactLines[index];
    const problem = (key: string, values: Record<string, string> = {}) =>
      problems.push({
        file: FILES.contacts,
        line,
        message: t(`outreachImport.problems.${key}` as 'outreachImport.problems.contactId', values),
      });
    const warn = (key: string, values: Record<string, string> = {}) =>
      warnings.push({
        file: FILES.contacts,
        line,
        message: t(`outreachImport.warnings.${key}` as 'outreachImport.warnings.noSource', values),
      });
    const id = text(field(entry, 'id'));
    if (!id || seen.has(id) || id.length > 150) {
      problem('contactId');
      return;
    }
    seen.add(id);
    const org = text(field(entry, 'org'));
    if (!org) {
      problem('contactOrg', { id });
      return;
    }
    const person = field(entry, 'person');
    const plan: ContactPlan = {
      id,
      line,
      org,
      orgDisplay: text(field(entry, 'orgDisplay')) ?? org,
      personName: text(field(person, 'name')) ?? null,
      role: text(field(person, 'role')) ?? null,
      treatment: text(field(person, 'treatment')) ?? 'neutral',
      greetingName: text(field(person, 'greetingName')) ?? null,
      email: null,
      emailsExtra: [],
      phone: null,
      website: null,
      territory: text(field(entry, 'territory')) ?? null,
      scope: text(field(entry, 'scope')) ?? null,
      sector: text(field(entry, 'sector')) ?? null,
      tier: 'B',
      anchor: text(field(entry, 'anchor')) ?? null,
      priority: null,
      source: text(field(entry, 'source')),
      notes: text(field(entry, 'notes')) ?? null,
      needsReview: field(entry, 'needsReview') === true,
      hold: field(entry, 'hold') === true,
      holdReason: text(field(entry, 'holdReason')) ?? null,
    };
    const email = text(field(entry, 'email'));
    if (email) {
      plan.email = normalizeEmail(email) ?? null;
      if (!plan.email) {
        problem('contactEmail', { id });
      }
    }
    const extra = texts(field(entry, 'emailsExtra')).map((value) => normalizeEmail(value));
    if (extra.some((value) => value === undefined)) {
      problem('contactEmailsExtra', { id });
    }
    plan.emailsExtra = [
      ...new Set(extra.filter((value): value is string => value !== undefined)),
    ].slice(0, 10);
    const phone = text(field(entry, 'phone'));
    if (phone) {
      plan.phone = normalizePhone(phone) ?? null;
      if (!plan.phone) {
        warn('phoneDropped', { id });
      }
    }
    const website = text(field(entry, 'web'));
    if (website) {
      plan.website = websiteOf(website) ?? null;
      if (!plan.website || plan.website.length > 500) {
        plan.website = null;
        warn('websiteDropped', { id });
      }
    }
    const tier = text(field(entry, 'tier')) ?? 'B';
    if (tier === 'A' || tier === 'B') {
      plan.tier = tier;
    } else {
      problem('contactTier', { id });
    }
    if (plan.anchor && !KEY.test(plan.anchor)) {
      problem('contactAnchor', { id });
    } else if (plan.anchor && files.anchors !== undefined && !anchorKeys.has(plan.anchor)) {
      warn('anchorUnknown', { id, anchor: plan.anchor });
    }
    const priority = field(entry, 'priority');
    if (priority !== undefined && priority !== null) {
      if (typeof priority === 'number' && Number.isInteger(priority) && priority > 0) {
        plan.priority = priority;
      } else {
        problem('contactPriority', { id });
      }
    }
    if (!['neutral', 'masculino', 'femenino'].includes(plan.treatment)) {
      problem('contactTreatment', { id });
    }
    for (const [key, value] of [
      ['org', plan.org],
      ['orgDisplay', plan.orgDisplay],
      ['name', plan.personName],
      ['role', plan.role],
      ['greetingName', plan.greetingName],
      ['territory', plan.territory],
      ['scope', plan.scope],
      ['sector', plan.sector],
      ['holdReason', plan.holdReason],
      ['notes', plan.notes],
    ] as const) {
      if (value && value.length > LIMITS[key]) {
        problem('tooLong', { id, field: key });
      }
    }
    if (plan.source && plan.source.length > 500) {
      problem('tooLong', { id, field: 'source' });
    }
    if (!plan.source && !plan.needsReview) {
      warn('noSource', { id });
    }
    contacts.push(plan);
  });

  // tracking.csv
  const tracking = new Map<string, TrackingRow>();
  if (files.tracking !== undefined && files.tracking.trim() !== '') {
    let rows: Record<string, string>[] = [];
    try {
      rows = parseCsv(files.tracking, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Record<string, string>[];
    } catch {
      problems.push({
        file: FILES.tracking,
        message: t('outreachImport.problems.trackingUnreadable'),
      });
    }
    const header = rows[0] ? Object.keys(rows[0]) : [];
    const missing = ['id', 'status'].filter(
      (column) => rows.length > 0 && !header.includes(column),
    );
    if (missing.length > 0) {
      problems.push({
        file: FILES.tracking,
        message: t('outreachImport.problems.trackingColumns', { columns: missing.join(', ') }),
      });
      rows = [];
    }
    rows.forEach((row, index) => {
      const line = index + 2;
      const id = row.id ?? '';
      if (!seen.has(id)) {
        warnings.push({
          file: FILES.tracking,
          line,
          message: t('outreachImport.warnings.trackingUnknown', { id }),
        });
        return;
      }
      const status = row.status || 'pending';
      if (!(TARGET_STATUSES as readonly string[]).includes(status)) {
        problems.push({
          file: FILES.tracking,
          line,
          message: t('outreachImport.problems.trackingStatus', { id, status }),
        });
        return;
      }
      const dates: Record<'sent_at' | 'replied_at' | 'meeting_at', string | null> = {
        sent_at: null,
        replied_at: null,
        meeting_at: null,
      };
      for (const column of ['sent_at', 'replied_at', 'meeting_at'] as const) {
        const value = row[column] ?? '';
        if (value === '') {
          continue;
        }
        const at = instantOf(value);
        if (!at) {
          problems.push({
            file: FILES.tracking,
            line,
            message: t('outreachImport.problems.trackingDate', { id, value }),
          });
          continue;
        }
        dates[column] = at;
      }
      tracking.set(id, {
        status: status as TargetStatus,
        sentAt: dates.sent_at,
        repliedAt: dates.replied_at,
        meetingAt: dates.meeting_at,
        owner: row.owner || undefined,
        notes: row.notes || undefined,
      });
    });
  }
  if (problems.length > 0 || !slug || !name) {
    return { counts, problems, warnings };
  }

  // Writing, in the caller's transaction.
  const campaignId = (
    await sql<{ id: string }>`
      INSERT INTO app.campaigns (slug, name, language, from_name, from_email, signature)
      VALUES (${slug}, ${name}, ${language}, ${text(field(config, 'fromName')) ?? null}, ${fromEmail ?? null},
              ${text(field(config, 'signature')) ?? ''})
      RETURNING id`.execute(trx)
  ).rows[0]?.id;
  if (!campaignId) {
    throw new Error('The imported campaign came back with no id');
  }
  for (const { tier, template } of templates) {
    await sql`
      INSERT INTO app.campaign_templates (campaign_id, tier, subject, body, max_words, sources, notes)
      VALUES (${campaignId}, ${tier}, ${template.subject}, ${template.body}, ${template.maxWords},
              ${template.sources}::text[], ${template.notes})`.execute(trx);
    counts.templates += 1;
  }
  for (const anchor of anchors) {
    await sql`
      INSERT INTO app.campaign_anchors (campaign_id, key, label, text, sources)
      VALUES (${campaignId}, ${anchor.key}, ${anchor.label}, ${anchor.text}, ${anchor.sources}::text[])`.execute(
      trx,
    );
    counts.anchors += 1;
  }

  const organisations = new Map<string, string>();
  const reason = t('outreachImport.reason', { campaign: name });
  for (const contact of contacts) {
    let organisation = organisations.get(contact.org);
    if (!organisation) {
      const ref = `outreach-org:${contact.org}`;
      organisation = (
        await sql<{
          id: string;
        }>`SELECT id FROM app.organisations WHERE external_ref = ${ref}`.execute(trx)
      ).rows[0]?.id;
      if (!organisation) {
        organisation = (
          await sql<{ id: string }>`
            INSERT INTO app.organisations (name, kind, external_ref) VALUES (${contact.org}, 'other', ${ref})
            RETURNING id`.execute(trx)
        ).rows[0]?.id;
        counts.organisations += 1;
      }
      if (!organisation) {
        throw new Error('An imported organisation came back with no id');
      }
      organisations.set(contact.org, organisation);
    }
    const row = tracking.get(contact.id);
    const contactId = (
      await sql<{ id: string }>`
        INSERT INTO app.contacts (organisation_id, org_display, person_name, role, treatment, greeting_name, email,
                                  emails_extra, phone, website, territory, scope, sector, tier, anchor, stage, reason,
                                  sources, needs_review, hold, hold_reason, notes, external_ref)
        VALUES (${organisation}, ${contact.orgDisplay}, ${contact.personName}, ${contact.role}, ${contact.treatment},
                ${contact.greetingName}, ${contact.email}, ${contact.emailsExtra}::text[], ${contact.phone},
                ${contact.website}, ${contact.territory}, ${contact.scope}, ${contact.sector}, ${contact.tier},
                ${contact.anchor}, ${stageFor(row?.status)}::app.relationship_stage, ${reason},
                ${contact.source ? [contact.source] : []}::text[], ${contact.needsReview || !contact.source},
                ${contact.hold}, ${contact.holdReason}, ${contact.notes}, ${`outreach:${slug}:${contact.id}`})
        RETURNING id`.execute(trx)
    ).rows[0]?.id;
    counts.contacts += 1;
    // A held contact isn't put in the campaign, unless someone already wrote to them: that history is kept, and the
    // hold still keeps them out of every queue.
    const history = row !== undefined && !['pending', 'skip'].includes(row.status);
    if (!contactId || (contact.hold && !history)) {
      continue;
    }
    const notes = [
      row?.notes,
      row?.owner ? t('outreachImport.ownerNote', { owner: row.owner }) : undefined,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
    await sql`
      INSERT INTO app.campaign_targets (campaign_id, contact_id, status, priority, sent_at, replied_at, meeting_at,
                                        notes)
      VALUES (${campaignId}, ${contactId}, ${row?.status ?? 'pending'}::app.target_status, ${contact.priority},
              ${row?.sentAt ?? null}::timestamptz, ${row?.repliedAt ?? null}::timestamptz,
              ${row?.meetingAt ?? null}::timestamptz, ${notes || null})`.execute(trx);
    counts.targets += 1;
  }
  return { counts, problems, warnings };
};
