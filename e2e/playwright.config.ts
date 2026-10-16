import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

import {
  AIRTABLE_LINK_KEY,
  API_FORMS_URL,
  API_URL,
  AUTH,
  DSNS,
  FORMS_TOKEN,
  FORMS_URL,
  GLITCHTIP_URL,
  MAIL_FROM,
  MAILBOX_URL,
  PORTS,
  PRODUCT_NAME,
  SMTP_URL,
  STAFF_URL,
  WEB_URL,
} from './servers.js';

// The API reads and writes as its runtime roles on the local, migrated database: CI sets the URLs; locally they come
// from .env (see .env.example).
if (existsSync('../.env')) {
  process.loadEnvFile('../.env');
}
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set: run \`pnpm db:up && pnpm db:migrate\` and set it in .env (see .env.example).`,
    );
  }
  return value;
};
// Sign-in runs as Better Auth's role, and what a signed-in staff member does as the app role (ADR-0002).
const AUTH_DATABASE_URL = required('AUTH_DATABASE_URL');
const APP_DATABASE_URL = required('APP_DATABASE_URL');
// The census form's answers reach the database as the public role, which may only run its two functions.
const PUBLIC_DATABASE_URL = required('PUBLIC_DATABASE_URL');

// Runs against production builds (turbo builds the apps first), never against dev servers.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', baseURL: STAFF_URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile-first (onboarding spec, views): the main flows run on a phone's screen too.
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /\.phone\.spec\.ts$/u },
  ],
  webServer: [
    {
      name: 'glitchtip',
      command: 'node fake-glitchtip.ts',
      url: `${GLITCHTIP_URL}/healthz`,
      env: { PORT: String(PORTS.glitchtip) },
    },
    {
      name: 'smtp',
      command: 'node fake-smtp.ts',
      url: `${MAILBOX_URL}/healthz`,
      env: { PORT: String(PORTS.mailbox), SMTP_PORT: String(PORTS.smtp) },
    },
    {
      name: 'api',
      command: 'node dist/server.js',
      cwd: '../apps/api',
      url: `${API_URL}/healthz`,
      env: {
        HOST: '127.0.0.1',
        PORT: String(PORTS.api),
        FORMS_PORT: String(PORTS.apiForms),
        LOG_LEVEL: 'warn',
        SENTRY_DSN: DSNS.api,
        AUTH_DATABASE_URL,
        APP_DATABASE_URL,
        BETTER_AUTH_SECRET: AUTH.secret,
        STAFF_ORIGIN: STAFF_URL,
        PRODUCT_NAME,
        // The backoffice's sender, a stand-in that keeps what it receives.
        SMTP_URL,
        MAIL_FROM,
        // The census: the forms app's routes and the personal links that point to it.
        PUBLIC_DATABASE_URL,
        FORMS_TOKEN,
        CENSUS_URL: FORMS_URL,
        // Admins can set Global's Airtable link in Ajustes (ADR-0005); without the ingest role, nothing syncs here.
        AIRTABLE_LINK_KEY,
      },
    },
    {
      name: 'forms',
      command: `pnpm exec next start --port ${PORTS.forms} --hostname 127.0.0.1`,
      cwd: '../apps/forms',
      url: `http://127.0.0.1:${PORTS.forms}/healthz`,
      env: { PRODUCT_NAME, API_URL: API_FORMS_URL, FORMS_TOKEN },
    },
    {
      name: 'web',
      command: `pnpm exec next start --port ${PORTS.web} --hostname 127.0.0.1`,
      cwd: '../apps/web',
      url: `${WEB_URL}/healthz`,
      env: { PRODUCT_NAME, SENTRY_DSN: DSNS.web, API_URL, CENSUS_URL: FORMS_URL },
    },
    {
      // The staff host as browsers reach it: /api and /telegram/webhook to the API, the rest to the web app.
      name: 'gateway',
      command: 'node fake-gateway.ts',
      url: `${STAFF_URL}/healthz`,
      env: { PORT: String(PORTS.gateway), API_UPSTREAM: API_URL, WEB_UPSTREAM: WEB_URL },
    },
  ],
});
