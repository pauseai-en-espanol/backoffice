import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';

/**
 * The census answer (onboarding spec §7.2; staff API spec, the forms app's routes), built from the form and checked
 * before it is sent. Pure, so the browser and the tests share it; the API and the database check everything again.
 */

export const AVAILABILITY = ['occasional', 'under_2h', 'from_2_to_5h', 'over_5h'] as const;
export type Availability = (typeof AVAILABILITY)[number];

export interface CensusOption {
  id: string;
  kind: 'skill' | 'interest';
  label: string;
}

/** What the API answers for the form: its lists, and for a personal link its person's greeting. */
export interface FormInfo {
  options: CensusOption[];
  greeting: string | null;
  link: 'generic' | 'personal' | 'invalid';
  wordingVersion: string;
}

export interface CensusAnswer {
  name: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  province?: string;
  town?: string;
  languages?: string[];
  options?: string[];
  skillsOther?: string;
  interestsOther?: string;
  availability?: Availability;
  howHeard?: string;
  pronouns?: string;
  consentEmail: boolean;
  consentWhatsapp: boolean;
  consentPrivacy: boolean;
  ageOk: boolean;
}

/**
 * What the form can't send yet, in the form's order, so the first one is where focus goes: no name; neither an email
 * nor a phone; one that isn't valid; the privacy notice not accepted; the age not confirmed.
 */
export type Problem = 'name' | 'contact' | 'email' | 'phone' | 'consentPrivacy' | 'ageOk';

/** The fields' names in the form, for the browser to find the first one with a problem. */
export const FIELD_OF: Readonly<Record<Problem, string>> = {
  name: 'name',
  contact: 'email',
  email: 'email',
  phone: 'phone',
  consentPrivacy: 'consentPrivacy',
  ageOk: 'ageOk',
};

const LIMITS = {
  name: 200,
  preferredName: 100,
  email: 254,
  phone: 50,
  province: 100,
  town: 100,
  language: 50,
  skillsOther: 300,
  interestsOther: 300,
  howHeard: 500,
  pronouns: 50,
} as const;

const text = (form: FormData, field: string, limit: number): string | undefined => {
  const value = form.get(field);
  const trimmed = typeof value === 'string' ? value.trim().slice(0, limit) : '';
  return trimmed === '' ? undefined : trimmed;
};

const checked = (form: FormData, field: string): boolean => form.get(field) === 'on';

/** Languages as people write them: separated by commas, semicolons or "y"; at most 20, each once. */
export const splitLanguages = (value: string | undefined): string[] =>
  [
    ...new Set(
      (value ?? '')
        .split(/[,;]|\s+y\s+/u)
        .map((language) => language.trim().slice(0, LIMITS.language))
        .filter((language) => language !== ''),
    ),
  ].slice(0, 20);

/**
 * The answer from the form's fields, with only the chosen options the API offered, and what is missing or wrong. An
 * email or a phone is required, and each must be one, though the API normalises them itself.
 */
export const buildAnswer = (
  form: FormData,
  offered: readonly CensusOption[],
): { answer: CensusAnswer; problems: Problem[] } => {
  const ids = new Set(offered.map((option) => option.id));
  const name = text(form, 'name', LIMITS.name);
  const email = text(form, 'email', LIMITS.email);
  const phone = text(form, 'phone', LIMITS.phone);
  const availability = form.get('availability');
  const languages = splitLanguages(text(form, 'languages', 1000));
  const options = form
    .getAll('options')
    .filter((id): id is string => typeof id === 'string' && ids.has(id));
  const optional = {
    preferredName: text(form, 'preferredName', LIMITS.preferredName),
    email,
    phone,
    province: text(form, 'province', LIMITS.province),
    town: text(form, 'town', LIMITS.town),
    skillsOther: text(form, 'skillsOther', LIMITS.skillsOther),
    interestsOther: text(form, 'interestsOther', LIMITS.interestsOther),
    howHeard: text(form, 'howHeard', LIMITS.howHeard),
    pronouns: text(form, 'pronouns', LIMITS.pronouns),
  };
  const answer: CensusAnswer = {
    name: name ?? '',
    ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== undefined)),
    ...(languages.length > 0 ? { languages } : {}),
    ...(options.length > 0 ? { options: [...new Set(options)] } : {}),
    ...(typeof availability === 'string' &&
    (AVAILABILITY as readonly string[]).includes(availability)
      ? { availability: availability as Availability }
      : {}),
    consentEmail: checked(form, 'consentEmail'),
    consentWhatsapp: checked(form, 'consentWhatsapp'),
    consentPrivacy: checked(form, 'consentPrivacy'),
    ageOk: checked(form, 'ageOk'),
  };
  const problems: Problem[] = [];
  if (!name) {
    problems.push('name');
  }
  if (!email && !phone) {
    problems.push('contact');
  }
  if (email && !normalizeEmail(email)) {
    problems.push('email');
  }
  if (phone && !normalizePhone(phone)) {
    problems.push('phone');
  }
  if (!answer.consentPrivacy) {
    problems.push('consentPrivacy');
  }
  if (!answer.ageOk) {
    problems.push('ageOk');
  }
  return { answer, problems };
};

/** How an email or phone will be stored, to show as a hint while it is typed; undefined while it isn't one yet. */
export const normalisedHint = (kind: 'email' | 'phone', value: string): string | undefined => {
  if (value.trim() === '') {
    return undefined;
  }
  const normalised = kind === 'email' ? normalizeEmail(value) : normalizePhone(value);
  return normalised === value.trim() ? undefined : normalised;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The API's answer for the form, or undefined when it isn't one (the page then says it can't load). */
export const parseFormInfo = (body: unknown, fallbackVersion: string): FormInfo | undefined => {
  if (!isRecord(body) || !Array.isArray(body.options)) {
    return undefined;
  }
  const options = body.options.flatMap((option): CensusOption[] =>
    isRecord(option) &&
    typeof option.id === 'string' &&
    typeof option.label === 'string' &&
    (option.kind === 'skill' || option.kind === 'interest')
      ? [{ id: option.id, kind: option.kind, label: option.label }]
      : [],
  );
  const link =
    body.link === 'personal' || body.link === 'invalid' || body.link === 'generic'
      ? body.link
      : 'generic';
  return {
    options,
    greeting:
      typeof body.greeting === 'string' && body.greeting.trim() !== ''
        ? body.greeting.trim()
        : null,
    link,
    wordingVersion:
      typeof body.wordingVersion === 'string' && body.wordingVersion !== ''
        ? body.wordingVersion
        : fallbackVersion,
  };
};

/** What submitting came to, as the page words it. */
export type Outcome =
  | { kind: 'done'; outcome: 'created' | 'updated' | 'review' }
  | { kind: 'invalid'; field?: string }
  | { kind: 'invalidLink' }
  | { kind: 'limit' }
  | { kind: 'failed' };

/** The forms app's /enviar answer (status and body), read the same way the API's is. */
export const outcomeOf = (status: number, body: unknown): Outcome => {
  const record = isRecord(body) ? body : {};
  if (
    status === 200 &&
    (record.outcome === 'created' || record.outcome === 'updated' || record.outcome === 'review')
  ) {
    return { kind: 'done', outcome: record.outcome };
  }
  if (status === 400) {
    return typeof record.field === 'string'
      ? { kind: 'invalid', field: record.field }
      : { kind: 'invalid' };
  }
  if (status === 409 && record.error === 'invalidLink') {
    return { kind: 'invalidLink' };
  }
  if (status === 429) {
    return { kind: 'limit' };
  }
  return { kind: 'failed' };
};
