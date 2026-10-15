import { createFormatter, createTranslator } from 'use-intl/core';

import { DEFAULT_LOCALE, type Locale, messages } from './catalog.js';

export {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  LOCALES,
  type Messages,
  messages,
} from './catalog.js';

/** Staff work in Spain: dates and times are shown in Madrid's time, whatever the server's zone. */
export const TIME_ZONE = 'Europe/Madrid';

/** A translator usable anywhere: Next server components, API emails, the bot's replies. */
export const getTranslator = (locale: Locale = DEFAULT_LOCALE) =>
  createTranslator({ locale, messages: messages[locale], timeZone: TIME_ZONE });

/** Dates, times and numbers, in Spanish and Madrid's time. */
export const getFormatter = (locale: Locale = DEFAULT_LOCALE) =>
  createFormatter({ locale, timeZone: TIME_ZONE });
