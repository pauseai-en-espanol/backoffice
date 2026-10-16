import type { getTranslator } from '@backoffice/i18n/messages';

import { MERGE_FIELDS } from '@backoffice/domain/outreach';

import type { Staff } from '@/session';
import type { TeamMember } from '@/team/data';

import { IMPORT_FILE_KINDS, type LetterWords } from './format';
import {
  CAMPAIGN_STATUSES,
  ORGANISATION_KINDS,
  RELATIONSHIP_STAGES,
  type StaffRef,
  TARGET_STATUSES,
  TIERS,
  TREATMENTS,
} from './types';

type Translator = ReturnType<typeof getTranslator>;

/**
 * The outreach vocabulary in Spanish, as plain maps a server page hands to its client components (which ship no
 * message formatter), and who may use the outreach pages. Templates keep their `{name}` placeholders, which the
 * components fill (fill.ts).
 */

const labels = <K extends string>(keys: readonly K[], word: (key: K) => string) =>
  Object.fromEntries(keys.map((key) => [key, word(key)])) as Record<K, string>;

export const kindNames = (t: Translator) =>
  labels(ORGANISATION_KINDS, (kind) => t(`outreach.kinds.${kind}`));

export const stageNames = (t: Translator) =>
  labels(RELATIONSHIP_STAGES, (stage) => t(`outreach.stages.${stage}`));

export const stageHints = (t: Translator) =>
  labels(RELATIONSHIP_STAGES, (stage) => t(`outreach.stageHints.${stage}`));

export const statusNames = (t: Translator) =>
  labels(TARGET_STATUSES, (status) => t(`outreach.statuses.${status}`));

export const treatmentNames = (t: Translator) =>
  labels(TREATMENTS, (treatment) => t(`outreach.treatments.${treatment}`));

export const campaignStatusNames = (t: Translator) =>
  labels(CAMPAIGN_STATUSES, (status) => t(`outreach.campaignStatuses.${status}`));

export const tierNames = (t: Translator) => labels(TIERS, (tier) => t(`outreach.tiers.${tier}`));

/** The outreach repo's files, by what each holds (the importer). */
export const importFileNames = (t: Translator) =>
  labels(IMPORT_FILE_KINDS, (kind) => t(`campaignImport.kinds.${kind}`));

/** The words a contact's line in a list uses (ContactItem). */
export const summaryWords = (t: Translator) => ({
  stages: stageNames(t),
  kinds: kindNames(t),
  inbox: String(t.raw('outreach.summary.inbox')),
  anonymised: t('outreach.summary.anonymised'),
  needsReview: t('outreach.summary.needsReview'),
  held: t('outreach.summary.held'),
  tier: String(t.raw('outreach.summary.tier')),
  owner: t('outreach.summary.owner'),
  noOwner: t('outreach.summary.noOwner'),
  territory: t('outreach.summary.territory'),
  relationship: t('outreach.summary.relationship'),
  /** "Solo tú lo ves" (PLAN M5, step 6). */
  private: t('outreach.private.mark'),
});

export type SummaryWords = ReturnType<typeof summaryWords>;

/**
 * Every refusal an outreach write can meet, in Spanish, by the API's code (write.ts messageFor), and the fields an
 * `invalid` may name.
 */
export const outreachErrors = (t: Translator): Record<string, string> => ({
  unexpected: t('errors.unexpected'),
  forbidden: t('errors.forbidden'),
  stale: t('errors.stale'),
  incomplete: t('errors.incomplete'),
  taken: t('outreach.errors.taken'),
  linked: t('errors.linked'),
  invalid: t('errors.invalid'),
  limit: t('errors.limit'),
  signIn: t('errors.signIn'),
  notFound: t('errors.notFound'),
  network: t('errors.network'),
  unavailable: t('web.unavailable.body'),
  needsReview: t('outreach.errors.needsReview'),
  sent: t('outreach.errors.sent'),
  // Private records (PLAN M5, step 6).
  shared: t('outreach.private.errors.shared'),
  organisationPrivate: t('outreach.private.errors.organisationPrivate'),
  private: t('outreach.private.errors.private'),
  inUse: t('outreach.errors.inUse'),
  reason: t('outreach.fields.reason'),
  sources: t('outreach.fields.sources'),
  orgDisplay: t('outreach.fields.orgDisplay'),
  email: t('outreach.fields.email'),
  emailsExtra: t('outreach.fields.emailsExtra'),
  phone: t('outreach.fields.phone'),
  website: t('outreach.fields.website'),
  anchor: t('outreach.fields.anchor'),
  tags: t('outreach.fields.tags'),
  name: t('outreach.fields.name'),
  slug: t('outreach.fields.slug'),
  language: t('outreach.fields.language'),
  fromEmail: t('outreach.fields.fromEmail'),
  signature: t('outreach.fields.signature'),
  subject: t('outreach.fields.subject'),
  body: t('outreach.fields.body'),
  maxWords: t('outreach.fields.maxWords'),
  label: t('outreach.fields.label'),
  text: t('outreach.fields.text'),
  key: t('outreach.fields.key'),
  priority: t('outreach.fields.priority'),
  nextActionDue: t('outreach.fields.nextActionDue'),
  status: t('outreach.fields.status'),
  ownerId: t('outreach.fields.ownerId'),
  organisationId: t('outreach.fields.organisationId'),
  contactIds: t('outreach.fields.contactIds'),
});

/** A letter's words (LetterView): its parts, its problems and warnings, and the sender's buttons. */
export const letterWords = (t: Translator) => {
  const raw = (key: Parameters<Translator['raw']>[0]) => String(t.raw(key));
  const words: LetterWords = {
    needsReview: t('outreach.letter.needsReview'),
    held: t('outreach.letter.held'),
    noTemplate: raw('outreach.letter.noTemplate'),
    unknownAnchor: raw('outreach.letter.unknownAnchor'),
    unresolved: raw('outreach.letter.unresolved'),
    emDash: raw('outreach.letter.emDash'),
    enDash: raw('outreach.letter.enDash'),
    phrase: raw('outreach.letter.phrase'),
    long: raw('outreach.letter.long'),
    unknownProblem: t('outreach.letter.unknownProblem'),
    unknownWarning: t('outreach.letter.unknownWarning'),
    fields: labels(MERGE_FIELDS, (field) => t(`outreach.letter.fields.${field}`)),
  };
  return {
    ...words,
    title: t('outreach.letter.title'),
    subject: t('outreach.letter.subject'),
    body: t('outreach.letter.body'),
    to: t('outreach.letter.to'),
    cc: t('outreach.letter.cc'),
    words: raw('outreach.letter.words'),
    sources: t('outreach.letter.sources'),
    noSources: t('outreach.letter.noSources'),
    warnings: t('outreach.letter.warnings'),
    problemsTitle: t('outreach.letter.problemsTitle'),
    fix: {
      contact: t('outreach.letter.fix.contact'),
      campaign: t('outreach.letter.fix.campaign'),
      templates: t('outreach.letter.fix.templates'),
      anchors: t('outreach.letter.fix.anchors'),
    },
    send: t('outreach.letter.send'),
    openMail: t('outreach.letter.openMail'),
    mailHint: t('outreach.letter.mailHint'),
    noEmail: t('outreach.letter.noEmail'),
    copyTo: t('outreach.letter.copyTo'),
    copyCc: t('outreach.letter.copyCc'),
    copySubject: t('outreach.letter.copySubject'),
    copyBody: t('outreach.letter.copyBody'),
    copied: t('outreach.letter.copied'),
    copyFailed: t('outreach.letter.copyFailed'),
    whatsapp: t('outreach.letter.whatsapp'),
    whatsappHint: t('outreach.letter.whatsappHint'),
    templateVersion: raw('outreach.letter.templateVersion'),
  };
};

export type LetterText = ReturnType<typeof letterWords>;

/** Whether the staff member may use the outreach pages: outreach staff and admins (ADR-0002). */
export const canOutreach = (me: Staff): boolean =>
  me.staff.roles.includes('outreach') || me.staff.roles.includes('admin');

export const isAdmin = (me: Staff): boolean => me.staff.roles.includes('admin');

/** Who may own an outreach contact, target or campaign: active outreach staff and admins. */
export const outreachOwners = (team: readonly TeamMember[]): StaffRef[] =>
  team
    .filter(
      (member) =>
        member.active && (member.roles.includes('outreach') || member.roles.includes('admin')),
    )
    .map(({ userId, displayName }) => ({ userId, displayName }));
