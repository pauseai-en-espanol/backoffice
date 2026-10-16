/**
 * Where the e2e run serves each app's production build. The ports stay clear of `pnpm dev` (3000-3003) and of
 * the 4100s, which other projects' e2e runs on the same machine use.
 */
export const PORTS = {
  web: 4200,
  api: 4201,
  forms: 4202,
  glitchtip: 4203,
  apiForms: 4204,
  gateway: 4205,
  smtp: 4206,
  mailbox: 4207,
} as const;

export const WEB_URL = `http://127.0.0.1:${PORTS.web}`;
export const API_URL = `http://127.0.0.1:${PORTS.api}`;
/** The API's port for the forms app's routes alone, as in the cluster (ADR-0002 §7). */
export const API_FORMS_URL = `http://127.0.0.1:${PORTS.apiForms}`;

/** The census form (apps/forms), as visitors reach it; personal links point here. */
export const FORMS_URL = `http://localhost:${PORTS.forms}`;
/** The secret the forms app and the API share, for the e2e run only. */
export const FORMS_TOKEN = 'an-e2e-only-forms-token-of-more-than-thirty-two-characters';

/**
 * The staff host, through the stand-in gateway (fake-gateway.ts), as browsers reach it in production. `localhost`, so
 * the browser treats it as secure and keeps the sign-in's `__Host-` cookies over plain http.
 */
export const STAFF_URL = `http://localhost:${PORTS.gateway}`;

/** Sign-in's settings for the e2e API, all fictional. */
export const AUTH = {
  secret: 'an-e2e-only-secret-of-more-than-thirty-two-characters',
} as const;

/** Deliberately fictional: the real name comes from each deployment's configuration. */
export const PRODUCT_NAME = 'Backoffice de ejemplo';

/** A stand-in for GlitchTip's ingest (fake-glitchtip.ts), one fictional project per app. */
export const GLITCHTIP_URL = `http://127.0.0.1:${PORTS.glitchtip}`;
export const DSNS = {
  web: `http://e2e-web@127.0.0.1:${PORTS.glitchtip}/1`,
  api: `http://e2e-api@127.0.0.1:${PORTS.glitchtip}/2`,
} as const;

/** A stand-in for the backoffice's SMTP sender (fake-smtp.ts), and where tests read what it received. */
export const SMTP_URL = `smtp://127.0.0.1:${PORTS.smtp}`;
export const MAILBOX_URL = `http://127.0.0.1:${PORTS.mailbox}`;
/** The sending address, fictional. */
export const MAIL_FROM = 'avisos@backoffice.example';
