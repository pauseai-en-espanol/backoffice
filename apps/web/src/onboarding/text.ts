import type { getTranslator } from '@backoffice/i18n/messages';

import { MISSING_DETAILS } from '@backoffice/domain/missing';
import {
  ATTENTION_REASONS,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  SOURCES,
  STAGES,
} from '@backoffice/domain/stages';

import type { Staff } from '@/session';

import type { PersonLabels } from './PersonItem';

type Translator = ReturnType<typeof getTranslator>;

/**
 * The onboarding vocabulary in Spanish, as plain maps a server page hands to its client components (which ship no
 * message formatter), and who may use the onboarding pages.
 */

const labels = <K extends string>(keys: readonly K[], word: (key: K) => string) =>
  Object.fromEntries(keys.map((key) => [key, word(key)])) as Record<K, string>;

export const stageNames = (t: Translator) => labels(STAGES, (stage) => t(`stages.${stage}`));

export const stageHints = (t: Translator) => labels(STAGES, (stage) => t(`stageHints.${stage}`));

export const reasonNames = (t: Translator) =>
  labels(ATTENTION_REASONS, (reason) => t(`attention.${reason}`));

export const channelNames = (t: Translator) =>
  labels(CONTACT_CHANNELS, (channel) => t(`contactChannels.${channel}`));

export const outcomeNames = (t: Translator) =>
  labels(CONTACT_OUTCOMES, (outcome) => t(`contactOutcomes.${outcome}`));

export const sourceNames = (t: Translator) => labels(SOURCES, (source) => t(`sources.${source}`));

/** What a card says is missing, in plain words (PLAN M5, step 4). */
export const missingNames = (t: Translator) =>
  labels(MISSING_DETAILS, (detail) => t(`person.missing.${detail}`));

export const AVAILABILITY = ['occasional', 'under_2h', 'from_2_to_5h', 'over_5h'] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const availabilityNames = (t: Translator) =>
  labels(AVAILABILITY, (value) => t(`availability.${value}`));

/** The words a person's card uses (PersonItem), built once per page. */
export const personLabels = (t: Translator): PersonLabels => ({
  stages: stageNames(t),
  reasons: reasonNames(t),
  sources: sourceNames(t),
  unknownReason: t('person.unknownReason'),
  reasonsLabel: t('person.reasons'),
  owner: t('person.owner'),
  noOwner: t('person.noOwner'),
  province: t('person.province'),
  inCommunity: t('person.inCommunity'),
  notInCommunity: t('person.notInCommunity'),
  arrivalLabel: t('person.arrival'),
  nextAction: t('person.nextAction'),
  noNextAction: t('person.noNextAction'),
  overdue: String(t.raw('person.overdue')),
  due: String(t.raw('person.due')),
  dueToday: t('person.dueToday'),
  noName: t('people.noName'),
  withProvince: String(t.raw('person.withProvince')),
  missing: missingNames(t),
  missingLabel: t('person.missingLabel'),
  team: t('person.team'),
  personColumn: t('person.columnPerson'),
  stageColumn: t('people.stage'),
});

/** A reason's words, or "Revisar" for one this version of the page doesn't know yet. */
export const reasonName = (t: Translator, reason: string): string =>
  (reasonNames(t) as Record<string, string>)[reason] ?? t('person.unknownReason');

/** A source's words, or the source as the API named it. */
export const sourceName = (t: Translator, source: string): string =>
  (sourceNames(t) as Record<string, string>)[source] ?? source;

/**
 * Every refusal an onboarding write can meet, in Spanish, by the API's code (write.ts messageFor), and the fields an
 * `invalid` may name.
 */
export const onboardingErrors = (t: Translator): Record<string, string> => ({
  unexpected: t('errors.unexpected'),
  forbidden: t('errors.forbidden'),
  onboardingOnly: t('errors.onboardingOnly'),
  stale: t('errors.stale'),
  incomplete: t('errors.incomplete'),
  taken: t('errors.taken'),
  linked: t('errors.linked'),
  invalid: t('errors.invalid'),
  limit: t('errors.limit'),
  signIn: t('errors.signIn'),
  notFound: t('errors.notFound'),
  network: t('errors.network'),
  personGone: t('errors.personGone'),
  personTaken: t('errors.personTaken'),
  bothInTeam: t('errors.bothInTeam'),
  unavailable: t('web.unavailable.body'),
  running: t('imports.running'),
  airtable: t('imports.airtableFailed'),
  email: t('intake.emailInvalid'),
  phone: t('intake.phoneInvalid'),
  name: t('intake.nameMissing'),
  fullName: t('intake.nameMissing'),
  nextAction: t('person.nextActionMissing'),
  body: t('person.noteMissing'),
  value: t('person.identityNotValid'),
});

/** Whether the staff member may use the onboarding pages: onboarding staff and admins (ADR-0002). */
export const canOnboard = (me: Staff): boolean =>
  me.staff.roles.includes('onboarding') || me.staff.roles.includes('admin');

export const isAdmin = (me: Staff): boolean => me.staff.roles.includes('admin');
