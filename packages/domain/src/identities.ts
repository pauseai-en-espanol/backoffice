import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Ways to recognise a person (onboarding spec, concepts): a normalised identity belongs to at most one person, which
 * is what keeps one human from becoming two records. The database checks the same shapes (migration onboarding).
 */
export const IDENTITY_KINDS = ['email', 'phone', 'discord', 'airtable'] as const;
export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/** Spain is where the community is: a number written without a country code is Spanish. */
export const DEFAULT_REGION: CountryCode = 'ES';

const EMAIL = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:.]+(?:\.[^\s@<>"(),;:.]+)+$/u;

/** An email address as stored: trimmed, without `mailto:` or angle brackets, in lowercase. Undefined if not one. */
export const normalizeEmail = (raw: string): string | undefined => {
  const value = raw
    .normalize('NFC')
    .trim()
    .replace(/^mailto:/iu, '')
    .replace(/^<(.*)>$/u, '$1')
    .trim()
    .toLowerCase();
  return EMAIL.test(value) && value.length <= 254 ? value : undefined;
};

/**
 * A phone number as stored: E.164 (`+34612345678`), parsed as people write them (spaces, dots, dashes, brackets, a
 * `00` or `+` country prefix), Spanish when it has none. Undefined unless it is a valid number.
 */
export const normalizePhone = (
  raw: string,
  region: CountryCode = DEFAULT_REGION,
): string | undefined => {
  const parsed = parsePhoneNumberFromString(raw.trim(), region);
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
 * dots in a row. People write it with an `@` in front, or in capitals: both go. Undefined unless it is one; the old
 * `name#1234` form no longer exists.
 */
export const normalizeDiscord = (raw: string): string | undefined => {
  const value = raw.normalize('NFC').trim().replace(/^@/u, '').toLowerCase();
  return /^[a-z0-9_.]{2,32}$/u.test(value) && !value.includes('..') ? value : undefined;
};

/** An Airtable record id: the identity of a signup from Global's view (ADR-0005). */
export const normalizeAirtableId = (raw: string): string | undefined => {
  const value = raw.trim();
  return /^rec[A-Za-z0-9]{14}$/u.test(value) ? value : undefined;
};

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
