import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { fieldsIn, MERGE_FIELDS, type Tier } from '@backoffice/domain/outreach';
import { captureException } from '@sentry/node';
import { sql } from 'kysely';

import { databaseRefusal } from '../database-errors.js';
import { fromAnotherSite } from '../fetch-site.js';
import { createRateLimiter } from '../rate-limit.js';
import { schemaRefusal } from '../schema-refusal.js';
import { importCampaign, type ImportFiles } from './import.js';
import {
  addContactNote,
  addOrganisationNote,
  addTargets,
  campaignExists,
  type CampaignInput,
  claimTarget,
  type ContactInput,
  createCampaign,
  createContact,
  createOrganisation,
  deleteAnchor,
  deleteTarget,
  eraseContact,
  exportContact,
  getCampaign,
  getContact,
  getOrganisation,
  handoverFor,
  listCampaigns,
  listContacts,
  listOrganisations,
  markSent,
  mergePrivateContact,
  nextTarget,
  ORGANISATION_KINDS,
  organisationExists,
  type OrganisationInput,
  type OrganisationKind,
  putAnchor,
  putTemplate,
  RELATIONSHIP_STAGES,
  rightsContacts,
  TARGET_STATUSES,
  targetCampaign,
  type TargetInput,
  teamMatches,
  TREATMENTS,
  updateCampaign,
  updateContact,
  updateOrganisation,
  updateTarget,
  type Visibility,
} from './outreach.js';

/** A refusal the API decides itself: its status and key, which the staff app shows in words. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(key);
  }
}

export interface OutreachRoutesOptions {
  app: Database | undefined;
  staffOrigin: string;
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
}

const UUID = { type: 'string', format: 'uuid' } as const;
const NULLABLE_UUID = { type: ['string', 'null'], format: 'uuid' } as const;
const ID_PARAMS = { type: 'object', properties: { id: UUID }, required: ['id'] } as const;
const TEXT = (max: number) => ({ type: 'string', maxLength: max }) as const;
const NULLABLE_TEXT = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const;
const REQUIRED_TEXT = (max: number) =>
  ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const;
const WEBSITE = {
  type: ['string', 'null'],
  maxLength: 500,
  pattern: '^(https?://\\S+)?$',
} as const;
const KEY = { type: 'string', pattern: '^[a-z0-9_-]{1,60}$' } as const;
const NULLABLE_KEY = { type: ['string', 'null'], pattern: '^([a-z0-9_-]{1,60})?$' } as const;
const SOURCES = (max: number) =>
  ({ type: 'array', maxItems: max, items: REQUIRED_TEXT(500) }) as const;
const TIER = { type: 'string', enum: ['A', 'B'] } as const;

const CONTACT_PROPERTIES = {
  organisationId: NULLABLE_UUID,
  orgDisplay: REQUIRED_TEXT(300),
  personName: NULLABLE_TEXT(200),
  role: NULLABLE_TEXT(200),
  treatment: { type: 'string', enum: [...TREATMENTS] },
  greetingName: NULLABLE_TEXT(200),
  email: NULLABLE_TEXT(254),
  emailsExtra: { type: 'array', maxItems: 10, items: TEXT(254) },
  phone: NULLABLE_TEXT(50),
  website: WEBSITE,
  territory: NULLABLE_TEXT(100),
  scope: NULLABLE_TEXT(50),
  sector: NULLABLE_TEXT(100),
  tier: TIER,
  anchor: NULLABLE_KEY,
  tags: { type: 'array', maxItems: 30, uniqueItems: true, items: REQUIRED_TEXT(50) },
  stage: { type: 'string', enum: [...RELATIONSHIP_STAGES] },
  ownerId: NULLABLE_UUID,
  reason: NULLABLE_TEXT(2000),
  sources: SOURCES(30),
  needsReview: { type: 'boolean' },
  hold: { type: 'boolean' },
  holdReason: NULLABLE_TEXT(500),
  notes: NULLABLE_TEXT(4000),
  // "Solo yo" (true) or "Equipo" (false), PLAN M5, step 6: private only when made, then only ever shared.
  private: { type: 'boolean' },
  // With `private: false`: its history while private goes to the team too ("Compartir también mis notas", R52).
  shareHistory: { type: 'boolean' },
} as const;

const ORGANISATION_PROPERTIES = {
  name: REQUIRED_TEXT(200),
  kind: { type: 'string', enum: [...ORGANISATION_KINDS] },
  territory: NULLABLE_TEXT(100),
  website: WEBSITE,
  private: { type: 'boolean' },
  shareHistory: { type: 'boolean' },
} as const;

const DATE = { type: 'string', format: 'date' } as const;
/** A note on a timeline: what it says and, optionally, the day it happened (PLAN M5, step 6). */
const NOTE_BODY = {
  type: 'object',
  required: ['body'],
  additionalProperties: false,
  properties: { body: REQUIRED_TEXT(4000), happenedOn: DATE, private: { type: 'boolean' } },
} as const;
const VISIBILITY = { type: 'string', enum: ['private', 'team'] } as const;

interface NoteInput {
  body: string;
  happenedOn?: string;
  /** "Solo yo": for its writer alone (PLAN M5, step 6). */
  private?: boolean;
}

const CAMPAIGN_PROPERTIES = {
  name: REQUIRED_TEXT(200),
  goal: NULLABLE_TEXT(2000),
  language: { type: 'string', pattern: '^[a-z]{2}$' },
  fromName: NULLABLE_TEXT(200),
  fromEmail: NULLABLE_TEXT(254),
  signature: TEXT(2000),
  status: { type: 'string', enum: ['draft', 'active', 'closed'] },
  ownerId: NULLABLE_UUID,
} as const;

const TARGET_PROPERTIES = {
  status: { type: 'string', enum: [...TARGET_STATUSES] },
  ownerId: NULLABLE_UUID,
  priority: { type: ['integer', 'null'], minimum: 1, maximum: 1_000_000 },
  anchor: NULLABLE_KEY,
  nextAction: NULLABLE_TEXT(300),
  nextActionDue: { type: ['string', 'null'], format: 'date' },
  notes: NULLABLE_TEXT(4000),
} as const;

const OUTREACH = sql<{ ok: boolean }>`SELECT private.staff_can('admin', 'outreach') AS ok`;
const ADMIN = sql<{ ok: boolean }>`SELECT private.staff_can('admin') AS ok`;

/**
 * "Compartir también mis notas" (PLAN R52): for this transaction only, a private contact or organisation shared with
 * the team (or merged into the team's) takes its history while private along; the database does it as it's shared.
 */
const withHistory = async (trx: Transaction<DB>): Promise<void> => {
  await sql`SELECT set_config('app.share_history', 'on', true)`.execute(trx);
};

const require = async (trx: Transaction<DB>, check: typeof OUTREACH): Promise<void> => {
  if ((await check.execute(trx)).rows[0]?.ok !== true) {
    throw new Refusal(403, 'forbidden');
  }
};

/** The refusals the outreach rules raise that the API answers in its own words. */
const outreachRefusal = (error: unknown): Refusal | undefined => {
  const { code, hint, constraint } = (error ?? {}) as {
    code?: unknown;
    hint?: unknown;
    constraint?: unknown;
  };
  if (code === '23514' && hint === 'needsReview') {
    return new Refusal(409, 'needsReview');
  }
  if (code === '23514' && hint === 'sent') {
    return new Refusal(409, 'sent');
  }
  if (code === '23514' && constraint === 'contacts_reason_sources_check') {
    return new Refusal(400, 'invalid', { field: 'reason' });
  }
  // Private records (PLAN M5, step 6): the team's stay the team's; a team contact's organisation is the team's; a
  // campaign writes to team contacts only.
  if (
    code === '23514' &&
    (hint === 'shared' || hint === 'organisationPrivate' || hint === 'private')
  ) {
    return new Refusal(409, hint);
  }
  return undefined;
};

/** A contact's email, extra emails and phone, normalised as identities are; a field that won't is refused by name. */
const normalisedContact = <T extends ContactInput>(input: T): T => {
  const out: ContactInput = { ...input };
  const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
  if (input.email !== undefined && !blank(input.email)) {
    out.email = normalizeEmail(input.email as string);
    if (out.email === undefined) {
      throw new Refusal(400, 'invalid', { field: 'email' });
    }
  }
  if (input.phone !== undefined && !blank(input.phone)) {
    out.phone = normalizePhone(input.phone as string);
    if (out.phone === undefined) {
      throw new Refusal(400, 'invalid', { field: 'phone' });
    }
  }
  if (Array.isArray(input.emailsExtra)) {
    const extra = (input.emailsExtra as string[])
      .filter((value) => value.trim() !== '')
      .map((value) => normalizeEmail(value));
    if (extra.some((value) => value === undefined)) {
      throw new Refusal(400, 'invalid', { field: 'emailsExtra' });
    }
    out.emailsExtra = [...new Set(extra)];
  }
  if (Array.isArray(input.tags)) {
    out.tags = (input.tags as string[]).map((tag) => tag.trim());
  }
  if (Array.isArray(input.sources)) {
    out.sources = (input.sources as string[]).map((source) => source.trim());
  }
  return out as T;
};

const flag = (value: unknown): boolean | undefined =>
  value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : undefined;

/** The outreach routes (staff API spec, M3): outreach staff and admins; erasure and import for admins. */
export const outreachRoutes =
  ({ app, staffOrigin, actorFor }: OutreachRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    scope.setErrorHandler(async (error, _request, reply) => {
      const refusal = schemaRefusal(error);
      if (!refusal) {
        throw error;
      }
      return reply.code(400).send(refusal);
    });
    // Imports per admin and hour: a campaign is imported once, after a dry run or two.
    const allowImport = createRateLimiter({ limit: 20, windowMs: 60 * 60_000 });
    const IMPORT_BODY_LIMIT = 5 * 1024 * 1024 + 64 * 1024;

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
        const known = error instanceof Refusal ? error : outreachRefusal(error);
        if (known) {
          return reply.code(known.status).send({ error: known.key, ...known.extra });
        }
        const refusal = databaseRefusal(error);
        if (refusal.report) {
          const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
          request.log.error(
            { code, routine, constraint: refusal.constraint },
            'Outreach request failed',
          );
          captureException(
            typeof code === 'string'
              ? new Error(`Outreach request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({
          error: refusal.error,
          ...(refusal.constraint === undefined ? {} : { constraint: refusal.constraint }),
        });
      }
    };

    /** Runs `run` in the actor's transaction once they're outreach staff or an admin. */
    const outreach = <T>(
      db: Database,
      actor: Actor,
      run: (trx: Transaction<DB>) => Promise<T>,
      check = OUTREACH,
    ): Promise<T> =>
      withActor(db, actor, async (trx) => {
        await require(trx, check);
        return run(trx);
      });

    const found = <T>(value: T | undefined | false): T => {
      if (value === undefined || value === false) {
        throw new Refusal(404, 'notFound');
      }
      return value;
    };

    // Organisations ---------------------------------------------------------------------------------------------

    scope.get<{ Querystring: { q?: string; kind?: OrganisationKind; visibility?: Visibility } }>(
      '/outreach/organisations',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              q: TEXT(200),
              kind: { type: 'string', enum: [...ORGANISATION_KINDS] },
              visibility: VISIBILITY,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => ({
          organisations: await outreach(db, actor, (trx) => listOrganisations(trx, request.query)),
        })),
    );

    scope.post<{ Body: OrganisationInput & { private?: boolean } }>(
      '/outreach/organisations',
      {
        schema: {
          body: {
            type: 'object',
            required: ['name', 'kind'],
            additionalProperties: false,
            properties: ORGANISATION_PROPERTIES,
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { private: isPrivate, ...input } = request.body;
          const id = await outreach(db, actor, (trx) => createOrganisation(trx, input, isPrivate));
          return reply.code(201).send({ id });
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/outreach/organisations/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          found(await outreach(db, actor, (trx) => getOrganisation(trx, request.params.id))),
        ),
    );

    scope.patch<{
      Params: { id: string };
      Body: OrganisationInput & { private?: boolean; shareHistory?: boolean };
    }>(
      '/outreach/organisations/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: ORGANISATION_PROPERTIES,
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { private: isPrivate, shareHistory, ...input } = request.body;
          found(
            await outreach(db, actor, async (trx) => {
              if (isPrivate === false && shareHistory === true) {
                await withHistory(trx);
              }
              return updateOrganisation(trx, request.params.id, input, isPrivate);
            }),
          );
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { id: string }; Body: NoteInput }>(
      '/outreach/organisations/:id/notes',
      { schema: { params: ID_PARAMS, body: NOTE_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await outreach(db, actor, async (trx) => {
            found(await organisationExists(trx, request.params.id));
            await addOrganisationNote(trx, request.params.id, request.body.body.trim(), {
              happenedOn: request.body.happenedOn,
              isPrivate: request.body.private,
            });
          });
          return reply.code(201).send({});
        }),
    );

    // Contacts --------------------------------------------------------------------------------------------------

    scope.get<{ Querystring: Record<string, string | undefined> }>(
      '/outreach/contacts',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              q: TEXT(200),
              tier: TIER,
              territory: TEXT(100),
              kind: { type: 'string', enum: [...ORGANISATION_KINDS] },
              stage: { type: 'string', enum: [...RELATIONSHIP_STAGES] },
              owner: { anyOf: [{ type: 'string', enum: ['me', 'none'] }, UUID] },
              review: { type: 'string', enum: ['true', 'false'] },
              hold: { type: 'string', enum: ['true', 'false'] },
              visibility: VISIBILITY,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { q, tier, territory, kind, stage, owner, review, hold, visibility } =
            request.query;
          return {
            contacts: await outreach(db, actor, (trx) =>
              listContacts(
                trx,
                {
                  q,
                  tier: tier as Tier | undefined,
                  territory,
                  kind: kind as OrganisationKind | undefined,
                  stage,
                  owner,
                  review: flag(review),
                  hold: flag(hold),
                  visibility: visibility as Visibility | undefined,
                },
                actor.userId,
              ),
            ),
          };
        }),
    );

    scope.post<{ Body: ContactInput & { private?: boolean } }>(
      '/outreach/contacts',
      {
        schema: {
          body: {
            type: 'object',
            required: ['orgDisplay'],
            additionalProperties: false,
            properties: CONTACT_PROPERTIES,
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { private: isPrivate, ...rest } = request.body;
          const input = normalisedContact(rest);
          const id = await outreach(db, actor, (trx) => createContact(trx, input, isPrivate));
          return reply.code(201).send({ id });
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/outreach/contacts/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          found(await outreach(db, actor, (trx) => getContact(trx, request.params.id))),
        ),
    );

    scope.patch<{
      Params: { id: string };
      Body: ContactInput & { private?: boolean; shareHistory?: boolean };
    }>(
      '/outreach/contacts/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: CONTACT_PROPERTIES,
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { private: isPrivate, shareHistory, ...rest } = request.body;
          const input = normalisedContact(rest);
          found(
            await outreach(db, actor, async (trx) => {
              if (isPrivate === false && shareHistory === true) {
                await withHistory(trx);
              }
              return updateContact(trx, request.params.id, input, isPrivate);
            }),
          );
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { id: string }; Body: NoteInput }>(
      '/outreach/contacts/:id/notes',
      { schema: { params: ID_PARAMS, body: NOTE_BODY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await outreach(db, actor, async (trx) => {
            found(await getContact(trx, request.params.id));
            await addContactNote(trx, request.params.id, request.body.body.trim(), {
              happenedOn: request.body.happenedOn,
              isPrivate: request.body.private,
            });
          });
          return reply.code(201).send({});
        }),
    );

    // Private records (PLAN M5, step 6): the team contacts one's own may be, to merge it into when sharing it.
    scope.get<{ Params: { id: string } }>(
      '/outreach/contacts/:id/matches',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => ({
          contacts: await outreach(db, actor, async (trx) => {
            found(await getContact(trx, request.params.id));
            return teamMatches(trx, request.params.id);
          }),
        })),
    );

    scope.post<{ Params: { id: string }; Body: { into: string; shareHistory?: boolean } }>(
      '/outreach/contacts/:id/merge',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['into'],
            additionalProperties: false,
            properties: { into: UUID, shareHistory: { type: 'boolean' } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await outreach(db, actor, async (trx) => {
            if (request.body.shareHistory === true) {
              await withHistory(trx);
            }
            return mergePrivateContact(trx, request.params.id, request.body.into);
          });
          return done ? reply.code(204).send() : reply.code(409).send({ error: 'stale' });
        }),
    );

    // A rights request (personal data spec, rights), for admins: the person's contacts, private ones too, by an
    // exact email, phone or name; and everything kept about one, recorded as an export.
    scope.get<{ Querystring: { q: string } }>(
      '/outreach/rights',
      {
        schema: {
          querystring: {
            type: 'object',
            required: ['q'],
            properties: { q: REQUIRED_TEXT(254) },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const q = request.query.q.trim();
          const exact = q.includes('@') ? normalizeEmail(q) : normalizePhone(q);
          return {
            contacts: await outreach(db, actor, (trx) => rightsContacts(trx, exact ?? q), ADMIN),
          };
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/outreach/contacts/:id/export',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        fromAnotherSite(request)
          ? reply.code(403).send({ error: 'forbidden' })
          : signedIn(request, reply, async (db, actor) => {
              const data = found(
                await outreach(db, actor, (trx) => exportContact(trx, request.params.id), ADMIN),
              );
              return reply
                .header('content-type', 'application/json; charset=utf-8')
                .header(
                  'content-disposition',
                  `attachment; filename="contacto-${request.params.id}.json"`,
                )
                .send(JSON.stringify(data, null, 2));
            }),
    );

    scope.post<{ Params: { id: string } }>(
      '/outreach/contacts/:id/erase',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await outreach(
            db,
            actor,
            (trx) => eraseContact(trx, request.params.id),
            ADMIN,
          );
          return done ? reply.code(204).send() : reply.code(409).send({ error: 'stale' });
        }),
    );

    // Campaigns -------------------------------------------------------------------------------------------------

    scope.get('/outreach/campaigns', async (request, reply) =>
      signedIn(request, reply, async (db, actor) => ({
        campaigns: await outreach(db, actor, listCampaigns),
      })),
    );

    scope.post<{ Body: CampaignInput }>(
      '/outreach/campaigns',
      {
        schema: {
          body: {
            type: 'object',
            required: ['slug', 'name'],
            additionalProperties: false,
            properties: {
              slug: { type: 'string', maxLength: 80, pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
              ...CAMPAIGN_PROPERTIES,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const input = { ...request.body };
          if (typeof input.fromEmail === 'string' && input.fromEmail.trim() !== '') {
            input.fromEmail = normalizeEmail(input.fromEmail);
            if (input.fromEmail === undefined) {
              throw new Refusal(400, 'invalid', { field: 'fromEmail' });
            }
          }
          const id = await outreach(db, actor, (trx) => createCampaign(trx, input));
          return reply.code(201).send({ id });
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/outreach/campaigns/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          found(await outreach(db, actor, (trx) => getCampaign(trx, request.params.id))),
        ),
    );

    scope.patch<{ Params: { id: string }; Body: CampaignInput }>(
      '/outreach/campaigns/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: CAMPAIGN_PROPERTIES,
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const input = { ...request.body };
          if (typeof input.fromEmail === 'string' && input.fromEmail.trim() !== '') {
            input.fromEmail = normalizeEmail(input.fromEmail);
            if (input.fromEmail === undefined) {
              throw new Refusal(400, 'invalid', { field: 'fromEmail' });
            }
          }
          found(await outreach(db, actor, (trx) => updateCampaign(trx, request.params.id, input)));
          return reply.code(204).send();
        }),
    );

    scope.put<{
      Params: { id: string; tier: Tier };
      Body: {
        subject: string;
        body: string;
        maxWords?: number | null;
        sources: string[];
        notes?: string | null;
      };
    }>(
      '/outreach/campaigns/:id/templates/:tier',
      {
        schema: {
          params: {
            type: 'object',
            required: ['id', 'tier'],
            properties: { id: UUID, tier: TIER },
          },
          body: {
            type: 'object',
            required: ['subject', 'body', 'sources'],
            additionalProperties: false,
            properties: {
              subject: REQUIRED_TEXT(300),
              body: REQUIRED_TEXT(40_000),
              maxWords: { type: ['integer', 'null'], minimum: 1, maximum: 100_000 },
              sources: SOURCES(50),
              notes: NULLABLE_TEXT(4000),
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { subject, body, maxWords, sources, notes } = request.body;
          const unknown = fieldsIn(`${subject}\n${body}`).filter(
            (field) => !(MERGE_FIELDS as readonly string[]).includes(field),
          );
          if (unknown.length > 0) {
            throw new Refusal(400, 'invalid', { field: 'body', fields: unknown });
          }
          await outreach(db, actor, async (trx) => {
            found(await campaignExists(trx, request.params.id));
            await putTemplate(trx, request.params.id, request.params.tier, {
              subject: subject.trim(),
              body: body.trim(),
              maxWords: maxWords ?? null,
              sources: sources.map((source) => source.trim()),
              notes: notes?.trim() || null,
            });
          });
          return reply.code(204).send();
        }),
    );

    const ANCHOR_PARAMS = {
      type: 'object',
      required: ['id', 'key'],
      properties: { id: UUID, key: KEY },
    } as const;

    scope.put<{
      Params: { id: string; key: string };
      Body: { label: string; text: string; sources: string[] };
    }>(
      '/outreach/campaigns/:id/anchors/:key',
      {
        schema: {
          params: ANCHOR_PARAMS,
          body: {
            type: 'object',
            required: ['label', 'text', 'sources'],
            additionalProperties: false,
            properties: {
              label: REQUIRED_TEXT(200),
              text: REQUIRED_TEXT(4000),
              sources: { ...SOURCES(30), minItems: 1 },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await outreach(db, actor, async (trx) => {
            found(await campaignExists(trx, request.params.id));
            await putAnchor(trx, request.params.id, request.params.key, {
              label: request.body.label.trim(),
              text: request.body.text.trim(),
              sources: request.body.sources.map((source) => source.trim()),
            });
          });
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string; key: string } }>(
      '/outreach/campaigns/:id/anchors/:key',
      { schema: { params: ANCHOR_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const outcome = await outreach(db, actor, (trx) =>
            deleteAnchor(trx, request.params.id, request.params.key),
          );
          if (outcome === 'inUse') {
            throw new Refusal(409, 'inUse');
          }
          found(outcome === 'deleted');
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { id: string }; Body: { contactIds: string[] } }>(
      '/outreach/campaigns/:id/targets',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['contactIds'],
            additionalProperties: false,
            properties: {
              contactIds: {
                type: 'array',
                minItems: 1,
                maxItems: 1000,
                uniqueItems: true,
                items: UUID,
              },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const added = await outreach(db, actor, async (trx) => {
            found(await campaignExists(trx, request.params.id));
            return addTargets(trx, request.params.id, request.body.contactIds);
          });
          return reply.code(201).send({ added });
        }),
    );

    scope.get<{ Params: { id: string }; Querystring: { contact: string } }>(
      '/outreach/campaigns/:id/preview',
      {
        schema: {
          params: ID_PARAMS,
          querystring: {
            type: 'object',
            required: ['contact'],
            properties: { contact: UUID },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          found(
            await outreach(db, actor, (trx) =>
              handoverFor(trx, request.params.id, request.query.contact),
            ),
          ),
        ),
    );

    // Targets and Siguiente -------------------------------------------------------------------------------------

    scope.patch<{ Params: { id: string }; Body: TargetInput }>(
      '/outreach/targets/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: TARGET_PROPERTIES,
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          found(
            await outreach(db, actor, (trx) => updateTarget(trx, request.params.id, request.body)),
          );
          return reply.code(204).send();
        }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/outreach/targets/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const outcome = await outreach(db, actor, (trx) => deleteTarget(trx, request.params.id));
          if (outcome === 'sent') {
            throw new Refusal(409, 'sent');
          }
          found(outcome === 'deleted');
          return reply.code(204).send();
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/outreach/targets/:id/letter',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          found(
            await outreach(db, actor, async (trx) => {
              const campaign = await targetCampaign(trx, request.params.id);
              const target = campaign
                ? await sql<{ contact_id: string; anchor: string | null }>`
                    SELECT contact_id, anchor FROM app.campaign_targets WHERE id = ${request.params.id}`.execute(
                    trx,
                  )
                : undefined;
              const row = target?.rows[0];
              return campaign && row
                ? handoverFor(trx, campaign, row.contact_id, row.anchor)
                : undefined;
            }),
          ),
        ),
    );

    scope.post<{ Params: { id: string }; Body: { templateVersion?: number | null } }>(
      '/outreach/targets/:id/sent',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { templateVersion: { type: ['integer', 'null'], minimum: 1 } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const outcome = await outreach(db, actor, (trx) =>
            markSent(trx, request.params.id, actor.userId, request.body?.templateVersion ?? null),
          );
          if (outcome === 'stale' || outcome === 'taken') {
            throw new Refusal(409, outcome);
          }
          found(outcome === 'sent');
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { id: string } }>(
      '/outreach/targets/:id/claim',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const outcome = await outreach(db, actor, (trx) =>
            claimTarget(trx, request.params.id, actor.userId),
          );
          if (outcome === 'taken') {
            throw new Refusal(409, 'taken');
          }
          found(outcome === 'claimed');
          return reply.code(204).send();
        }),
    );

    scope.get<{ Querystring: { campaign?: string; skip?: string } }>(
      '/outreach/next',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              campaign: UUID,
              // Up to 50 target ids, comma-separated: the ones left for later in this visit.
              skip: {
                type: 'string',
                maxLength: 50 * 37,
                pattern: '^[0-9a-f-]{36}(,[0-9a-f-]{36})*$',
              },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          outreach(db, actor, (trx) =>
            nextTarget(
              trx,
              actor.userId,
              request.query.campaign,
              request.query.skip?.split(',') ?? [],
            ),
          ),
        ),
    );

    // Import ----------------------------------------------------------------------------------------------------

    const FILE = (max: number) => ({ type: 'string', maxLength: max }) as const;

    scope.post<{ Body: { dryRun: boolean; files: ImportFiles } }>(
      '/outreach/import',
      {
        bodyLimit: IMPORT_BODY_LIMIT,
        // Up to 5 MB: refused before it is read, parsed or checked unless it comes through the staff app from someone
        // signed in (signedIn checks again, with the role).
        onRequest: async (request, reply) => {
          if (request.headers.origin !== staffOrigin) {
            return reply.code(403).send({ error: 'forbidden' });
          }
          if (!app) {
            return reply.code(503).send({ error: 'unavailable' });
          }
          if (!(await actorFor(request))) {
            return reply.code(401).send({ error: 'signIn' });
          }
        },
        schema: {
          body: {
            type: 'object',
            required: ['dryRun', 'files'],
            additionalProperties: false,
            properties: {
              dryRun: { type: 'boolean' },
              files: {
                type: 'object',
                required: ['campaign', 'contacts'],
                additionalProperties: false,
                properties: {
                  campaign: FILE(64 * 1024),
                  contacts: FILE(4 * 1024 * 1024),
                  anchors: FILE(512 * 1024),
                  templates: {
                    type: 'object',
                    additionalProperties: false,
                    properties: { A: FILE(256 * 1024), B: FILE(256 * 1024) },
                  },
                  tracking: FILE(1024 * 1024),
                },
              },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          if (!allowImport(actor.userId)) {
            throw new Refusal(429, 'limit');
          }
          // A dry run applies everything in a transaction that is then rolled back: its counts are what applying
          // does. With problems, nothing is written either.
          const ROLLBACK = Symbol('rollback');
          let result: Awaited<ReturnType<typeof importCampaign>> | undefined;
          try {
            await outreach(
              db,
              actor,
              async (trx) => {
                result = await importCampaign(trx, request.body.files);
                if (request.body.dryRun || result.problems.length > 0) {
                  throw ROLLBACK;
                }
              },
              ADMIN,
            );
          } catch (error) {
            if (error !== ROLLBACK) {
              throw error;
            }
          }
          if (!result) {
            throw new Error('The import came back with nothing');
          }
          const answer = { dryRun: request.body.dryRun, ...result };
          return result.problems.length > 0 && !request.body.dryRun
            ? reply.code(422).send(answer)
            : answer;
        }),
    );
  };
