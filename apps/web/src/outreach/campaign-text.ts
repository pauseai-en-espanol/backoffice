import type { getTranslator } from '@backoffice/i18n/messages';

import type { AddTargetsText } from './AddTargets';
import type { AnchorText } from './AnchorEditor';
import type { CampaignFormText } from './CampaignForm';
import type { PreviewText } from './Preview';
import type { TargetActionsText } from './TargetActions';
import type { TemplateText } from './TemplateEditor';

import {
  campaignStatusNames,
  kindNames,
  outreachErrors,
  stageNames,
  statusNames,
  tierNames,
} from './text';

type Translator = ReturnType<typeof getTranslator>;

/** Every word the campaign pages hand their client components, built once by the server page. */

const raw = (t: Translator, key: Parameters<Translator['raw']>[0]) => String(t.raw(key));

export const campaignFormText = (t: Translator): CampaignFormText => ({
  name: t('campaigns.name'),
  slug: t('campaigns.slug'),
  slugHint: t('campaigns.slugHint'),
  language: t('campaigns.language'),
  languageHint: t('campaigns.languageHint'),
  fromName: t('campaigns.fromName'),
  fromEmail: t('campaigns.fromEmail'),
  signature: t('campaigns.signature'),
  signatureHint: t('campaigns.signatureHint'),
  goal: t('campaigns.goal'),
  status: t('campaigns.status'),
  owner: t('campaigns.owner'),
  noOwner: t('campaigns.noOwner'),
  statuses: campaignStatusNames(t),
  createTitle: t('campaigns.createTitle'),
  create: t('campaigns.create'),
  created: t('campaigns.created'),
  edit: t('campaigns.edit'),
  save: t('campaigns.save'),
  cancel: t('campaigns.cancel'),
  saved: t('campaigns.saved'),
  errors: outreachErrors(t),
});

/** A target's words, its name filled in where a button or question names it. */
export const targetActionsText = (t: Translator, name: string): TargetActionsText => ({
  statuses: statusNames(t),
  status: t('campaigns.status'),
  owner: t('campaigns.owner'),
  noOwner: t('campaigns.noOwner'),
  priority: t('campaigns.priority'),
  priorityHint: t('campaigns.priorityHint'),
  anchor: t('campaigns.anchor'),
  anchorOfContact: t('campaigns.anchorOfContact'),
  nextAction: t('campaigns.nextAction'),
  nextActionDue: t('campaigns.nextActionDue'),
  notes: t('campaigns.notes'),
  notesWarning: t('campaigns.notesWarning'),
  edit: t('campaigns.editTargetFor', { name }),
  save: t('campaigns.saveTarget'),
  saved: t('campaigns.targetSaved'),
  cancel: t('campaigns.cancel'),
  remove: t('campaigns.removeFor', { name }),
  removeQuestion: t('campaigns.removeQuestion', { name }),
  removeConfirm: t('campaigns.removeConfirm'),
  removed: t('campaigns.removed'),
  errors: outreachErrors(t),
});

export const addTargetsText = (t: Translator): AddTargetsText => ({
  title: t('campaigns.add'),
  intro: t('campaigns.addIntro'),
  search: t('campaigns.search'),
  searchHint: t('contacts.searchHint'),
  tier: t('contacts.tier'),
  tiers: tierNames(t),
  kind: t('contacts.kind'),
  kinds: kindNames(t),
  stage: t('contacts.stage'),
  stages: stageNames(t),
  any: t('contacts.anyKind'),
  find: t('campaigns.previewSearchButton'),
  resultsNone: t('campaigns.resultsNone'),
  resultsOne: t('campaigns.resultsOne'),
  resultsMany: raw(t, 'campaigns.resultsMany'),
  already: t('campaigns.already'),
  addSelected: t('campaigns.addSelected'),
  addNone: t('campaigns.addNone'),
  addedNone: t('campaigns.addedNone'),
  addedOne: t('campaigns.addedOne'),
  addedMany: raw(t, 'campaigns.addedMany'),
  inbox: raw(t, 'outreach.summary.inbox'),
  anonymised: t('outreach.summary.anonymised'),
  needsReview: t('outreach.summary.needsReview'),
  held: t('outreach.summary.held'),
  errors: outreachErrors(t),
});

export const templateText = (t: Translator): TemplateText => ({
  tierTitle: raw(t, 'campaigns.tierTitle'),
  none: t('campaigns.templateNone'),
  subject: t('campaigns.subject'),
  body: t('campaigns.body'),
  maxWords: t('campaigns.maxWords'),
  maxWordsHint: t('campaigns.maxWordsHint'),
  sources: t('campaigns.sources'),
  sourcesHint: t('campaigns.sourcesHint'),
  notes: t('campaigns.templateNotes'),
  noSources: t('outreach.letter.noSources'),
  edit: raw(t, 'campaigns.editTemplate'),
  write: raw(t, 'campaigns.writeTemplate'),
  save: t('campaigns.saveTemplate'),
  saved: t('campaigns.templateSaved'),
  cancel: t('campaigns.cancel'),
  unknownFields: raw(t, 'campaigns.unknownFields'),
  errors: outreachErrors(t),
});

export const anchorText = (t: Translator): AnchorText => ({
  none: t('campaigns.anchorsNone'),
  key: t('campaigns.anchorKey'),
  keyHint: t('campaigns.anchorKeyHint'),
  keyTaken: t('campaigns.anchorKeyTaken'),
  label: t('campaigns.anchorLabel'),
  text: t('campaigns.anchorText'),
  sources: t('campaigns.anchorSources'),
  sourcesHint: t('campaigns.anchorSourcesHint'),
  add: t('campaigns.addAnchor'),
  save: t('campaigns.saveAnchor'),
  saved: t('campaigns.anchorSaved'),
  edit: raw(t, 'campaigns.editAnchor'),
  remove: raw(t, 'campaigns.deleteAnchor'),
  removeQuestion: raw(t, 'campaigns.deleteAnchorQuestion'),
  removeConfirm: t('campaigns.deleteAnchorConfirm'),
  removed: t('campaigns.anchorDeleted'),
  cancel: t('campaigns.cancel'),
  errors: outreachErrors(t),
});

export const previewText = (t: Translator): PreviewText => ({
  contact: t('campaigns.previewContact'),
  choose: t('campaigns.previewChoose'),
  targets: t('campaigns.previewTargets'),
  found: t('campaigns.previewFound'),
  search: t('campaigns.previewSearch'),
  searchButton: t('campaigns.previewSearchButton'),
  show: t('campaigns.previewShow'),
  inbox: raw(t, 'outreach.summary.inbox'),
  anonymised: t('outreach.summary.anonymised'),
  errors: outreachErrors(t),
});
