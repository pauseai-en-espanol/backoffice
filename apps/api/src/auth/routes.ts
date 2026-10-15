import type { Database } from '@backoffice/db/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { withActor } from '@backoffice/db/actor';

import type { CensusConfig } from '../config.js';
import type { SyncCounts } from '../imports/airtable-sync.js';
import type { PasswordLinks } from './password-links.js';

import { censusRoutes } from '../census/routes.js';
import { outreachRoutes } from '../outreach/routes.js';
import { peopleRoutes } from '../people/routes.js';
import { type InvitationSender } from '../staff/invitations.js';
import { staffDataRoutes } from '../staff/routes.js';
import { staffSelf } from '../staff/staff.js';
import { type TelegramLinking, telegramLinkRoutes } from '../telegram/linking.js';
import { type Auth, AUTH_BASE_PATH, TWO_FACTOR_COOKIE, VISITOR_ADDRESS_HEADER } from './auth.js';
import { invitationRoutes } from './invitation-routes.js';
import { type InvitedAccounts } from './invited-accounts.js';
import { actorOf, type FoundSession, stageOf } from './session.js';
import { visitorAddress } from './visitor.js';

/**
 * The Better Auth endpoints the staff app uses, each with the only body fields passed on; every other endpoint answers
 * 404 (sign-up, password changes while signed in, account linking, and whatever a Better Auth upgrade adds). Fields
 * left out on purpose: `rememberMe` (false makes a 24-hour session), `trustDevice` (skips TOTP for 30 days),
 * `callbackURL` and `redirectTo` (the link is the API's own, auth.ts), and the enrolment's `method` and `issuer` (TOTP
 * only, its issuer from configuration).
 */
const ENDPOINTS: Readonly<Record<string, readonly string[]>> = {
  '/sign-in/email': ['email', 'password'],
  '/sign-out': [],
  '/two-factor/enable': ['password'],
  '/two-factor/verify-totp': ['code'],
  '/two-factor/verify-backup-code': ['code'],
  // Sets a password with a single-use link's token: from the owner's create-account command, "He olvidado mi
  // contraseña" or an admin's link from Equipo.
  '/reset-password': ['token', 'newPassword'],
  // "He olvidado mi contraseña": the same answer whether or not the address has an account; Better Auth limits it per
  // visitor, and auth.ts sends an account at most one link every 15 minutes.
  '/request-password-reset': ['email'],
};

/** The headers Better Auth reads: the session, its CSRF checks (Origin, Fetch Metadata), the session's record. */
const PASSED_HEADERS = [
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'sec-fetch-site',
  'sec-fetch-mode',
  'sec-fetch-dest',
];

/** Response headers passed back: the body's type, cookies (below) and the rate limiter's wait. */
const RETURNED_HEADERS = ['content-type', 'x-retry-after'];

const pick = (body: unknown, fields: readonly string[]): Record<string, unknown> => {
  const source =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    fields.filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]),
  );
};

/**
 * Better Auth returns the session's token in the body too; the browser never needs it, and it is the cookie's whole
 * point that page scripts can't read it.
 */
const withoutToken = (body: string, contentType: string | null): string => {
  if (!contentType?.startsWith('application/json')) {
    return body;
  }
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'token' in value) {
      const { token: _token, ...rest } = value;
      return JSON.stringify(rest);
    }
  } catch {
    // Not JSON after all: passed on as it is.
  }
  return body;
};

const cookieHeaders = (request: FastifyRequest): Headers => {
  const headers = new Headers();
  if (request.headers.cookie) {
    headers.set('cookie', request.headers.cookie);
  }
  return headers;
};

const hasCookie = (request: FastifyRequest, name: string): boolean =>
  (request.headers.cookie ?? '').split(';').some((pair) => pair.trim().startsWith(`${name}=`));

export interface StaffApiOptions {
  /** Sign-in; without it every route here answers 503. */
  auth?: { auth: Auth; staffOrigin: string };
  /** The pauseai_backoffice_app role's pool; without it the signed-in data routes answer 503. */
  app?: Database;
  /** Invitations: the invited accounts, as Better Auth's role, and the email. Without them, none is sent. */
  invitations?: { accounts: InvitedAccounts; send: InvitationSender };
  /** Links to choose a password, sent by an admin from Equipo. Without them, none is sent. */
  passwordLinks?: PasswordLinks;
  /** Ends every session of an account, as Better Auth's role: a deactivated staff member's. */
  endSessions?: (userId: string) => Promise<number>;
  /** The Airtable sync, run now from Importar (ADR-0005); undefined when not configured. */
  syncAirtable?: (() => Promise<SyncCounts>) | undefined;
  /** Told about every new person from the staff app (the bot's team group, ADR-0004). */
  onArrival?: ((personId: string) => Promise<void>) | undefined;
  /** Told when someone is claimed from the staff app, so the team group's post says who. */
  onClaim?: ((personId: string) => Promise<void>) | undefined;
  /** Told who was erased, so the team group's posts about them go. */
  onErase?: ((personIds: readonly string[]) => Promise<void>) | undefined;
  /** The census (M2): where personal links point; without it, no personal link can be made. */
  census?: CensusConfig | undefined;
  /** Linking Telegram accounts (ADR-0004); without the bot, the link routes say it isn't configured. */
  telegram?: TelegramLinking | undefined;
}

/**
 * Everything under `/api` (ADR-0003): Better Auth's endpoints and the signed-in routes. They answer only on the staff
 * host, as the gateway routes them: any other Host gets 404, so a gateway route added by mistake elsewhere still
 * reaches nothing. The web app's server-side calls name the staff host too.
 */
export const staffApiRoutes =
  ({
    auth: signIn,
    app,
    invitations,
    passwordLinks,
    endSessions,
    syncAirtable,
    onArrival,
    onClaim,
    onErase,
    census,
    telegram,
  }: StaffApiOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    if (!signIn) {
      scope.all('/*', async (_request, reply) =>
        reply.code(503).send({ error: 'Sign-in is not configured' }),
      );
      return;
    }
    const { auth, staffOrigin } = signIn;
    const staffHost = new URL(staffOrigin).host;

    // JSON bodies only: Fastify also parses text/plain, which a cross-site form can send without a preflight.
    scope.removeContentTypeParser('text/plain');

    // Every answer is data, never a page: not to be sniffed into something else, framed, or read by another site.
    scope.addHook('onRequest', async (request, reply) => {
      void reply
        .header('cache-control', 'no-store')
        .header('x-content-type-options', 'nosniff')
        .header('cross-origin-resource-policy', 'same-origin')
        .header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
      if (request.headers.host !== staffHost) {
        return reply.code(404).send({ error: 'notFound' });
      }
    });

    scope.post<{ Params: { '*': string } }>('/auth/*', async (request, reply) => {
      const path = `/${request.params['*']}`;
      const fields = ENDPOINTS[path];
      if (!fields) {
        return reply.code(404).send({ error: 'notFound' });
      }
      const headers = new Headers({ 'content-type': 'application/json' });
      for (const name of PASSED_HEADERS) {
        const value = request.headers[name];
        if (typeof value === 'string') {
          headers.set(name, value);
        }
      }
      const address = visitorAddress(
        request.headers['x-forwarded-for'],
        request.socket.remoteAddress,
      );
      if (address !== undefined) {
        headers.set(VISITOR_ADDRESS_HEADER, address);
      }
      const response = await auth.handler(
        new Request(`${staffOrigin}${AUTH_BASE_PATH}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(pick(request.body, fields)),
        }),
      );
      void reply.code(response.status);
      for (const name of RETURNED_HEADERS) {
        const value = response.headers.get(name);
        if (value !== null) {
          void reply.header(name, value);
        }
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) {
        void reply.header('set-cookie', cookies);
      }
      return reply.send(withoutToken(await response.text(), response.headers.get('content-type')));
    });

    const findSession = async (request: FastifyRequest): Promise<FoundSession | null> =>
      auth.api.getSession({ headers: cookieHeaders(request) });

    // Where the request stands, for the staff app's pages to decide what to show. Never the token, nor the session's
    // address or browser. `staff` is the account as active staff, or null: the database's own answer.
    scope.get('/session', async (request, reply) => {
      const found = await findSession(request);
      const stage = stageOf(found, hasCookie(request, TWO_FACTOR_COOKIE));
      if (!found || stage === 'signed-out' || stage === 'challenge') {
        return reply.code(401).send({ stage });
      }
      const { id, name, email } = found.user;
      const actor = actorOf(found);
      const staff =
        actor && app ? ((await withActor(app, actor, (trx) => staffSelf(trx, id))) ?? null) : null;
      return { stage, user: { id, name, email }, staff };
    });

    // Accepting an invitation, for whoever holds its link (invitation-routes.ts).
    await scope.register(
      invitationRoutes({ app, accounts: invitations?.accounts, staffOrigin, findSession }),
    );

    // Everything a signed-in staff member reads and writes (staff/routes.ts), always as an aal2 actor.
    await scope.register(
      staffDataRoutes({
        app,
        staffOrigin,
        invitations,
        passwordLinks,
        endSessions,
        actorFor: async (request) => actorOf(await findSession(request)),
      }),
    );

    // Onboarding (people/routes.ts): onboarding staff and admins, as the database decides.
    await scope.register(
      peopleRoutes({
        app,
        staffOrigin,
        actorFor: async (request) => actorOf(await findSession(request)),
        syncAirtable,
        onArrival,
        onClaim,
      }),
    );

    // The census's staff side (census/routes.ts).
    await scope.register(
      censusRoutes({
        app,
        staffOrigin,
        census,
        onErase,
        actorFor: async (request) => actorOf(await findSession(request)),
      }),
    );

    // Outreach (outreach/routes.ts): outreach staff and admins, as the database decides.
    await scope.register(
      outreachRoutes({
        app,
        staffOrigin,
        actorFor: async (request) => actorOf(await findSession(request)),
      }),
    );

    // Linking a Telegram account to the bot (telegram/linking.ts).
    await scope.register(
      telegramLinkRoutes({
        linking: telegram,
        app,
        staffOrigin,
        actorFor: async (request) => actorOf(await findSession(request)),
      }),
    );
  };
