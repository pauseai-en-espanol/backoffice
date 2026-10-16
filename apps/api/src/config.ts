import { type Dsn, readDsn } from '@backoffice/observability/dsn';

import { readLinkKey } from './imports/airtable-link.js';
import { readTelegram, type TelegramConfig } from './telegram/config.js';

export interface ApiConfig {
  host: string;
  /** The staff host's API and the bot's webhook, for the gateway and the web app's pods (PORT, 3001). */
  port: number;
  /**
   * The forms app's routes, on a port of their own (FORMS_PORT, 3003; the forms app itself runs on 3002 in dev), so
   * that the forms app's pods, public-facing, reach nothing else of the API: the network policy admits them to this
   * port only (ADR-0002 §7).
   */
  formsPort: number;
  logLevel: string;
  /** GlitchTip project for the API (in-cluster Service); undefined turns error tracking off. */
  sentryDsn: Dsn | undefined;
  /** Sign-in (Better Auth, ADR-0003); undefined leaves /api answering 503. */
  auth: AuthConfig | undefined;
  /**
   * The pauseai_backoffice_app role's connection, for everything a signed-in staff member does (withActor, ADR-0002).
   * Undefined leaves the signed-in data routes unavailable (503).
   */
  appDatabaseUrl: string | undefined;
  /** The backoffice's mail sender. Undefined: nothing sends mail, so no invitation or password link goes out. */
  mail: MailConfig | undefined;
  /**
   * The Airtable sync (ADR-0005): the key that seals the link admins set in Ajustes, and the ingest role's connection
   * that runs it on demand from Importar or the bot. Undefined: no link can be set, and nothing syncs here.
   */
  airtable: AirtableConfig | undefined;
  /** The Telegram bot (ADR-0004). Undefined: no webhook, no linking, no team group. */
  telegram: TelegramConfig | undefined;
  /** The census (M2): where personal links point. Undefined: no personal link can be made. */
  census: CensusConfig | undefined;
  /** The forms app's routes (ADR-0002 §7). Undefined: /public/census answers 503. */
  forms: FormsConfig | undefined;
}

export interface CensusConfig {
  /** The forms app's origin (CENSUS_URL), such as `https://unete.example.org`: personal links point there. */
  formsOrigin: string;
  /** The privacy notice's wording version that consents are recorded against (CENSUS_WORDING_VERSION, `v1`). */
  wordingVersion: string;
}

export interface FormsConfig {
  /** pauseai_backoffice_public, which may only run the census form's two functions. */
  databaseUrl: string;
  /** The secret the forms app sends with every call (FORMS_TOKEN): 32 characters or more. */
  token: string;
}

export interface AirtableConfig {
  /**
   * AIRTABLE_LINK_KEY: 32 random bytes, from a sealed secret, that seal and open the link admins set (the link itself
   * lives in the database, encrypted). Never logged, never in an error.
   */
  key: Buffer;
  /**
   * pauseai_backoffice_ingest, which may only execute the sync's functions. Undefined: admins can set the link, but
   * only the CronJob syncs ("Sincronizar Airtable ahora" answers that it isn't available).
   */
  ingestDatabaseUrl: string | undefined;
  /** Only rows with Global's chapter-share permission: AIRTABLE_REQUIRE_CHAPTER_PERMISSION=true (PLAN R14). */
  requirePermission: boolean;
}

export interface MailConfig {
  /**
   * The mail server's SMTP submission with the sender account's credentials: `smtps://user:password@host:465`, or `smtp://…`
   * with STARTTLS. Never logged.
   */
  smtpUrl: string;
  /** The sending address, for the envelope and the From header; the From name is the product's. */
  from: string;
}

export interface AuthConfig {
  /**
   * The staff host's origin (ADR-0001), such as `https://backoffice.example.org`: Better Auth's base URL, the only
   * origin it trusts, and the only host `/api/*` answers on.
   */
  staffOrigin: string;
  /** Better Auth's own role, pauseai_backoffice_auth (ADR-0002). */
  databaseUrl: string;
  /** Signs cookies and encrypts TOTP secrets and backup codes. */
  secret: string;
  /** The product's name, from PRODUCT_NAME: what authenticator apps file accounts under, and the mail's sender name. */
  totpIssuer: string;
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

/** Shorter than this, a secret is guessable; Better Auth itself asks for 32 characters. */
const MIN_SECRET_LENGTH = 32;

/**
 * Hosts a browser treats as secure over plain http, so `Secure` and `__Host-` cookies work there: local development
 * and the end-to-end tests only.
 */
const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '127.0.0.1' ||
  hostname === '[::1]';

/**
 * An origin and nothing else: https (or http on a loopback host), with no path, query, fragment or credentials. Errors
 * don't echo the value, which could hold credentials.
 */
const readOrigin = (value: string, name: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an origin such as https://backoffice.example.org`);
  }
  const secure =
    url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url.hostname));
  if (!secure || url.origin !== value.replace(/\/$/, '')) {
    throw new Error(
      `${name} must be an https origin (http only on a loopback host) with no path or credentials`,
    );
  }
  return url.origin;
};

/**
 * Sign-in needs all of its settings or none: some without the others is a deployment mistake, which fails here rather
 * than at the first sign-in. Errors never echo a secret or a connection string.
 */
const readAuth = (env: NodeJS.ProcessEnv): AuthConfig | undefined => {
  const settings = {
    STAFF_ORIGIN: env.STAFF_ORIGIN || undefined,
    AUTH_DATABASE_URL: env.AUTH_DATABASE_URL || undefined,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET || undefined,
    PRODUCT_NAME: env.PRODUCT_NAME || undefined,
  };
  const {
    STAFF_ORIGIN: staffOrigin,
    AUTH_DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    PRODUCT_NAME: totpIssuer,
  } = settings;
  if (!staffOrigin && !databaseUrl && !secret) {
    return undefined;
  }
  if (!staffOrigin || !databaseUrl || !secret || !totpIssuer) {
    const missing = Object.entries(settings)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(`Sign-in is half configured: ${missing.join(', ')} not set`);
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`BETTER_AUTH_SECRET must have at least ${MIN_SECRET_LENGTH} characters`);
  }
  return { staffOrigin: readOrigin(staffOrigin, 'STAFF_ORIGIN'), databaseUrl, secret, totpIssuer };
};

/** A plain address, as the sender: no display name, no spaces, one `@`. */
const ADDRESS = /^[^\s@<>"]+@[^\s@<>".]+(?:\.[^\s@<>".]+)+$/u;

/** Mail needs both settings or neither. Errors never echo the URL, which holds a password. */
export const readMail = (env: NodeJS.ProcessEnv): MailConfig | undefined => {
  const smtpUrl = env.SMTP_URL || undefined;
  const from = env.MAIL_FROM || undefined;
  if (!smtpUrl && !from) {
    return undefined;
  }
  if (!smtpUrl || !from) {
    throw new Error(`Mail is half configured: ${smtpUrl ? 'MAIL_FROM' : 'SMTP_URL'} not set`);
  }
  let protocol: string;
  try {
    ({ protocol } = new URL(smtpUrl));
  } catch {
    throw new Error('SMTP_URL must be a URL such as smtps://user:password@mail.example.org:465');
  }
  if (protocol !== 'smtp:' && protocol !== 'smtps:') {
    throw new Error('SMTP_URL must start with smtp:// or smtps://');
  }
  if (!ADDRESS.test(from)) {
    throw new Error('MAIL_FROM must be a plain address, such as avisos@example.org');
  }
  return { smtpUrl, from };
};

/**
 * The sync needs the key, and the ingest role's connection to run on demand: the key alone lets admins set the link,
 * the connection alone is an error. Errors never echo either. The link is no longer an environment variable: admins set
 * it in Ajustes (ADR-0005).
 */
export const readAirtable = (env: NodeJS.ProcessEnv): AirtableConfig | undefined => {
  const ingestDatabaseUrl = env.INGEST_DATABASE_URL || undefined;
  const keyText = env.AIRTABLE_LINK_KEY || undefined;
  if (!ingestDatabaseUrl && !keyText) {
    return undefined;
  }
  if (!keyText) {
    throw new Error('The Airtable sync is half configured: AIRTABLE_LINK_KEY not set');
  }
  const key = readLinkKey(keyText);
  if (!key) {
    throw new Error(
      'AIRTABLE_LINK_KEY must be 32 random bytes in base64 (scripts/seal-airtable-key.sh)',
    );
  }
  return {
    key,
    ingestDatabaseUrl,
    requirePermission: env.AIRTABLE_REQUIRE_CHAPTER_PERMISSION === 'true',
  };
};

/** The census's settings: the forms app's origin, if set, and the wording version. */
const readCensus = (env: NodeJS.ProcessEnv): CensusConfig | undefined => {
  const origin = env.CENSUS_URL || undefined;
  if (!origin) {
    return undefined;
  }
  const wordingVersion = env.CENSUS_WORDING_VERSION || 'v1';
  if (!/^[a-z0-9][a-z0-9.-]{0,39}$/u.test(wordingVersion)) {
    throw new Error(
      'CENSUS_WORDING_VERSION must be lowercase letters, digits, dots and dashes, such as v1',
    );
  }
  return { formsOrigin: readOrigin(origin, 'CENSUS_URL'), wordingVersion };
};

/** The forms app's routes need the public role's connection and the shared secret, or neither. Never echoed. */
const readForms = (env: NodeJS.ProcessEnv): FormsConfig | undefined => {
  const databaseUrl = env.PUBLIC_DATABASE_URL || undefined;
  const token = env.FORMS_TOKEN || undefined;
  if (!databaseUrl && !token) {
    return undefined;
  }
  if (!databaseUrl || !token) {
    throw new Error(
      `The forms app is half configured: ${databaseUrl ? 'FORMS_TOKEN' : 'PUBLIC_DATABASE_URL'} not set`,
    );
  }
  if (token.length < MIN_SECRET_LENGTH || !/^[\w-]+$/u.test(token)) {
    throw new Error(
      `FORMS_TOKEN must have at least ${MIN_SECRET_LENGTH} letters, digits, dashes or underscores`,
    );
  }
  return { databaseUrl, token };
};

/** Reads the API configuration from the environment, failing fast on invalid values. */
export const loadConfig = (env: NodeJS.ProcessEnv): ApiConfig => {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  const formsPort = Number(env.FORMS_PORT ?? 3003);
  if (!Number.isInteger(formsPort) || formsPort < 1 || formsPort > 65_535 || formsPort === port) {
    throw new Error(
      `FORMS_PORT must be an integer between 1 and 65535 other than PORT, got "${env.FORMS_PORT}"`,
    );
  }
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}, got "${logLevel}"`);
  }
  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    formsPort,
    logLevel,
    sentryDsn: readDsn(env),
    auth: readAuth(env),
    appDatabaseUrl: env.APP_DATABASE_URL || undefined,
    mail: readMail(env),
    airtable: readAirtable(env),
    telegram: readTelegram(env),
    census: readCensus(env),
    forms: readForms(env),
  };
};
