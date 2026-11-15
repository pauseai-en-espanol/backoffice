import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Ways to recognise a person (onboarding spec, concepts): a normalised identity belongs to at most one person, which
 * is what keeps one human from becoming two records. The database checks the same shapes (migration onboarding).
 */
export const IDENTITY_KINDS = ['email', 'phone', 'discord', 'airtable'] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/** Spain is where the community is: a number written without a country code is Spanish. */
export const DEFAULT_REGION: CountryCode = 'ES';

/**
 * What was typed or pasted without its invisible marks (Unicode's format characters, PLAN R97): WhatsApp and phones
 * copy a number or an address with direction marks around it (U+202A…U+202C, U+2066…U+2069, U+200E), which nobody
 * sees in a field and nobody means to keep.
 */
const visible = (raw: string): string => raw.replaceAll(/\p{Cf}/gu, '');

/**
 * What a phone is written with (PLAN R63, R72), once its invisible marks are gone: digits, spaces of any kind, `+`,
 * brackets, dots and dashes. Contacto and the searches read a phone by the same rule.
 */
const WRITTEN_AS_PHONE = /^[\d\s+().-]+$/u;

const EMAIL = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:.]+(?:\.[^\s@<>"(),;:.]+)+$/u;

/**
 * An email address as stored: trimmed, without invisible marks, `mailto:` or angle brackets, in lowercase. Undefined
 * if not one.
 */
export const normalizeEmail = (raw: string): string | undefined => {
  const value = visible(raw)
    .normalize('NFC')
    .trim()
    .replace(/^mailto:/iu, '')
    .replace(/^<(.*)>$/u, '$1')
    .trim()
    .toLowerCase();
  return EMAIL.test(value) && value.length <= 254 ? value : undefined;
};

/**
 * A phone number as stored: E.164 (`+34612345678`), parsed as people write them (spaces of any kind, dots, dashes,
 * brackets, a `00` or `+` country prefix, the invisible marks a pasted one brings), Spanish when it has none.
 * Undefined unless it is a valid number.
 */
export const normalizePhone = (
  raw: string,
  region: CountryCode = DEFAULT_REGION,
): string | undefined => {
  const parsed = parsePhoneNumberFromString(visible(raw).replaceAll(/\s/gu, ' ').trim(), region);
  return parsed?.isValid() ? parsed.number : undefined;
};

/**
 * A stored number as people write it, with its spaces (`+34 612 34 56 78`): what a spreadsheet keeps as text, where
 * `+34612345678` would become a number and lose its `+`.
 */
export const spacedPhone = (phone: string): string =>
  parsePhoneNumberFromString(phone)?.formatInternational() ?? phone;

/**
 * A Discord username as Discord makes them (PLAN M5): 2 to 32 lowercase letters, digits, underscores and dots, never two
 * dots in a row. People write it with an `@` in front, or in capitals, or paste it with invisible marks: all go.
 * Undefined unless it is one; the old `name#1234` form no longer exists.
 */
export const normalizeDiscord = (raw: string): string | undefined => {
  const value = visible(raw).normalize('NFC').trim().replace(/^@/u, '').toLowerCase();
  return /^[a-z0-9_.]{2,32}$/u.test(value) && !value.includes('..') ? value : undefined;
};

/** An Airtable record id: the identity of a signup from Global's view (ADR-0005). */
export const normalizeAirtableId = (raw: string): string | undefined => {
  const value = raw.trim();
  return /^rec[A-Za-z0-9]{14}$/u.test(value) ? value : undefined;
};

/**
 * Which kind a value typed in Contacto is (PLAN R63), so nobody chooses it: an @ after the first character makes it an
 * email; only digits, spaces, `+`, brackets, dots and dashes, a phone; anything else, a Discord username (with or
 * without its @). Invisible marks pasted with it don't count (R97). Undefined when it isn't a valid one of what it
 * looks like: a number too short is no Discord name.
 */
export const inferIdentityKind = (raw: string): 'email' | 'phone' | 'discord' | undefined => {
  const value = visible(raw).trim();
  if (value === '') {
    return undefined;
  }
  if (value.indexOf('@') > 0) {
    return normalizeEmail(value) === undefined ? undefined : 'email';
  }
  if (WRITTEN_AS_PHONE.test(value)) {
    return normalizePhone(value) === undefined ? undefined : 'phone';
  }
  return normalizeDiscord(value) === undefined ? undefined : 'discord';
};

/**
 * The fewest digits the team's search finds a phone by, in part (PLAN R96): two, so a number is found as it's typed;
 * one would list nearly everyone.
 */
export const PHONE_SEARCH_DIGITS = 2;

/**
 * The fewest digits the bot's search finds a phone by (PLAN R82). More than the team's: the bot never shows a number
 * (ADR-0004), and a short run of digits, tried one after another, would tell someone's number digit by digit.
 */
export const BOT_PHONE_SEARCH_DIGITS = 6;

/**
 * What a search finds a phone by, in part (PLAN R72, R96): the digits of a query written only as a phone is (digits,
 * spaces of any kind, `+`, brackets, dots, dashes, and the invisible marks a number copied from WhatsApp brings), at
 * least `fewest` of them, without the zeros a `00` or a national prefix starts with unless that leaves less than two
 * ("06" is part of a number). A stored number with these digits in it matches, so a foreign number written without its
 * country code ("857 756 3987" for +1 857 756 3987), or any part of one, finds it. Undefined for anything else.
 */
export const phoneSearchDigits = (
  raw: string,
  fewest: number = PHONE_SEARCH_DIGITS,
): string | undefined => {
  const value = visible(raw).trim();
  if (!WRITTEN_AS_PHONE.test(value)) {
    return undefined;
  }
  const typed = value.replace(/\D/gu, '');
  const unprefixed = typed.replace(/^0+/u, '');
  const digits = unprefixed.length >= PHONE_SEARCH_DIGITS ? unprefixed : typed;
  return digits.length >= fewest ? digits : undefined;
};

/**
 * Whether what was read as a phone, or refused, is a Discord username too (PLAN R69): the one overlap, only digits and
 * maybe dots (`612345678`). Only whoever typed it knows which; an @ in front makes it Discord.
 */
export const mayBeDiscord = (raw: string): boolean =>
  inferIdentityKind(raw) !== 'discord' && normalizeDiscord(raw) !== undefined;

export const normalizeIdentity = (kind: IdentityKind, raw: string): string | undefined =>
  kind === 'email'
    ? normalizeEmail(raw)
    : kind === 'phone'
      ? normalizePhone(raw)
      : kind === 'discord'
        ? normalizeDiscord(raw)
        : normalizeAirtableId(raw);

/**
 * The letters the database folds (private.fold_name) and their plain forms: the accents of Spanish, Catalan,
 * Galician, Basque and Portuguese names. Both sides must fold the same, which identities.spec.ts and the database
 * tests check on the same names.
 */
export const FOLD_FROM = 'áéíóúüñàèìòùâêîôûäëïöçãõ·';
export const FOLD_TO = 'aeiouunaeiouaeiouaeiocao ';

/**
 * A name for comparing, never for showing (onboarding spec, matching): lowercase, accents folded, anything but
 * letters and digits as a single space, trimmed.
 */
export const foldName = (name: string): string => {
  let folded = '';
  for (const char of name.normalize('NFC').toLowerCase()) {
    const at = FOLD_FROM.indexOf(char);
    folded += at === -1 ? char : FOLD_TO.charAt(at);
  }
  return folded.replaceAll(/[^\p{L}\p{N}]+/gu, ' ').trim();
};
