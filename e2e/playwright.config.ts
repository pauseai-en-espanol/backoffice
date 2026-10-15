import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

import {
  API_URL,
  AUTH,
  DSNS,
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
      },
    },
    {
      name: 'web',
      command: `pnpm exec next start --port ${PORTS.web} --hostname 127.0.0.1`,
      cwd: '../apps/web',
      url: `${WEB_URL}/healthz`,
      env: { PRODUCT_NAME, SENTRY_DSN: DSNS.web, API_URL },
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
