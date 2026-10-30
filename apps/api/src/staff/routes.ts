import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import { captureException } from '@sentry/node';
import * as z from 'zod';

import type { InvitedAccounts } from '../auth/invited-accounts.js';
import type { PasswordLinks } from '../auth/password-links.js';

import { PasswordMailFailed } from '../auth/password-links.js';
import { RECENT_SECOND_FACTOR } from '../auth/step-up.js';
import { databaseRefusal } from '../database-errors.js';
import { mailFailure } from '../mail/mailer.js';
import { createRateLimiter } from '../rate-limit.js';
import { schemaRefusal } from '../schema-refusal.js';
import { AUDIT_MAX_PAGE, listAudit } from './audit.js';
import {
  createInvitation,
  deleteInvitation,
  hashInvitationToken,
  type InvitationSender,
  listInvitations,
  makeInvitationToken,
  revokeInvitation,
  revokeOthers,
} from './invitations.js';
import {
  displayNameOf,
  handOverPrivate,
  isAdmin,
  linkPerson,
  listStaff,
  personSuggestions,
  privateRecords,
  STAFF_ROLES,
  type StaffChange,
  updateStaff,
} from './staff.js';

/** A refusal the API decides itself: its status and key, which the staff app shows in words. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
    readonly field?: string,
  ) {
    super(key);
  }
}

export interface StaffDataOptions {
  app: Database | undefined;
  staffOrigin: string;
  invitations?: { accounts: InvitedAccounts; send: InvitationSender } | undefined;
  passwordLinks?: PasswordLinks | undefined;
  endSessions?: ((userId: string) => Promise<number>) | undefined;
  /** Who the request acts for: the signed-in staff member at aal2, through the web, or nobody. */
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
}

const UUID = { type: 'string', format: 'uuid' } as const;
const ROLES = {
  type: 'array',
  items: { type: 'string', enum: [...STAFF_ROLES] },
  uniqueItems: true,
} as const;

/** Better Auth's own rule for an address (zod's), so nobody is invited at one they could never sign in with. */
const EMAIL = z.email();

const requireAdmin = async (trx: Transaction<DB>): Promise<void> => {
  if (!(await isAdmin(trx))) {
    throw new Refusal(403, 'forbidden');
  }
};

/**
 * What a signed-in staff member reads and writes in M0 (ADR-0002): the team (Equipo), invitations, and the audit log
 * (Registro). Every query runs in the member's `withActor` transaction, so the database decides again what they may
 * see and do; the API's own checks are there to answer in words.
 */
export const staffDataRoutes =
  ({ app, staffOrigin, invitations, passwordLinks, endSessions, actorFor }: StaffDataOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    // A request its schema refuses: `invalid`, and the body's field at fault. Any other error goes on.
    scope.setErrorHandler(async (error, _request, reply) => {
      const refusal = schemaRefusal(error);
      if (!refusal) {
        throw error;
      }
      return reply.code(400).send(refusal);
    });

    // Invitation emails per admin and day: enough for a team, too few for a spammer with a stolen account.
    const allowInvitation = createRateLimiter({ limit: 50, windowMs: 24 * 60 * 60_000 });
    // Password links per admin and hour, on top of the one every 15 minutes per account (auth.ts).
    const allowPasswordLink = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });

    /**
     * Runs `run` for the signed-in actor. A write must come from a page on the staff origin, which every browser names
     * in `Origin` on such requests: with SameSite=Lax cookies and JSON-only bodies, a cross-site page can't send one
     * with the session anyway, and this refuses it outright. A refusal, the API's or the database's, becomes its
     * answer; anything else is a fault, reported without the request's body.
     */
    const signedIn = async (
      request: FastifyRequest,
      reply: FastifyReply,
      run: (db: Database, actor: Actor) => Promise<unknown>,
    ): Promise<unknown> => {
      if (!app) {
        return reply.code(503).send({ error: 'unavailable' });
      }
      const actor = await actorFor(request);
      if (!actor) {
        return reply.code(401).send({ error: 'signIn' });
      }
      if (request.method !== 'GET' && request.headers.origin !== staffOrigin) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      try {
        return await run(app, actor);
      } catch (error) {
        if (error instanceof Refusal) {
          return reply.code(error.status).send({
            error: error.key,
            ...(error.field === undefined ? {} : { field: error.field }),
          });
        }
        const refusal = databaseRefusal(error);
        if (refusal.report) {
          // A database error is reported by its SQLSTATE and where it came from, never its message, which can quote
          // what was written; anything else (a bug in the API) as it is.
          const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
          request.log.error(
            { code, routine, constraint: refusal.constraint },
            'Staff request failed',
          );
          captureException(
            typeof code === 'string'
              ? new Error(`Staff request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({
          error: refusal.error,
          ...(refusal.constraint === undefined ? {} : { constraint: refusal.constraint }),
        });
      }
    };

    // The team: everyone sees it (Equipo), to know who is who and assign people to each other.
    scope.get('/staff', async (request, reply) =>
      signedIn(request, reply, async (db, actor) => ({
        me: actor.userId,
        staff: await withActor(db, actor, listStaff),
      })),
    );

    scope.patch<{ Params: { userId: string }; Body: StaffChange }>(
      '/staff/:userId',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          params: { type: 'object', properties: { userId: UUID } },
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              displayName: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
              active: { type: 'boolean' },
              roles: ROLES,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { userId } = request.params;
          const change: StaffChange = {
            ...request.body,
            ...(request.body.displayName === undefined
              ? {}
              : { displayName: request.body.displayName.trim() }),
          };
          const result = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            return updateStaff(trx, userId, change);
          });
          if (result === 'notFound') {
            throw new Refusal(404, 'notFound');
          }
          if (result === 'lastAdmin') {
            throw new Refusal(409, 'lastAdmin');
          }
          // Signed out everywhere at once, not only refused by the database from now on.
          if (change.active === false && endSessions) {
            await endSessions(userId);
          }
          return reply.code(204).send();
        }),
    );

    // A departed member's private outreach records (PLAN M5, step 6): how many, never what, and who inherits them.
    scope.get('/staff/private-records', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        withActor(db, actor, async (trx) => {
          await requireAdmin(trx);
          return { records: await privateRecords(trx) };
        }),
      ),
    );

    scope.post<{ Params: { userId: string }; Body: { to: string } }>(
      '/staff/:userId/private-records',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          params: { type: 'object', properties: { userId: UUID } },
          body: {
            type: 'object',
            required: ['to'],
            additionalProperties: false,
            properties: { to: UUID },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const moved = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            return handOverPrivate(trx, request.params.userId, request.body.to);
          });
          if (moved === 'stillActive' || moved === 'heir') {
            throw new Refusal(409, moved);
          }
          return { moved };
        }),
    );

    // A team account's own person record (PLAN M5, step 5): the suggestions by a shared email, and the link.
    scope.get('/staff/person-suggestions', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        withActor(db, actor, async (trx) => {
          await requireAdmin(trx);
          return { suggestions: await personSuggestions(trx) };
        }),
      ),
    );

    scope.put<{ Params: { userId: string }; Body: { personId: string | null } }>(
      '/staff/:userId/person',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          params: { type: 'object', properties: { userId: UUID } },
          body: {
            type: 'object',
            required: ['personId'],
            additionalProperties: false,
            properties: { personId: { anyOf: [UUID, { type: 'null' }] } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            return linkPerson(trx, request.params.userId, request.body.personId);
          });
          if (result === 'notFound') {
            throw new Refusal(404, 'notFound');
          }
          if (result === 'personGone') {
            throw new Refusal(409, 'personGone');
          }
          if (result === 'personTaken') {
            throw new Refusal(409, 'personTaken');
          }
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { userId: string } }>(
      '/staff/:userId/password-link',
      {
        config: RECENT_SECOND_FACTOR,
        schema: { params: { type: 'object', properties: { userId: UUID } } },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          if (!passwordLinks) {
            throw new Refusal(503, 'unavailable');
          }
          const by = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            if ((await displayNameOf(trx, request.params.userId)) === undefined) {
              throw new Refusal(404, 'notFound');
            }
            return { name: (await displayNameOf(trx, actor.userId)) ?? '' };
          });
          if (!allowPasswordLink(actor.userId)) {
            throw new Refusal(429, 'limit');
          }
          let result;
          try {
            result = await passwordLinks.send(request.params.userId, by);
          } catch (error) {
            if (error instanceof PasswordMailFailed) {
              request.log.error(error.message);
              captureException(error);
              throw new Refusal(502, 'mail');
            }
            throw error;
          }
          if (result === 'no-account') {
            throw new Refusal(404, 'notFound');
          }
          if (result === 'not-enrolled') {
            throw new Refusal(409, 'notEnrolled');
          }
          if (result === 'too-soon') {
            throw new Refusal(429, 'limit');
          }
          return reply.code(202).send();
        }),
    );

    scope.get('/invitations', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        withActor(db, actor, async (trx) => {
          await requireAdmin(trx);
          return { invitations: await listInvitations(trx) };
        }),
      ),
    );

    scope.post<{ Body: { email: string; roles: (typeof STAFF_ROLES)[number][] } }>(
      '/invitations',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          body: {
            type: 'object',
            required: ['email', 'roles'],
            additionalProperties: false,
            properties: {
              email: { type: 'string', minLength: 3, maxLength: 254 },
              roles: { ...ROLES, minItems: 1 },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          if (!invitations) {
            throw new Refusal(503, 'unavailable');
          }
          const email = request.body.email.trim().toLowerCase();
          if (!EMAIL.safeParse(email).success) {
            throw new Refusal(400, 'invalid', 'email');
          }
          const roles = STAFF_ROLES.filter((role) => request.body.roles.includes(role));
          const existing = await invitations.accounts.accountId(email);
          const token = makeInvitationToken();
          const made = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            // Already in the team: their roles are changed in Equipo, not by inviting them again. A deactivated
            // member may be invited back; accepting reactivates them.
            if (existing !== undefined) {
              const member = await trx
                .selectFrom('app.staff')
                .select('active')
                .where('user_id', '=', existing)
                .executeTakeFirst();
              if (member?.active) {
                throw new Refusal(409, 'alreadyStaff');
              }
            }
            if (!allowInvitation(actor.userId)) {
              throw new Refusal(429, 'limit');
            }
            const id = await createInvitation(trx, {
              email,
              roles,
              tokenHash: hashInvitationToken(token),
            });
            // Sent inside the transaction: if the email can't go out, the invitation isn't kept either.
            try {
              await invitations.send({
                email,
                roles,
                inviter: (await displayNameOf(trx, actor.userId)) ?? '',
                token,
              });
            } catch (error) {
              const failure = mailFailure(error);
              request.log.error(failure.message);
              captureException(failure);
              throw new Refusal(502, 'mail');
            }
            await revokeOthers(trx, { id, email });
            return id;
          });
          return reply.code(201).send({ id: made });
        }),
    );

    scope.post<{ Params: { id: string } }>(
      '/invitations/:id/revoke',
      {
        config: RECENT_SECOND_FACTOR,
        schema: { params: { type: 'object', properties: { id: UUID } } },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            return revokeInvitation(trx, request.params.id);
          });
          return done ? reply.code(204).send() : reply.code(404).send({ error: 'notFound' });
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/invitations/:id',
      {
        config: RECENT_SECOND_FACTOR,
        schema: { params: { type: 'object', properties: { id: UUID } } },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            return deleteInvitation(trx, request.params.id);
          });
          return done ? reply.code(204).send() : reply.code(404).send({ error: 'notFound' });
        }),
    );

    scope.get<{ Querystring: { before?: string; limit?: number } }>(
      '/audit',
      {
        config: RECENT_SECOND_FACTOR,
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              before: { type: 'string', pattern: '^[0-9]{1,18}$' },
              limit: { type: 'integer', minimum: 1, maximum: AUDIT_MAX_PAGE },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          withActor(db, actor, async (trx) => {
            await requireAdmin(trx);
            return listAudit(trx, request.query);
          }),
        ),
    );
  };
