import { parseStaffRef, type StaffRef } from '@/onboarding/types';

/**
 * What the outreach pages read from the API (docs/spec/staff-api.md, M3: outreach), and the checks that keep a page
 * from rendering an answer it doesn't understand. Shared by server and browser code: no node imports here. Optional or
 * nullable fields the API may leave out become null.
 */

export type { StaffRef } from '@/onboarding/types';

export const TIERS = ['A', 'B'] as const;
export type Tier = (typeof TIERS)[number];

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
export type OrganisationKind = (typeof ORGANISATION_KINDS)[number];

/** Where a relationship stands (outreach spec §2). */
export const RELATIONSHIP_STAGES = [
  'identified',
  'qualified',
  'contacted',
  'engaged',
  'ally',
  'declined',
  'dormant',
] as const;
export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

/** A contact in a campaign: the outreach CLI's statuses, in the order the board shows them. */
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
export type TargetStatus = (typeof TARGET_STATUSES)[number];

/** How a greeting addresses someone: neutral unless a person has checked (never guessed from a name). */
export const TREATMENTS = ['neutral', 'masculino', 'femenino'] as const;
export type Treatment = (typeof TREATMENTS)[number];

export const CAMPAIGN_STATUSES = ['draft', 'active', 'closed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** The outreach timeline's kinds (the database's `contact_event_kind`). */
export const CONTACT_EVENT_KINDS = [
  'created',
  'imported',
  'note',
  'stage_changed',
  'owner_changed',
  'status_changed',
  'sent',
  'reviewed',
  'shared',
] as const;
export type ContactEventKind = (typeof CONTACT_EVENT_KINDS)[number];

const oneOf =
  <T extends string>(list: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (list as readonly string[]).includes(value);

export const isTier = oneOf(TIERS);
export const isOrganisationKind = oneOf(ORGANISATION_KINDS);
export const isRelationshipStage = oneOf(RELATIONSHIP_STAGES);
export const isTargetStatus = oneOf(TARGET_STATUSES);
export const isTreatment = oneOf(TREATMENTS);
export const isCampaignStatus = oneOf(CAMPAIGN_STATUSES);

export interface OrganisationRef {
  id: string;
  name: string;
  kind: OrganisationKind;
}

/** A contact as lists show one: never an email or a phone. */
export interface ContactSummary {
  id: string;
  orgDisplay: string;
  organisation: OrganisationRef | null;
  personName: string | null;
  role: string | null;
  tier: Tier;
  territory: string | null;
  sector: string | null;
  stage: RelationshipStage;
  owner: StaffRef | null;
  needsReview: boolean;
  hold: boolean;
  tags: string[];
  anonymised: boolean;
  /** "Solo yo" (PLAN M5, step 6): the reader's own; nobody else sees it. */
  private: boolean;
}

export interface ContactDetail extends ContactSummary {
  organisationId: string | null;
  treatment: Treatment;
  greetingName: string | null;
  email: string | null;
  emailsExtra: string[];
  phone: string | null;
  website: string | null;
  scope: string | null;
  anchor: string | null;
  reason: string | null;
  sources: string[];
  holdReason: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CampaignRef {
  id: string;
  slug: string;
  name: string;
}

/** A campaign the contact is in, from the contact's page. */
export interface ContactTarget {
  id: string;
  campaign: CampaignRef;
  status: TargetStatus;
  sentAt: string | null;
  repliedAt: string | null;
  meetingAt: string | null;
}

export interface ContactEvent {
  id: string;
  kind: string;
  at: string;
  /** Who did it: a staff member, their id, or nobody known (a trigger, an import). */
  actor: StaffRef | string | null;
  channel: 'web' | 'bot' | null;
  campaignId: string | null;
  body: string | null;
  data: Record<string, unknown>;
  /** A note's day, when it happened another day than written (PLAN M5, step 6). */
  happenedOn: string | null;
  /** For the reader alone (PLAN M5, step 6). */
  private: boolean;
}

export interface ContactPage {
  contact: ContactDetail;
  targets: ContactTarget[];
  timeline: ContactEvent[];
}

export interface OrganisationItem {
  id: string;
  name: string;
  kind: OrganisationKind;
  territory: string | null;
  website: string | null;
  /** How many contacts it has that the reader sees. */
  contacts: number;
  private: boolean;
}

export interface Organisation {
  id: string;
  name: string;
  kind: OrganisationKind;
  territory: string | null;
  website: string | null;
  private: boolean;
  createdAt: string;
}

/** A note on an organisation's timeline (PLAN M5, step 6). */
export interface OrganisationNote {
  id: string;
  body: string | null;
  happenedOn: string | null;
  at: string;
  actor: StaffRef | string | null;
  channel: 'web' | 'bot' | null;
  private: boolean;
}

export interface OrganisationPage {
  organisation: Organisation;
  contacts: ContactSummary[];
  /** Newest first, by the day they happened. */
  notes: OrganisationNote[];
}

export interface CampaignItem {
  id: string;
  slug: string;
  name: string;
  status: CampaignStatus;
  language: string;
  owner: StaffRef | null;
  createdAt: string;
  counts: Partial<Record<TargetStatus, number>>;
}

export interface Campaign {
  id: string;
  slug: string;
  name: string;
  goal: string | null;
  language: string;
  fromName: string | null;
  fromEmail: string | null;
  signature: string;
  status: CampaignStatus;
  owner: StaffRef | null;
  createdAt: string;
}

export interface Template {
  tier: Tier;
  subject: string;
  body: string;
  maxWords: number | null;
  sources: string[];
  notes: string | null;
  version: number;
  updatedAt: string;
}

export interface Anchor {
  key: string;
  label: string;
  text: string;
  sources: string[];
}

export interface Target {
  id: string;
  contact: ContactSummary;
  status: TargetStatus;
  owner: StaffRef | null;
  priority: number | null;
  anchor: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  meetingAt: string | null;
  notes: string | null;
}

export interface CampaignPage {
  campaign: Campaign;
  templates: Template[];
  anchors: Anchor[];
  /** In send order. */
  targets: Target[];
}

export interface ProseIssue {
  rule: 'emDash' | 'enDash' | 'phrase';
  found: string;
  context: string;
  fatal: boolean;
}

/**
 * Why a letter can't be written (packages/domain/outreach). `unknown` is a kind this version of the page doesn't know
 * yet: a letter that isn't ok can't be sent whatever the reason, so the page still says there is one.
 */
export type LetterProblem =
  | { kind: 'needsReview' }
  | { kind: 'held' }
  | { kind: 'noTemplate'; tier: Tier }
  | { kind: 'unknownAnchor'; anchor: string }
  | { kind: 'unresolved'; fields: string[] }
  | { kind: 'prose'; issue: ProseIssue }
  | { kind: 'unknown' };

/** What a person should look at before sending. */
export type LetterWarning =
  | { kind: 'prose'; issue: ProseIssue }
  | { kind: 'long'; words: number; maxWords: number }
  | { kind: 'unknown' };

export type Letter =
  | {
      ok: true;
      subject: string;
      body: string;
      words: number;
      sources: string[];
      warnings: LetterWarning[];
    }
  | { ok: false; problems: LetterProblem[] };

/** A letter and what the sender needs to send it themselves: never sent by the app. */
export interface Handover {
  letter: Letter;
  to: string[];
  cc: string[];
  /** Only for a letter that is ok and a contact with an email. */
  mailto: string | null;
  /** A `wa.me` link with the body, when the contact has a phone. */
  whatsapp: string | null;
  templateVersion: number | null;
}

/** Siguiente: my next target, or nobody. */
export interface Next {
  target: Target | null;
  campaign: CampaignRef | null;
  handover: Handover | null;
  remaining: number;
  /** The targets skipped because their contact needs review or is held. */
  blocked: number;
}

export const IMPORT_COUNTS = [
  'organisations',
  'contacts',
  'targets',
  'templates',
  'anchors',
] as const;
export type ImportCount = (typeof IMPORT_COUNTS)[number];

export interface ImportProblem {
  file: string;
  line: number | null;
  message: string;
}

/** A problem stops the import; a warning doesn't. Their messages come in Spanish from the API, shown as given. */
export interface ImportResult {
  dryRun: boolean;
  counts: Partial<Record<ImportCount, number>>;
  problems: ImportProblem[];
  warnings: ImportProblem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): value is string => typeof value === 'string';

/** A string, or null for null or a field the API left out; undefined (not valid) for anything else. */
const nullable = (value: unknown): string | null | undefined =>
  value === undefined || value === null ? null : str(value) ? value : undefined;

const strings = (value: unknown): string[] | undefined =>
  value === undefined || value === null
    ? []
    : Array.isArray(value) && value.every(str)
      ? value
      : undefined;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** A whole number, or null for null or a field the API left out; undefined for anything else. */
const nullableInteger = (value: unknown): number | null | undefined =>
  value === undefined || value === null
    ? null
    : typeof value === 'number' && Number.isInteger(value)
      ? value
      : undefined;

/** A list whose every item parses, or undefined. */
const every = <T>(value: unknown, parse: (item: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === undefined) {
      return undefined;
    }
    out.push(parsed);
  }
  return out;
};

const nullableRef = (value: unknown): StaffRef | null | undefined =>
  value === undefined || value === null
    ? null
    : (parseStaffRef(value) ??
      // A staff member whose name the API couldn't give: still someone, by their id.
      (isRecord(value) && str(value.userId) && value.displayName === null
        ? { userId: value.userId, displayName: '' }
        : undefined));

/** A staff member as an event names one: their reference, their id (when the API has no name), or nobody. */
const refOrId = (value: unknown): StaffRef | string | null | undefined => {
  if (value === undefined || value === null) {
    return null;
  }
  if (str(value)) {
    return value;
  }
  const ref = nullableRef(value);
  return ref && ref.displayName === '' ? ref.userId : ref;
};

const parseOrganisationRef = (value: unknown): OrganisationRef | null | undefined => {
  if (value === undefined || value === null) {
    return null;
  }
  return isRecord(value) && str(value.id) && str(value.name) && isOrganisationKind(value.kind)
    ? { id: value.id, name: value.name, kind: value.kind }
    : undefined;
};

const summaryOf = (value: Record<string, unknown>): ContactSummary | undefined => {
  const organisation = parseOrganisationRef(value.organisation);
  const personName = nullable(value.personName);
  const role = nullable(value.role);
  const territory = nullable(value.territory);
  const sector = nullable(value.sector);
  const owner = nullableRef(value.owner);
  const tags = strings(value.tags);
  if (
    !str(value.id) ||
    !str(value.orgDisplay) ||
    !isTier(value.tier) ||
    !isRelationshipStage(value.stage) ||
    organisation === undefined ||
    personName === undefined ||
    role === undefined ||
    territory === undefined ||
    sector === undefined ||
    owner === undefined ||
    tags === undefined
  ) {
    return undefined;
  }
  return {
    id: value.id,
    orgDisplay: value.orgDisplay,
    organisation,
    personName,
    role,
    tier: value.tier,
    territory,
    sector,
    stage: value.stage,
    owner,
    needsReview: value.needsReview === true,
    hold: value.hold === true,
    tags,
    anonymised: value.anonymised === true,
    private: value.private === true,
  };
};

export const parseContactSummary = (value: unknown): ContactSummary | undefined =>
  isRecord(value) ? summaryOf(value) : undefined;

export const parseContactDetail = (value: unknown): ContactDetail | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const summary = summaryOf(value);
  const organisationId = nullable(value.organisationId);
  const greetingName = nullable(value.greetingName);
  const email = nullable(value.email);
  const emailsExtra = strings(value.emailsExtra);
  const phone = nullable(value.phone);
  const website = nullable(value.website);
  const scope = nullable(value.scope);
  const anchor = nullable(value.anchor);
  const reason = nullable(value.reason);
  const sources = strings(value.sources);
  const holdReason = nullable(value.holdReason);
  const notes = nullable(value.notes);
  const treatment =
    value.treatment === undefined || value.treatment === null ? 'neutral' : value.treatment;
  if (
    !summary ||
    !isTreatment(treatment) ||
    organisationId === undefined ||
    greetingName === undefined ||
    email === undefined ||
    emailsExtra === undefined ||
    phone === undefined ||
    website === undefined ||
    scope === undefined ||
    anchor === undefined ||
    reason === undefined ||
    sources === undefined ||
    holdReason === undefined ||
    notes === undefined
  ) {
    return undefined;
  }
  return {
    ...summary,
    organisationId: organisationId ?? summary.organisation?.id ?? null,
    treatment,
    greetingName,
    email,
    emailsExtra,
    phone,
    website,
    scope,
    anchor,
    reason,
    sources,
    holdReason,
    notes,
    createdAt: str(value.createdAt) ? value.createdAt : '',
  };
};

export const parseCampaignRef = (value: unknown): CampaignRef | undefined =>
  isRecord(value) && str(value.id) && str(value.name)
    ? { id: value.id, slug: str(value.slug) ? value.slug : '', name: value.name }
    : undefined;

const parseContactTarget = (value: unknown): ContactTarget | undefined => {
  if (!isRecord(value) || !str(value.id) || !isTargetStatus(value.status)) {
    return undefined;
  }
  const campaign = parseCampaignRef(value.campaign);
  const sentAt = nullable(value.sentAt);
  const repliedAt = nullable(value.repliedAt);
  const meetingAt = nullable(value.meetingAt);
  return campaign && sentAt !== undefined && repliedAt !== undefined && meetingAt !== undefined
    ? { id: value.id, campaign, status: value.status, sentAt, repliedAt, meetingAt }
    : undefined;
};

export const parseContactEvent = (value: unknown): ContactEvent | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.kind) || !str(value.at)) {
    return undefined;
  }
  const actor = refOrId(value.actor);
  const campaignId = nullable(value.campaignId);
  const body = nullable(value.body);
  const happenedOn = nullable(value.happenedOn);
  if (
    actor === undefined ||
    campaignId === undefined ||
    body === undefined ||
    happenedOn === undefined
  ) {
    return undefined;
  }
  return {
    id: value.id,
    kind: value.kind,
    at: value.at,
    actor,
    channel: value.channel === 'web' || value.channel === 'bot' ? value.channel : null,
    campaignId,
    body,
    data: isRecord(value.data) ? value.data : {},
    happenedOn,
    private: value.private === true,
  };
};

/** `GET /api/outreach/contacts/:id`'s body. */
export const parseContactPage = (body: unknown): ContactPage | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const contact = parseContactDetail(body.contact);
  const targets = body.targets === undefined ? [] : every(body.targets, parseContactTarget);
  const timeline = body.timeline === undefined ? [] : every(body.timeline, parseContactEvent);
  return contact && targets && timeline ? { contact, targets, timeline } : undefined;
};

/** `GET /api/outreach/contacts`'s body. */
export const parseContacts = (body: unknown): ContactSummary[] | undefined =>
  isRecord(body) ? every(body.contacts, parseContactSummary) : undefined;

const parseOrganisationItem = (value: unknown): OrganisationItem | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.name) || !isOrganisationKind(value.kind)) {
    return undefined;
  }
  const territory = nullable(value.territory);
  const website = nullable(value.website);
  return territory === undefined || website === undefined
    ? undefined
    : {
        id: value.id,
        name: value.name,
        kind: value.kind,
        territory,
        website,
        contacts: isCount(value.contacts) ? value.contacts : 0,
        private: value.private === true,
      };
};

/** `GET /api/outreach/organisations`'s body. */
export const parseOrganisations = (body: unknown): OrganisationItem[] | undefined =>
  isRecord(body) ? every(body.organisations, parseOrganisationItem) : undefined;

const parseOrganisation = (value: unknown): Organisation | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.name) || !isOrganisationKind(value.kind)) {
    return undefined;
  }
  const territory = nullable(value.territory);
  const website = nullable(value.website);
  return territory === undefined || website === undefined
    ? undefined
    : {
        id: value.id,
        name: value.name,
        kind: value.kind,
        territory,
        website,
        private: value.private === true,
        createdAt: str(value.createdAt) ? value.createdAt : '',
      };
};

const parseOrganisationNote = (value: unknown): OrganisationNote | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.at)) {
    return undefined;
  }
  const body = nullable(value.body);
  const happenedOn = nullable(value.happenedOn);
  const actor = refOrId(value.actor);
  return body === undefined || happenedOn === undefined || actor === undefined
    ? undefined
    : {
        id: value.id,
        body,
        happenedOn,
        at: value.at,
        actor,
        channel: value.channel === 'web' || value.channel === 'bot' ? value.channel : null,
        private: value.private === true,
      };
};

/** `GET /api/outreach/organisations/:id`'s body. */
export const parseOrganisationPage = (body: unknown): OrganisationPage | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const organisation = parseOrganisation(body.organisation);
  const contacts = body.contacts === undefined ? [] : every(body.contacts, parseContactSummary);
  const notes = body.notes === undefined ? [] : every(body.notes, parseOrganisationNote);
  return organisation && contacts && notes ? { organisation, contacts, notes } : undefined;
};

/** A campaign's targets by status: the numbers only, under a status the page knows. */
export const statusCounts = (value: unknown): Partial<Record<TargetStatus, number>> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [TargetStatus, number] => isTargetStatus(entry[0]) && isCount(entry[1]),
        ),
      )
    : {};

const parseCampaignItem = (value: unknown): CampaignItem | undefined => {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    !str(value.slug) ||
    !str(value.name) ||
    !isCampaignStatus(value.status)
  ) {
    return undefined;
  }
  const owner = nullableRef(value.owner);
  return owner === undefined
    ? undefined
    : {
        id: value.id,
        slug: value.slug,
        name: value.name,
        status: value.status,
        language: str(value.language) ? value.language : '',
        owner,
        createdAt: str(value.createdAt) ? value.createdAt : '',
        counts: statusCounts(value.counts),
      };
};

/** `GET /api/outreach/campaigns`'s body. */
export const parseCampaigns = (body: unknown): CampaignItem[] | undefined =>
  isRecord(body) ? every(body.campaigns, parseCampaignItem) : undefined;

const parseCampaign = (value: unknown): Campaign | undefined => {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    !str(value.slug) ||
    !str(value.name) ||
    !isCampaignStatus(value.status)
  ) {
    return undefined;
  }
  const goal = nullable(value.goal);
  const fromName = nullable(value.fromName);
  const fromEmail = nullable(value.fromEmail);
  const signature = nullable(value.signature);
  const owner = nullableRef(value.owner);
  if (
    goal === undefined ||
    fromName === undefined ||
    fromEmail === undefined ||
    signature === undefined ||
    owner === undefined
  ) {
    return undefined;
  }
  return {
    id: value.id,
    slug: value.slug,
    name: value.name,
    goal,
    language: str(value.language) ? value.language : '',
    fromName,
    fromEmail,
    signature: signature ?? '',
    status: value.status,
    owner,
    createdAt: str(value.createdAt) ? value.createdAt : '',
  };
};

const parseTemplate = (value: unknown): Template | undefined => {
  if (!isRecord(value) || !isTier(value.tier) || !str(value.subject) || !str(value.body)) {
    return undefined;
  }
  const maxWords = nullableInteger(value.maxWords);
  const sources = strings(value.sources);
  const notes = nullable(value.notes);
  return maxWords === undefined || sources === undefined || notes === undefined
    ? undefined
    : {
        tier: value.tier,
        subject: value.subject,
        body: value.body,
        maxWords,
        sources,
        notes,
        version: isCount(value.version) ? value.version : 1,
        updatedAt: str(value.updatedAt) ? value.updatedAt : '',
      };
};

const parseAnchor = (value: unknown): Anchor | undefined => {
  if (!isRecord(value) || !str(value.key) || !str(value.label) || !str(value.text)) {
    return undefined;
  }
  const sources = strings(value.sources);
  return sources ? { key: value.key, label: value.label, text: value.text, sources } : undefined;
};

export const parseTarget = (value: unknown): Target | undefined => {
  if (!isRecord(value) || !str(value.id) || !isTargetStatus(value.status)) {
    return undefined;
  }
  const contact = parseContactSummary(value.contact);
  const owner = nullableRef(value.owner);
  const priority = nullableInteger(value.priority);
  const anchor = nullable(value.anchor);
  const nextAction = nullable(value.nextAction);
  const nextActionDue = nullable(value.nextActionDue);
  const sentAt = nullable(value.sentAt);
  const repliedAt = nullable(value.repliedAt);
  const meetingAt = nullable(value.meetingAt);
  const notes = nullable(value.notes);
  if (
    !contact ||
    owner === undefined ||
    priority === undefined ||
    anchor === undefined ||
    nextAction === undefined ||
    nextActionDue === undefined ||
    sentAt === undefined ||
    repliedAt === undefined ||
    meetingAt === undefined ||
    notes === undefined
  ) {
    return undefined;
  }
  return {
    id: value.id,
    contact,
    status: value.status,
    owner,
    priority,
    anchor,
    nextAction,
    nextActionDue,
    sentAt,
    repliedAt,
    meetingAt,
    notes,
  };
};

/** `GET /api/outreach/campaigns/:id`'s body. */
export const parseCampaignPage = (body: unknown): CampaignPage | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const campaign = parseCampaign(body.campaign);
  const templates = body.templates === undefined ? [] : every(body.templates, parseTemplate);
  const anchors = body.anchors === undefined ? [] : every(body.anchors, parseAnchor);
  const targets = body.targets === undefined ? [] : every(body.targets, parseTarget);
  return campaign && templates && anchors && targets
    ? { campaign, templates, anchors, targets }
    : undefined;
};

const PROSE_RULES: readonly unknown[] = ['emDash', 'enDash', 'phrase'];

const parseIssue = (value: unknown): ProseIssue | undefined =>
  isRecord(value) && PROSE_RULES.includes(value.rule) && str(value.found) && str(value.context)
    ? {
        rule: value.rule === 'emDash' ? 'emDash' : value.rule === 'enDash' ? 'enDash' : 'phrase',
        found: value.found,
        context: value.context,
        fatal: value.fatal === true,
      }
    : undefined;

/** One problem; one of a kind the page doesn't know reads as `unknown`, but a known kind must be whole. */
export const parseProblem = (value: unknown): LetterProblem | undefined => {
  if (!isRecord(value) || !str(value.kind)) {
    return undefined;
  }
  switch (value.kind) {
    case 'needsReview':
      return { kind: 'needsReview' };
    case 'held':
      return { kind: 'held' };
    case 'noTemplate':
      return isTier(value.tier) ? { kind: 'noTemplate', tier: value.tier } : undefined;
    case 'unknownAnchor':
      return str(value.anchor) ? { kind: 'unknownAnchor', anchor: value.anchor } : undefined;
    case 'unresolved': {
      const fields = strings(value.fields);
      return fields ? { kind: 'unresolved', fields } : undefined;
    }
    case 'prose': {
      const issue = parseIssue(value.issue);
      return issue ? { kind: 'prose', issue } : undefined;
    }
    default:
      return { kind: 'unknown' };
  }
};

export const parseWarning = (value: unknown): LetterWarning | undefined => {
  if (!isRecord(value) || !str(value.kind)) {
    return undefined;
  }
  switch (value.kind) {
    case 'prose': {
      const issue = parseIssue(value.issue);
      return issue ? { kind: 'prose', issue } : undefined;
    }
    case 'long':
      return isCount(value.words) && isCount(value.maxWords)
        ? { kind: 'long', words: value.words, maxWords: value.maxWords }
        : undefined;
    default:
      return { kind: 'unknown' };
  }
};

export const parseLetter = (value: unknown): Letter | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.ok === false) {
    const problems = every(value.problems, parseProblem);
    return problems && problems.length > 0 ? { ok: false, problems } : undefined;
  }
  if (value.ok !== true || !str(value.subject) || !str(value.body)) {
    return undefined;
  }
  const sources = strings(value.sources);
  const warnings = value.warnings === undefined ? [] : every(value.warnings, parseWarning);
  return sources && warnings
    ? {
        ok: true,
        subject: value.subject,
        body: value.body,
        words: isCount(value.words) ? value.words : 0,
        sources,
        warnings,
      }
    : undefined;
};

/** A letter with its handover: the target's letter or a preview, as is or under `handover`. */
export const parseHandover = (body: unknown): Handover | undefined => {
  const value = isRecord(body) && isRecord(body.handover) ? body.handover : body;
  if (!isRecord(value)) {
    return undefined;
  }
  const letter = parseLetter(value.letter);
  const to = strings(value.to);
  const cc = strings(value.cc);
  const mailto = nullable(value.mailto);
  const whatsapp = nullable(value.whatsapp);
  const templateVersion = nullableInteger(value.templateVersion);
  if (
    !letter ||
    to === undefined ||
    cc === undefined ||
    mailto === undefined ||
    whatsapp === undefined ||
    templateVersion === undefined
  ) {
    return undefined;
  }
  return {
    letter,
    to,
    cc,
    // Only a letter that is ok may be opened in a mail client, whatever the answer says.
    mailto: letter.ok && mailto?.startsWith('mailto:') ? mailto : null,
    whatsapp: whatsapp?.startsWith('https://') ? whatsapp : null,
    templateVersion,
  };
};

/** `GET /api/outreach/next`'s body. */
export const parseNext = (body: unknown): Next | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const target =
    body.target === undefined || body.target === null ? null : parseTarget(body.target);
  const campaign =
    body.campaign === undefined || body.campaign === null ? null : parseCampaignRef(body.campaign);
  const handover =
    body.handover === undefined || body.handover === null ? null : parseHandover(body.handover);
  if (target === undefined || campaign === undefined || handover === undefined) {
    return undefined;
  }
  return {
    target,
    campaign,
    handover,
    remaining: isCount(body.remaining) ? body.remaining : 0,
    blocked: isCount(body.blocked) ? body.blocked : 0,
  };
};

const parseImportProblem = (value: unknown): ImportProblem | undefined =>
  isRecord(value) && str(value.message)
    ? {
        file: str(value.file) ? value.file : '',
        line: isCount(value.line) ? value.line : null,
        message: value.message,
      }
    : undefined;

/** `POST /api/outreach/import`'s body: a dry run's, an import's, or a refusal's (422) alike. */
export const parseImportResult = (body: unknown): ImportResult | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const problems = body.problems === undefined ? [] : every(body.problems, parseImportProblem);
  const warnings = body.warnings === undefined ? [] : every(body.warnings, parseImportProblem);
  if (!problems || !warnings) {
    return undefined;
  }
  const source = isRecord(body.counts) ? body.counts : {};
  const counts: Partial<Record<ImportCount, number>> = {};
  for (const key of IMPORT_COUNTS) {
    const value = source[key];
    if (isCount(value)) {
      counts[key] = value;
    }
  }
  return { dryRun: body.dryRun !== false, counts, problems, warnings };
};

/** `201 { id }`: the new row's id. */
export const createdId = (body: unknown): string | undefined =>
  isRecord(body) && str(body.id) ? body.id : undefined;

/** `201 { added }` from adding targets. */
export const addedCount = (body: unknown): number | undefined =>
  isRecord(body) && isCount(body.added) ? body.added : undefined;

/** The fields a template refusal names (`400 { error: 'invalid', field: 'body', fields }`). */
export const refusedFields = (body: unknown): string[] =>
  isRecord(body) && Array.isArray(body.fields) ? body.fields.filter(str) : [];

/** A contact a rights request found (PLAN M5, step 6): private ones too, for an admin to export or erase. */
export interface RightsContact {
  id: string;
  orgDisplay: string;
  personName: string | null;
  private: boolean;
}

const parseRightsContact = (value: unknown): RightsContact | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.orgDisplay)) {
    return undefined;
  }
  const personName = nullable(value.personName);
  return personName === undefined
    ? undefined
    : { id: value.id, orgDisplay: value.orgDisplay, personName, private: value.private === true };
};

/** `GET /api/outreach/rights`'s body. */
export const parseRightsContacts = (body: unknown): RightsContact[] | undefined =>
  isRecord(body) ? every(body.contacts, parseRightsContact) : undefined;
