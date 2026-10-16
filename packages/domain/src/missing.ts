import { CLOSED_STAGES, type Stage } from './stages.js';

/**
 * What a person's card says is missing, in plain words (PLAN M5, step 4: "Falta: correo · qué quiere hacer"), in the
 * order it lists them: ways to write to them, where they are, and what they'd like to do. Labels in packages/i18n.
 */
export const MISSING_DETAILS = ['phone', 'email', 'province', 'interests'] as const;
export type MissingDetail = (typeof MISSING_DETAILS)[number];

export const isMissingDetail = (value: unknown): value is MissingDetail =>
  typeof value === 'string' && (MISSING_DETAILS as readonly string[]).includes(value);

/** What the database knows of a person, as far as the card's "Falta" goes. */
export interface KnownDetails {
  stage: Stage;
  hasPhone: boolean;
  hasEmail: boolean;
  province: string | null;
  /** An area they'd like to help in, from the census's list or in their own words. */
  hasInterests: boolean;
}

/**
 * What is missing. Nothing for someone who left or was discarded: nobody is going to ask them. Someone dormant or
 * unresponsive may still come back, so theirs is still said.
 */
export const missingDetails = (person: KnownDetails): MissingDetail[] => {
  if (CLOSED_STAGES.includes(person.stage)) {
    return [];
  }
  const known: Readonly<Record<MissingDetail, boolean>> = {
    phone: person.hasPhone,
    email: person.hasEmail,
    province: (person.province ?? '').trim() !== '',
    interests: person.hasInterests,
  };
  return MISSING_DETAILS.filter((detail) => !known[detail]);
};
