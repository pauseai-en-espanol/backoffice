import {
  type Campaign,
  type ContactDetail,
  isCampaignStatus,
  isOrganisationKind,
  isRelationshipStage,
  isTargetStatus,
  isTier,
  isTreatment,
  type Organisation,
  type OrganisationKind,
  type Target,
} from './types';

/**
 * What the outreach forms send: trimmed, in the API's shapes (docs/spec/staff-api.md, M3), and for a change only what
 * changed, an emptied field as null. Pure, so it is tested here; `read` gives a form field's text as typed.
 */

type Read = (name: string) => string;

/** A list typed one item a line (sources, extra emails), or with commas (tags): no blanks, no repeats. */
export const listFrom = (value: string, separator: string | RegExp = /\r?\n/u): string[] => [
  ...new Set(
    value
      .split(separator)
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  ),
];

/** A text field as the API takes it: trimmed, and null when emptied. */
const optional = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** A checkbox: ticked, or not. */
const ticked = (value: string): boolean => value !== '';

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** A positive whole number as typed, null when empty; undefined when it isn't one. */
export const positiveInteger = (value: string): number | null | undefined => {
  const text = value.trim();
  if (text === '') {
    return null;
  }
  const number = Number(text);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

/** What `POST /api/outreach/contacts` takes. */
export interface ContactInput {
  organisationId?: string | null;
  orgDisplay?: string;
  personName?: string | null;
  role?: string | null;
  treatment?: string;
  greetingName?: string | null;
  email?: string | null;
  emailsExtra?: string[];
  phone?: string | null;
  website?: string | null;
  territory?: string | null;
  scope?: string | null;
  sector?: string | null;
  tier?: string;
  anchor?: string | null;
  tags?: string[];
  stage?: string;
  ownerId?: string | null;
  reason?: string | null;
  sources?: string[];
  needsReview?: boolean;
  hold?: boolean;
  holdReason?: string | null;
  notes?: string | null;
  /** "Solo yo" (PLAN M5, step 6): only when made, and false to share it with the team. */
  private?: boolean;
}

/** The free-text fields a contact's form has, each sent trimmed or null. */
const CONTACT_TEXTS = [
  'personName',
  'role',
  'greetingName',
  'email',
  'phone',
  'website',
  'territory',
  'scope',
  'sector',
  'anchor',
  'reason',
  'holdReason',
  'notes',
] as const;

/** A new contact from its form: what was filled in, nothing for what wasn't. */
export const newContact = (read: Read): ContactInput => {
  const input: ContactInput = { orgDisplay: read('orgDisplay').trim() };
  for (const key of CONTACT_TEXTS) {
    const value = optional(read(key));
    if (value !== null) {
      input[key] = value;
    }
  }
  const organisationId = optional(read('organisationId'));
  if (organisationId !== null) {
    input.organisationId = organisationId;
  }
  const ownerId = optional(read('ownerId'));
  if (ownerId !== null) {
    input.ownerId = ownerId;
  }
  const treatment = read('treatment');
  input.treatment = isTreatment(treatment) ? treatment : 'neutral';
  const tier = read('tier');
  if (isTier(tier)) {
    input.tier = tier;
  }
  const stage = read('stage');
  if (isRelationshipStage(stage)) {
    input.stage = stage;
  }
  for (const [key, list] of [
    ['emailsExtra', listFrom(read('emailsExtra'))],
    ['tags', listFrom(read('tags'), ',')],
    ['sources', listFrom(read('sources'))],
  ] as const) {
    if (list.length > 0) {
      input[key] = list;
    }
  }
  input.needsReview = ticked(read('needsReview'));
  input.hold = ticked(read('hold'));
  if (!input.hold) {
    delete input.holdReason;
  }
  if (read('visibility') === 'private') {
    input.private = true;
  }
  return input;
};

/**
 * Whether a contact may leave review as it stands: without a reason and at least one source it must stay "por
 * revisar" (the database's check, outreach spec §1).
 */
export const mustStayInReview = (contact: {
  reason?: string | null;
  sources?: readonly string[];
}): boolean => (contact.reason ?? '').trim() === '' || (contact.sources ?? []).length === 0;

/** The fields the contact's edit form shows (review and hold have their own panels). */
export const EDITED_TEXTS = CONTACT_TEXTS.filter((key) => key !== 'holdReason');

/** A contact's changes from its edit form: only what changed, an emptied field as null. */
export const contactChange = (contact: ContactDetail, read: Read): ContactInput => {
  const change: ContactInput = {};
  const orgDisplay = read('orgDisplay').trim();
  if (orgDisplay !== contact.orgDisplay) {
    change.orgDisplay = orgDisplay;
  }
  for (const key of EDITED_TEXTS) {
    const value = optional(read(key));
    if (value !== contact[key]) {
      change[key] = value;
    }
  }
  const organisationId = optional(read('organisationId'));
  if (organisationId !== contact.organisationId) {
    change.organisationId = organisationId;
  }
  const ownerId = optional(read('ownerId'));
  if (ownerId !== (contact.owner?.userId ?? null)) {
    change.ownerId = ownerId;
  }
  const treatment = read('treatment');
  if (isTreatment(treatment) && treatment !== contact.treatment) {
    change.treatment = treatment;
  }
  const tier = read('tier');
  if (isTier(tier) && tier !== contact.tier) {
    change.tier = tier;
  }
  const stage = read('stage');
  if (isRelationshipStage(stage) && stage !== contact.stage) {
    change.stage = stage;
  }
  const emailsExtra = listFrom(read('emailsExtra'));
  if (!sameList(emailsExtra, contact.emailsExtra)) {
    change.emailsExtra = emailsExtra;
  }
  const tags = listFrom(read('tags'), ',');
  if (!sameList(tags, contact.tags)) {
    change.tags = tags;
  }
  const sources = listFrom(read('sources'));
  if (!sameList(sources, contact.sources)) {
    change.sources = sources;
  }
  return change;
};

/** What `POST /api/outreach/campaigns` takes. */
export interface CampaignInput {
  slug?: string;
  name?: string;
  goal?: string | null;
  language?: string;
  fromName?: string | null;
  fromEmail?: string | null;
  signature?: string;
  status?: string;
  ownerId?: string | null;
}

const CAMPAIGN_TEXTS = ['goal', 'fromName', 'fromEmail'] as const;

/** A new campaign from its form. The language is Spanish unless said otherwise. */
export const newCampaign = (read: Read): CampaignInput => {
  const input: CampaignInput = {
    slug: read('slug').trim().toLowerCase(),
    name: read('name').trim(),
    language: read('language').trim().toLowerCase() || 'es',
  };
  for (const key of CAMPAIGN_TEXTS) {
    const value = optional(read(key));
    if (value !== null) {
      input[key] = value;
    }
  }
  const signature = read('signature').trim();
  if (signature !== '') {
    input.signature = signature;
  }
  return input;
};

/** A campaign's changes: only what changed (never its slug). */
export const campaignChange = (campaign: Campaign, read: Read): CampaignInput => {
  const change: CampaignInput = {};
  const name = read('name').trim();
  if (name !== campaign.name) {
    change.name = name;
  }
  const language = read('language').trim().toLowerCase();
  if (language !== '' && language !== campaign.language) {
    change.language = language;
  }
  for (const key of CAMPAIGN_TEXTS) {
    const value = optional(read(key));
    if (value !== campaign[key]) {
      change[key] = value;
    }
  }
  const signature = read('signature').trim();
  if (signature !== campaign.signature) {
    change.signature = signature;
  }
  const status = read('status');
  if (isCampaignStatus(status) && status !== campaign.status) {
    change.status = status;
  }
  const ownerId = optional(read('ownerId'));
  if (ownerId !== (campaign.owner?.userId ?? null)) {
    change.ownerId = ownerId;
  }
  return change;
};

/** What `PUT /api/outreach/campaigns/:id/templates/:tier` takes: the whole template. */
export interface TemplateInput {
  subject: string;
  body: string;
  maxWords?: number;
  sources: string[];
  notes?: string;
}

/** A template from its form; undefined when the word limit isn't a positive whole number. */
export const templateInput = (read: Read): TemplateInput | undefined => {
  const maxWords = positiveInteger(read('maxWords'));
  if (maxWords === undefined) {
    return undefined;
  }
  const notes = read('notes').trim();
  return {
    subject: read('subject').trim(),
    // The body keeps its own line breaks and spacing: it is the letter.
    body: read('body').replaceAll(/\r\n/gu, '\n').trim(),
    ...(maxWords === null ? {} : { maxWords }),
    sources: listFrom(read('sources')),
    ...(notes === '' ? {} : { notes }),
  };
};

/** What `PUT /api/outreach/campaigns/:id/anchors/:key` takes. */
export interface AnchorInput {
  label: string;
  text: string;
  sources: string[];
}

export const anchorInput = (read: Read): AnchorInput => ({
  label: read('label').trim(),
  text: read('text').replaceAll(/\r\n/gu, '\n').trim(),
  sources: listFrom(read('sources')),
});

/** An anchor's key, as the database takes it. */
export const ANCHOR_KEY = /^[a-z0-9_-]{1,60}$/u;

/** A campaign's slug, as the database takes it. */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;

/** What `PATCH /api/outreach/targets/:id` takes. */
export interface TargetChange {
  status?: string;
  ownerId?: string | null;
  priority?: number | null;
  anchor?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
  notes?: string | null;
}

/** A target's changes from its form; undefined when the priority isn't a positive whole number. */
export const targetChange = (target: Target, read: Read): TargetChange | undefined => {
  const priority = positiveInteger(read('priority'));
  if (priority === undefined) {
    return undefined;
  }
  const change: TargetChange = {};
  const status = read('status');
  if (isTargetStatus(status) && status !== target.status) {
    change.status = status;
  }
  const ownerId = optional(read('ownerId'));
  if (ownerId !== (target.owner?.userId ?? null)) {
    change.ownerId = ownerId;
  }
  if (priority !== target.priority) {
    change.priority = priority;
  }
  for (const key of ['anchor', 'nextAction', 'nextActionDue', 'notes'] as const) {
    const value = optional(read(key));
    if (value !== target[key]) {
      change[key] = value;
    }
  }
  return change;
};

/** What `POST /api/outreach/organisations` takes. */
export interface OrganisationInput {
  name?: string;
  kind?: OrganisationKind;
  territory?: string | null;
  website?: string | null;
  /** "Solo yo" (PLAN M5, step 6): only when made, and false to share it with the team. */
  private?: boolean;
}

const ORGANISATION_TEXTS = ['territory', 'website'] as const;

export const newOrganisation = (read: Read): OrganisationInput => {
  const kind = read('kind');
  const input: OrganisationInput = {
    name: read('name').trim(),
    kind: isOrganisationKind(kind) ? kind : 'other',
  };
  for (const key of ORGANISATION_TEXTS) {
    const value = optional(read(key));
    if (value !== null) {
      input[key] = value;
    }
  }
  if (read('visibility') === 'private') {
    input.private = true;
  }
  return input;
};

export const organisationChange = (organisation: Organisation, read: Read): OrganisationInput => {
  const change: OrganisationInput = {};
  const name = read('name').trim();
  if (name !== organisation.name) {
    change.name = name;
  }
  const kind = read('kind');
  if (isOrganisationKind(kind) && kind !== organisation.kind) {
    change.kind = kind;
  }
  for (const key of ORGANISATION_TEXTS) {
    const value = optional(read(key));
    if (value !== organisation[key]) {
      change[key] = value;
    }
  }
  return change;
};
