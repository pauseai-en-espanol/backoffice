import es from './messages/es.json' with { type: 'json' };

/**
 * UI, email and bot strings (ADR-0003, D6): Spanish only, kept in a messages file so a language can be added later as
 * another file typed against this one. Wording is provisional until the onboarding team reads it.
 *
 * This module has no dependencies, so client code can read a plain string without shipping the message formatter.
 */
export type Messages = typeof es;

export const LOCALES = ['es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

export const messages: Record<Locale, Messages> = { es };

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
