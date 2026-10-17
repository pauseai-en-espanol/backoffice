import type { getTranslator } from '@backoffice/i18n/messages';

import { madridToday } from '@/onboarding/format';

import type { ContactFormText } from './ContactForm';
import type { EraseText, HoldText, NoteText, ReviewText } from './ContactPanels';
import type { OrganisationFormText } from './OrganisationForm';
import type { ShareText, VisibilityText } from './Visibility';

import { kindNames, outreachErrors, stageNames, tierNames, treatmentNames } from './text';

type Translator = ReturnType<typeof getTranslator>;

/** Every word the contact and organisation pages hand their client components, built once by the server page. */

export const contactFormText = (t: Translator): ContactFormText => ({
  orgDisplay: t('contacts.orgDisplay'),
  orgDisplayHint: t('contacts.orgDisplayHint'),
  organisation: t('contacts.organisation'),
  organisationNone: t('contacts.organisationNone'),
  personName: t('contacts.personName'),
  personNameHint: t('contacts.personNameHint'),
  role: t('contacts.role'),
  treatment: t('contacts.treatment'),
  treatmentHint: t('contacts.treatmentHint'),
  treatments: treatmentNames(t),
  greetingName: t('contacts.greetingName'),
  greetingNameHint: t('contacts.greetingNameHint'),
  email: t('contacts.email'),
  emailsExtra: t('contacts.emailsExtra'),
  emailsExtraHint: t('contacts.emailsExtraHint'),
  phone: t('contacts.phone'),
  phoneHint: t('contacts.phoneHint'),
  website: t('contacts.website'),
  territory: t('contacts.territory'),
  territoryHint: t('contacts.territoryHint'),
  scope: t('contacts.scope'),
  sector: t('contacts.sector'),
  tier: t('contacts.tier'),
  tierHint: t('contacts.tierHint'),
  tiers: tierNames(t),
  anchor: t('contacts.anchor'),
  anchorHint: t('contacts.anchorHint'),
  tags: t('contacts.tags'),
  tagsHint: t('contacts.tagsHint'),
  stage: t('contacts.stage'),
  stages: stageNames(t),
  owner: t('contacts.owner'),
  noOwner: t('outreach.summary.noOwner'),
  reason: t('contacts.reason'),
  sources: t('contacts.sources'),
  sourcesHint: t('contacts.sourcesHint'),
  needsReview: t('contacts.needsReview'),
  needsReviewHint: t('contacts.needsReviewHint'),
  hold: t('contacts.holdField'),
  holdHint: t('contacts.holdHint'),
  holdReason: t('contacts.holdReason'),
  notes: t('contacts.notes'),
  notesWarning: t('contacts.notesWarning'),
  visibility: visibilityText(t),
  create: t('contacts.create'),
  edit: t('contacts.edit'),
  save: t('contacts.save'),
  cancel: t('contacts.cancel'),
  saved: t('contacts.saved'),
  errors: outreachErrors(t),
});

export const reviewText = (t: Translator): ReviewText => ({
  intro: t('contacts.reviewIntro'),
  hint: t('contacts.reviewHint'),
  reason: t('contacts.reason'),
  sources: t('contacts.sources'),
  sourcesHint: t('contacts.sourcesHint'),
  mark: t('contacts.markReviewed'),
  done: t('contacts.reviewed'),
  reviewed: t('contacts.reviewedAlready'),
  errors: outreachErrors(t),
});

export const holdText = (t: Translator): HoldText => ({
  intro: t('contacts.holdIntro'),
  on: String(t.raw('contacts.holdOn')),
  onNoReason: t('contacts.holdOnNoReason'),
  off: t('contacts.holdOff'),
  reason: t('contacts.holdReason'),
  hold: t('contacts.hold'),
  held: t('contacts.holdDone'),
  release: t('contacts.release'),
  released: t('contacts.released'),
  errors: outreachErrors(t),
});

export const noteText = (t: Translator): NoteText => ({
  note: t('contacts.note'),
  warning: t('contacts.notesWarning'),
  happened: {
    label: t('contacts.happenedOn'),
    hint: t('contacts.happenedOnHint'),
    today: madridToday(),
  },
  mine: t('outreach.private.noteMine'),
  mineHint: t('outreach.private.noteMineHint'),
  mineAlready: t('outreach.private.noteMineAlready'),
  save: t('contacts.saveNote'),
  saved: t('contacts.noteSaved'),
  missing: t('contacts.noteMissing'),
  errors: { ...outreachErrors(t), incomplete: t('contacts.happenedOnFuture') },
});

/** Erasing, the contact's name filled in where the question names them. */
export const eraseText = (t: Translator, name: string): EraseText => ({
  erase: t('contacts.erase'),
  question: t('contacts.eraseQuestion', { name }),
  understand: t('contacts.eraseUnderstand'),
  confirm: t('contacts.eraseConfirm'),
  cancel: t('contacts.cancel'),
  done: t('contacts.erased'),
  errors: { ...outreachErrors(t), stale: t('contacts.eraseAlready') },
});

export const organisationFormText = (t: Translator): OrganisationFormText => ({
  name: t('organisations.name'),
  kind: t('organisations.kind'),
  kindHint: t('organisations.kindHint'),
  kinds: kindNames(t),
  territory: t('organisations.territory'),
  territoryHint: t('organisations.territoryHint'),
  website: t('organisations.website'),
  visibility: visibilityText(t),
  create: t('organisations.create'),
  edit: t('organisations.edit'),
  save: t('organisations.save'),
  cancel: t('organisations.cancel'),
  saved: t('organisations.saved'),
  errors: outreachErrors(t),
});

/** "Quién lo ve" (PLAN M5, step 6). */
export function visibilityText(t: Translator): VisibilityText {
  return {
    legend: t('outreach.private.legend'),
    team: t('outreach.private.team'),
    teamHint: t('outreach.private.teamHint'),
    mine: t('outreach.private.mine'),
    mineHint: t('outreach.private.mineHint'),
  };
}

/** Sharing one's private contact or organisation (PLAN M5, step 6). */
export const shareText = (t: Translator, kind: 'contact' | 'organisation'): ShareText => ({
  intro: t(
    kind === 'contact' ? 'outreach.private.contactIntro' : 'outreach.private.organisationIntro',
  ),
  share: t('outreach.private.share'),
  shared: t('outreach.private.shared'),
  matchesIntro: t('outreach.private.matchesIntro'),
  history: t('outreach.private.history'),
  historyHint: t('outreach.private.historyHint'),
  merge: String(t.raw('outreach.private.merge')),
  merged: t('outreach.private.merged'),
  errors: outreachErrors(t),
});
