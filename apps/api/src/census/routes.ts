import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import { whatsappLink } from '@backoffice/domain/whatsapp';
import { getTranslator } from '@backoffice/i18n/messages';
import { captureException } from '@sentry/node';
import { sql } from 'kysely';

import type { CensusConfig } from '../config.js';

import { databaseRefusal } from '../database-errors.js';
import { createRateLimiter } from '../rate-limit.js';
import { schemaRefusal } from '../schema-refusal.js';
import {
  addOption,
  censusLink,
  censusProgress,
  changeOption,
  createCensusLink,
  erasePerson,
  exportPerson,
  listOptions,
  makeCensusToken,
  markLinkSent,
  orderOptions,
} from './census.js';

class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
  ) {
    super(key);
  }
}

export interface CensusRoutesOptions {
  app: Database | undefined;
  staffOrigin: string;
  census: CensusConfig | undefined;
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
  /** Told who was erased, so the team group's posts about them go (ADR-0004); never awaited for long. */
  onErase?: ((personIds: readonly string[]) => Promise<void>) | undefined;
}

const UUID = { type: 'string', format: 'uuid' } as const;
const ID_PARAMS = { type: 'object', properties: { id: UUID }, required: ['id'] } as const;

const can = (roles: string) =>
  sql<{ ok: boolean }>`SELECT private.staff_can(${sql.raw(roles)}) AS ok`;
const ONBOARDING = can("'admin', 'onboarding'");
const ADMIN = can("'admin'");

const require = async (trx: Transaction<DB>, check: typeof ONBOARDING): Promise<void> => {
  if ((await check.execute(trx)).rows[0]?.ok !== true) {
    throw new Refusal(403, 'forbidden');
  }
};

/** The census's staff routes (staff API spec, M2): Censo, personal links, the option lists, export and erasure. */
export const censusRoutes =
  ({ app, staffOrigin, census, actorFor, onErase }: CensusRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    scope.setErrorHandler(async (error, _request, reply) => {
      const refusal = schemaRefusal(error);
      if (!refusal) {
        throw error;
      }
      return reply.code(400).send(refusal);
    });
    // Personal links per staff member and hour: one each for a whole team's queue, not a flood.
    const allowLink = createRateLimiter({ limit: 200, windowMs: 60 * 60_000 });
    const t = getTranslator();

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
          return reply.code(error.status).send({ error: error.key });
        }
        const refusal = databaseRefusal(error);
        if (refusal.report) {
          const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
          request.log.error({ code, routine }, 'Census request failed');
          captureException(
            typeof code === 'string'
              ? new Error(`Census request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({ error: refusal.error });
      }
    };

    scope.get('/census', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        withActor(db, actor, async (trx) => {
          await require(trx, ONBOARDING);
          return censusProgress(trx);
        }),
      ),
    );

    scope.post<{ Params: { id: string } }>(
      '/people/:id/census-link',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          if (!census) {
            throw new Refusal(503, 'unavailable');
          }
          if (!allowLink(actor.userId)) {
            throw new Refusal(429, 'limit');
          }
          const token = makeCensusToken();
          const url = censusLink(census.formsOrigin, token);
          const made = await withActor(db, actor, async (trx) => {
            await require(trx, ONBOARDING);
            const person = (
              await sql<{ name: string; phone: string | null }>`
                SELECT coalesce(p.preferred_name, split_part(p.full_name, ' ', 1)) AS name,
                       (SELECT i.value FROM app.identities i WHERE i.person_id = p.id AND i.kind = 'phone'
                         ORDER BY i.created_at LIMIT 1) AS phone
                  FROM app.people p
                 WHERE p.id = ${request.params.id} AND p.merged_into IS NULL AND p.anonymised_at IS NULL`.execute(
                trx,
              )
            ).rows[0];
            if (!person) {
              throw new Refusal(404, 'notFound');
            }
            const link = await createCensusLink(trx, request.params.id, token);
            return { ...link, person };
          });
          const message = t('censusLink.whatsapp', { name: made.person.name, url });
          return reply.code(201).send({
            id: made.id,
            url,
            expiresAt: made.expiresAt,
            whatsapp: made.person.phone ? (whatsappLink(made.person.phone, message) ?? null) : null,
          });
        }),
    );

    scope.post<{ Params: { id: string } }>(
      '/census-links/:id/sent',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const person = await withActor(db, actor, async (trx) => {
            await require(trx, ONBOARDING);
            return markLinkSent(trx, request.params.id);
          });
          return person ? reply.code(204).send() : reply.code(404).send({ error: 'notFound' });
        }),
    );

    scope.get('/census/options', async (request, reply) =>
      signedIn(request, reply, async (db, actor) => ({
        options: await withActor(db, actor, listOptions),
      })),
    );

    scope.post<{ Body: { kind: 'skill' | 'interest'; label: string } }>(
      '/census/options',
      {
        schema: {
          body: {
            type: 'object',
            required: ['kind', 'label'],
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['skill', 'interest'] },
              label: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const id = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return addOption(trx, { kind: request.body.kind, label: request.body.label.trim() });
          });
          return reply.code(201).send({ id });
        }),
    );

    scope.patch<{
      Params: { id: string };
      Body: { label?: string; active?: boolean; position?: number };
    }>(
      '/census/options/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              label: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
              active: { type: 'boolean' },
              position: { type: 'integer', minimum: 0, maximum: 10_000 },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return changeOption(trx, request.params.id, {
              ...request.body,
              ...(request.body.label === undefined ? {} : { label: request.body.label.trim() }),
            });
          });
          return done ? reply.code(204).send() : reply.code(404).send({ error: 'notFound' });
        }),
    );

    scope.put<{ Body: { kind: 'skill' | 'interest'; ids: string[] } }>(
      '/census/options/order',
      {
        schema: {
          body: {
            type: 'object',
            required: ['kind', 'ids'],
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['skill', 'interest'] },
              ids: { type: 'array', maxItems: 500, uniqueItems: true, items: UUID },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return orderOptions(trx, request.body.kind, request.body.ids);
          });
          return done ? reply.code(204).send() : reply.code(409).send({ error: 'stale' });
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/people/:id/export',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const data = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return exportPerson(trx, request.params.id);
          });
          if (!data) {
            throw new Refusal(404, 'notFound');
          }
          return reply
            .header('content-type', 'application/json; charset=utf-8')
            .header(
              'content-disposition',
              `attachment; filename="persona-${request.params.id}.json"`,
            )
            .send(JSON.stringify(data, null, 2));
        }),
    );

    scope.post<{ Params: { id: string } }>(
      '/people/:id/erase',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const erased = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return erasePerson(trx, request.params.id);
          });
          if (!erased) {
            return reply.code(409).send({ error: 'stale' });
          }
          onErase?.(erased).catch((error: unknown) => captureException(error));
          return reply.code(204).send();
        }),
    );
  };
