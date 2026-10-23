import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import { normalizeDiscord, normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { MESSAGE_PURPOSES } from '@backoffice/domain/message-templates';
import { COUNTRY_CODES, countryName } from '@backoffice/domain/places';
import {
  ATTENTION_REASONS,
  type AttentionReason,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  SOURCES,
  type Stage,
  STAGES,
} from '@backoffice/domain/stages';
import { whatsappLink } from '@backoffice/domain/whatsapp';
import { captureException } from '@sentry/node';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';

import type { SyncCounts } from '../imports/airtable-sync.js';

import { censusOfPerson } from '../census/census.js';
import { databaseRefusal } from '../database-errors.js';
import { fromAnotherSite } from '../fetch-site.js';
import { sealLink } from '../imports/airtable-link.js';
import {
  airtableEnabled,
  readAirtableSettings,
  setAirtableEnabled,
  setAirtableLink,
} from '../imports/airtable-settings.js';
import { AirtableError, isSharedViewUrl } from '../imports/airtable.js';
import {
  CSV_FIELDS,
  CsvError,
  type CsvField,
  IDENTIFYING_FIELDS,
  mapRows,
  parseCsv,
  suggestMapping,
} from '../imports/csv.js';
import { createRateLimiter } from '../rate-limit.js';
import { schemaRefusal } from '../schema-refusal.js';
import {
  addArrivalChannel,
  changeArrivalChannel,
  listArrivalChannels,
  orderArrivalChannels,
} from './arrival-channels.js';
import {
  contactsOf,
  findCandidates,
  holdersOf,
  importCsv,
  listBandeja,
  listImports,
  resolveBandeja,
  submitIntake,
} from './intake.js';
import {
  addMessageTemplate,
  changeMessageTemplate,
  listMessageTemplates,
} from './message-templates.js';
import {
  addAttempt,
  addIdentity,
  addNote,
  board,
  claimPerson,
  countPeople,
  getPerson,
  listPeople,
  mergePeople,
  panel,
  type PeopleFilter,
  type PersonChange,
  recordJoin,
  recordLeave,
  removeIdentity,
  summariesOf,
  today,
  updatePerson,
} from './people.js';
import { readSettings, type SettingsChange, updateSettings } from './settings.js';

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

export interface PeopleRoutesOptions {
  app: Database | undefined;
  staffOrigin: string;
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
  /** The Airtable sync, run now (ADR-0005); undefined when the key or the ingest role isn't configured. */
  syncAirtable?: (() => Promise<SyncCounts>) | undefined;
  /** AIRTABLE_LINK_KEY, which seals the link admins set in Ajustes (ADR-0005); undefined: none can be set here. */
  airtableKey?: Buffer | undefined;
  /** Told about every new person from the staff app (the bot's team group, ADR-0004); never awaited for long. */
  onArrival?: ((personId: string) => Promise<void>) | undefined;
  /** Told when someone is claimed here, so the team group's post says who. */
  onClaim?: ((personId: string) => Promise<void>) | undefined;
}

const UUID = { type: 'string', format: 'uuid' } as const;
const ID_PARAMS = { type: 'object', properties: { id: UUID }, required: ['id'] } as const;
const DATE = { type: 'string', format: 'date' } as const;
const TEXT = (max: number) => ({ type: 'string', maxLength: max }) as const;
const NULLABLE_TEXT = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const;
const NULLABLE_COUNTRY = { type: ['string', 'null'], enum: [...COUNTRY_CODES, null] } as const;

const ONBOARDING = sql<{ ok: boolean }>`SELECT private.staff_can('admin', 'onboarding') AS ok`;
const ADMIN = sql<{ ok: boolean }>`SELECT private.staff_can('admin') AS ok`;

/** The database's own answer to whether the actor holds the role, so the API can refuse in words first. */
const require = async (trx: Transaction<DB>, check: typeof ONBOARDING): Promise<void> => {
  const { rows } = await check.execute(trx);
  if (rows[0]?.ok !== true) {
    throw new Refusal(403, 'forbidden');
  }
};

/** The Personas filters from a query string. */
const filterOf = (query: Record<string, unknown>): PeopleFilter => {
  const list = (value: unknown): string[] =>
    (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter(
      (item): item is string => typeof item === 'string',
    );
  const flag = (value: unknown): boolean | undefined =>
    value === '1' || value === 'true' || value === 'yes'
      ? true
      : value === '0' || value === 'false' || value === 'no'
        ? false
        : undefined;
  const stages = list(query.stage).filter((stage): stage is Stage =>
    (STAGES as readonly string[]).includes(stage),
  );
  const owner = typeof query.owner === 'string' ? query.owner : undefined;
  return {
    q: typeof query.q === 'string' ? query.q.slice(0, 200) : undefined,
    stages,
    owner:
      owner === 'me' || owner === 'none' || (owner && /^[0-9a-f-]{36}$/u.test(owner))
        ? owner
        : undefined,
    attention: flag(query.attention) === true ? true : undefined,
    inCommunity: flag(query.inCommunity),
    team: flag(query.team),
    source:
      typeof query.source === 'string' && (SOURCES as readonly string[]).includes(query.source)
        ? query.source
        : undefined,
    arrival:
      query.arrival === 'none' ||
      (typeof query.arrival === 'string' && /^[0-9a-f-]{36}$/u.test(query.arrival))
        ? query.arrival
        : undefined,
    arrivedOn:
      query.arrivedOn === 'known' || query.arrivedOn === 'unknown' ? query.arrivedOn : undefined,
    reason:
      typeof query.reason === 'string' &&
      (ATTENTION_REASONS as readonly string[]).includes(query.reason)
        ? (query.reason as AttentionReason)
        : undefined,
    province: typeof query.province === 'string' ? query.province.slice(0, 100) : undefined,
    country:
      typeof query.country === 'string' && /^(?:[A-Z]{2}|none)$/u.test(query.country)
        ? query.country
        : undefined,
  };
};

const FILTER_QUERY = {
  type: 'object',
  properties: {
    q: TEXT(200),
    stage: {
      anyOf: [
        { type: 'string', enum: [...STAGES] },
        { type: 'array', items: { type: 'string', enum: [...STAGES] } },
      ],
    },
    owner: TEXT(36),
    attention: TEXT(5),
    inCommunity: TEXT(5),
    team: TEXT(5),
    source: { type: 'string', enum: [...SOURCES] },
    arrival: TEXT(36),
    arrivedOn: { type: 'string', enum: ['known', 'unknown'] },
    reason: { type: 'string', enum: [...ATTENTION_REASONS] },
    province: TEXT(100),
    // Where they live (PLAN R74): a country's code, or `none`.
    country: { type: 'string', enum: [...COUNTRY_CODES, 'none'] },
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    cursor: TEXT(200),
  },
} as const;

/**
 * A CSV cell as a spreadsheet will read it: quoted, with a leading `=`, `+`, `-`, `@`, tab or return defused, so an
 * exported name can never run as a formula on an admin's computer.
 */
const csvCell = (
  value: string | number | boolean | readonly string[] | null | undefined,
): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? value.join('; ')
        : String(value);
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export const peopleRoutes =
  ({
    app,
    staffOrigin,
    actorFor,
    syncAirtable,
    airtableKey,
    onArrival,
    onClaim,
  }: PeopleRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    scope.setErrorHandler(async (error, _request, reply) => {
      const refusal = schemaRefusal(error);
      if (!refusal) {
        throw error;
      }
      return reply.code(400).send(refusal);
    });

    // A CSV import's body: the file's text, up to 1 MB.
    const CSV_BODY_LIMIT = 1024 * 1024 + 64 * 1024;
    // On-demand syncs and imports per staff member and hour: enough for a person, too few to hammer Airtable.
    const allowSync = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 });
    const allowImport = createRateLimiter({ limit: 30, windowMs: 60 * 60_000 });

    /** As staff/routes.ts: the signed-in actor, the staff origin for writes, refusals in words, faults reported. */
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
          return reply.code(error.status).send({ error: error.key, ...error.extra });
        }
        const refusal = databaseRefusal(error);
        if (refusal.report) {
          const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
          request.log.error(
            { code, routine, constraint: refusal.constraint },
            'Onboarding request failed',
          );
          captureException(
            typeof code === 'string'
              ? new Error(`Onboarding request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({
          error: refusal.error,
          ...(refusal.constraint === undefined ? {} : { constraint: refusal.constraint }),
        });
      }
    };

    /** Runs `run` in the actor's transaction once they're onboarding staff or an admin. */
    const onboarding = <T>(
      db: Database,
      actor: Actor,
      run: (trx: Transaction<DB>) => Promise<T>,
    ): Promise<T> =>
      withActor(db, actor, async (trx) => {
        await require(trx, ONBOARDING);
        return run(trx);
      });

    /** Never fails the request: the team group hears about a new person, or a claim, when it can. */
    const announce = (personId: string | null, tell = onArrival): void => {
      if (personId && tell) {
        tell(personId).catch((error: unknown) => captureException(error));
      }
    };

    scope.get<{ Querystring: { weeks?: number } }>(
      '/panel',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: { weeks: { type: 'integer', minimum: 1, maximum: 52 } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          onboarding(db, actor, (trx) => panel(trx, request.query.weeks ?? 12)),
        ),
    );

    scope.get('/today', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        onboarding(db, actor, (trx) => today(trx, actor.userId)),
      ),
    );

    scope.get<{ Querystring: Record<string, unknown> & { limit?: number; cursor?: string } }>(
      '/people',
      { schema: { querystring: FILTER_QUERY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          onboarding(db, actor, async (trx) => {
            const filter = filterOf(request.query);
            const page = await listPeople(trx, actor.userId, filter, {
              limit: request.query.limit ?? 50,
              cursor: request.query.cursor,
            });
            // The counters come with the first page only: "Cargar más" needs none (PLAN R59).
            return request.query.cursor
              ? page
              : { ...page, counts: await countPeople(trx, actor.userId, filter) };
          }),
        ),
    );

    scope.get<{ Querystring: Record<string, unknown> }>(
      '/board',
      { schema: { querystring: FILTER_QUERY } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) =>
          onboarding(db, actor, (trx) => board(trx, actor.userId, filterOf(request.query))),
        ),
    );

    scope.get<{ Params: { id: string } }>(
      '/people/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const found = await onboarding(db, actor, async (trx) => {
            const page = await getPerson(trx, request.params.id);
            return page
              ? { ...page, census: await censusOfPerson(trx, page.person.id) }
              : undefined;
          });
          if (!found) {
            throw new Refusal(404, 'notFound');
          }
          const { census, ...rest } = found;
          const { phone, ...person } = rest.person;
          return {
            ...rest,
            person: {
              ...person,
              ...census,
              whatsapp: phone ? (whatsappLink(phone) ?? null) : null,
            },
          };
        }),
    );

    scope.patch<{ Params: { id: string }; Body: PersonChange }>(
      '/people/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              fullName: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
              preferredName: NULLABLE_TEXT(100),
              province: NULLABLE_TEXT(100),
              town: NULLABLE_TEXT(100),
              // Where they live and where they're from (PLAN R74): a country's code, or null.
              country: NULLABLE_COUNTRY,
              originCountry: NULLABLE_COUNTRY,
              originProvince: NULLABLE_TEXT(100),
              languages: { type: 'array', maxItems: 20, items: TEXT(50) },
              pronouns: NULLABLE_TEXT(50),
              availability: {
                type: ['string', 'null'],
                enum: ['occasional', 'under_2h', 'from_2_to_5h', 'over_5h', null],
              },
              howHeard: NULLABLE_TEXT(500),
              // The card's one-line internal summary (PLAN M5, step 4).
              summary: { ...NULLABLE_TEXT(200), pattern: '^[^\\r\\n]*$' },
              stage: { type: 'string', enum: [...STAGES] },
              // The day a stage change made now happened, if another (PLAN M5).
              stageOn: DATE,
              ownerId: { anyOf: [UUID, { type: 'null' }] },
              nextAction: NULLABLE_TEXT(300),
              nextActionDue: { anyOf: [DATE, { type: 'null' }] },
              // "Llegó el" (null: nobody knows) and "Llegó por" (PLAN M5).
              arrivedOn: { anyOf: [DATE, { type: 'null' }] },
              arrivalId: { anyOf: [UUID, { type: 'null' }] },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          if (request.body.stageOn !== undefined && request.body.stage === undefined) {
            throw new Refusal(400, 'invalid', { field: 'stageOn' });
          }
          const changed = await onboarding(db, actor, (trx) =>
            updatePerson(trx, request.params.id, request.body),
          );
          if (!changed) {
            throw new Refusal(404, 'notFound');
          }
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { id: string } }>(
      '/people/:id/claim',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await onboarding(db, actor, (trx) => claimPerson(trx, request.params.id));
          if (!done) {
            throw new Refusal(409, 'taken');
          }
          announce(request.params.id, onClaim);
          return reply.code(204).send();
        }),
    );

    scope.post<{ Params: { id: string }; Body: { body: string; happenedOn?: string } }>(
      '/people/:id/notes',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['body'],
            additionalProperties: false,
            properties: {
              body: { type: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' },
              happenedOn: DATE,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await onboarding(db, actor, (trx) =>
            addNote(trx, request.params.id, request.body.body.trim(), request.body.happenedOn),
          );
          return reply.code(201).send();
        }),
    );

    scope.post<{
      Params: { id: string };
      Body: {
        channel: string;
        outcome: string;
        note?: string;
        happenedOn?: string;
        templateId?: string;
        templateVersion?: number;
      };
    }>(
      '/people/:id/attempts',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['channel', 'outcome'],
            additionalProperties: false,
            properties: {
              channel: { type: 'string', enum: [...CONTACT_CHANNELS] },
              outcome: { type: 'string', enum: [...CONTACT_OUTCOMES] },
              note: TEXT(4000),
              happenedOn: DATE,
              // The message that went out, when it was one the team wrote (Mensajes): both or neither.
              templateId: UUID,
              templateVersion: { type: 'integer', minimum: 1, maximum: 999_999_999 },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await onboarding(db, actor, (trx) => addAttempt(trx, request.params.id, request.body));
          return reply.code(201).send();
        }),
    );

    scope.post<{
      Params: { id: string };
      Body: { kind: 'email' | 'phone' | 'discord'; value: string };
    }>(
      '/people/:id/identities',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['kind', 'value'],
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['email', 'phone', 'discord'] },
              value: TEXT(254),
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const result = await onboarding(db, actor, (trx) =>
            addIdentity(trx, request.params.id, request.body.kind, request.body.value),
          );
          if (result === 'invalid') {
            throw new Refusal(400, 'invalid', { field: 'value' });
          }
          if ('taken' in result) {
            throw new Refusal(409, 'taken', { personId: result.taken });
          }
          return reply.code(201).send(result);
        }),
    );

    scope.delete<{ Params: { id: string; identityId: string } }>(
      '/people/:id/identities/:identityId',
      { schema: { params: { type: 'object', properties: { id: UUID, identityId: UUID } } } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await onboarding(db, actor, (trx) =>
            removeIdentity(trx, request.params.id, request.params.identityId),
          );
          return done ? reply.code(204).send() : reply.code(404).send({ error: 'notFound' });
        }),
    );

    scope.post<{ Params: { id: string }; Body: { joinedOn?: string; chat?: string } }>(
      '/people/:id/joined',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { joinedOn: DATE, chat: TEXT(100) },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await onboarding(db, actor, (trx) =>
            recordJoin(trx, request.params.id, actor.userId, request.body ?? {}),
          );
          return done ? reply.code(204).send() : reply.code(409).send({ error: 'stale' });
        }),
    );

    scope.post<{ Params: { id: string }; Body: { leftOn?: string } }>(
      '/people/:id/left',
      {
        schema: {
          params: ID_PARAMS,
          body: { type: 'object', additionalProperties: false, properties: { leftOn: DATE } },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await onboarding(db, actor, (trx) =>
            recordLeave(trx, request.params.id, request.body?.leftOn),
          );
          return done ? reply.code(204).send() : reply.code(404).send({ error: 'notFound' });
        }),
    );

    scope.post<{ Params: { id: string }; Body: { mergedId: string } }>(
      '/people/:id/merge',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['mergedId'],
            additionalProperties: false,
            properties: { mergedId: UUID },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const merged = await onboarding(db, actor, (trx) =>
            mergePeople(trx, request.params.id, request.body.mergedId),
          );
          if (merged === 'bothInTeam') {
            throw new Refusal(409, 'bothInTeam');
          }
          return reply.code(204).send();
        }),
    );

    // Intake ------------------------------------------------------------------------------------------------------

    scope.get<{
      Querystring: { name?: string; phone?: string; email?: string; province?: string };
    }>(
      '/candidates',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: { name: TEXT(200), phone: TEXT(50), email: TEXT(254), province: TEXT(100) },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const { name = '', phone, email, province } = request.query;
          const phones = phone?.trim() ? [normalizePhone(phone)] : [];
          const emails = email?.trim() ? [normalizeEmail(email)] : [];
          if (phones.includes(undefined)) {
            throw new Refusal(400, 'invalid', { field: 'phone' });
          }
          if (emails.includes(undefined)) {
            throw new Refusal(400, 'invalid', { field: 'email' });
          }
          const candidates = await onboarding(db, actor, (trx) =>
            findCandidates(trx, {
              name,
              province,
              phones: phones as string[],
              emails: emails as string[],
            }),
          );
          return { candidates };
        }),
    );

    scope.post<{
      Body: {
        name?: string;
        phone?: string;
        email?: string;
        discord?: string;
        province?: string;
        town?: string;
        country?: string;
        originCountry?: string;
        originProvince?: string;
        chat?: string;
        note?: string;
        stage?: 'new' | 'welcomed' | 'active';
        arrival?: string;
        arrivedOn?: string | null;
        decision?: 'new' | 'attach';
        target?: string;
      };
    }>(
      '/intake',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: TEXT(200),
              phone: TEXT(50),
              email: TEXT(254),
              discord: TEXT(40),
              province: TEXT(100),
              town: TEXT(100),
              country: { type: 'string', enum: [...COUNTRY_CODES] },
              originCountry: { type: 'string', enum: [...COUNTRY_CODES] },
              originProvince: TEXT(100),
              chat: TEXT(100),
              note: TEXT(4000),
              stage: { type: 'string', enum: ['new', 'welcomed', 'active'] },
              // "Llegó por", an entry of the list; "Llegó el": null when nobody knows, left out for today (PLAN M5).
              arrival: UUID,
              arrivedOn: { anyOf: [DATE, { type: 'null' }] },
              decision: { type: 'string', enum: ['new', 'attach'] },
              target: UUID,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const {
            name,
            phone,
            email,
            discord,
            province,
            town,
            country,
            originCountry,
            originProvince,
            chat,
            note,
            stage,
            arrival,
            decision,
            target,
          } = request.body;
          const phones = phone?.trim() ? normalizePhone(phone) : null;
          const emails = email?.trim() ? normalizeEmail(email) : null;
          const discords = discord?.trim() ? normalizeDiscord(discord) : null;
          if (phones === undefined) {
            throw new Refusal(400, 'invalid', { field: 'phone' });
          }
          if (emails === undefined) {
            throw new Refusal(400, 'invalid', { field: 'email' });
          }
          if (discords === undefined) {
            throw new Refusal(400, 'invalid', { field: 'discord' });
          }
          if (decision === 'attach' && !target) {
            throw new Refusal(400, 'invalid', { field: 'target' });
          }
          // A name, or a phone, an email or a Discord username to find them by (PLAN R37, M5).
          if (!name?.trim() && !phones && !emails && !discords) {
            throw new Refusal(400, 'invalid', { field: 'name' });
          }
          const clean = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
          const submitted = await onboarding(db, actor, (trx) =>
            submitIntake(trx, {
              source: 'manual',
              externalId: `web:${randomUUID()}`,
              payload: {
                ...(clean(name) ? { name: clean(name) } : {}),
                ...(phones ? { phones: [phones] } : {}),
                ...(emails ? { emails: [emails] } : {}),
                ...(discords ? { discords: [discords] } : {}),
                ...(arrival ? { arrival } : {}),
                ...('arrivedOn' in request.body
                  ? { arrived_on: request.body.arrivedOn ?? null }
                  : {}),
                ...(clean(province) ? { province: clean(province) } : {}),
                ...(clean(town) ? { town: clean(town) } : {}),
                ...(country ? { country } : {}),
                ...(originCountry ? { origin_country: originCountry } : {}),
                ...(clean(originProvince) ? { origin_province: clean(originProvince) } : {}),
                ...(clean(chat) ? { chat: clean(chat) } : {}),
                ...(clean(note) ? { note: clean(note) } : {}),
                ...(stage ? { stage } : {}),
              },
              decision,
              target,
            }),
          );
          if (submitted.status === 'created') {
            announce(submitted.personId);
          }
          return reply.code(201).send(submitted);
        }),
    );

    // How many records wait in the Bandeja, for the menu on every page (PLAN R78).
    scope.get('/bandeja/count', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        onboarding(db, actor, async (trx) => {
          const { rows } = await sql<{ count: number }>`
            SELECT count(*)::int AS count FROM app.intake_records
             WHERE status IN ('review', 'conflict')`.execute(trx);
          return { count: rows[0]?.count ?? 0 };
        }),
      ),
    );

    scope.get('/bandeja', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        onboarding(db, actor, async (trx) => {
          const items = await listBandeja(trx);
          // What a record brought that someone else already holds, and who (PLAN R78); a census answer brings none.
          const taken = (item: (typeof items)[number]): string[] =>
            item.source !== 'census' && Array.isArray(item.conflicts['identities'])
              ? item.conflicts['identities'].filter(
                  (value): value is string => typeof value === 'string',
                )
              : [];
          const holders = await holdersOf(trx, [...new Set(items.flatMap(taken))]);
          const ids = [
            ...new Set([
              ...items.flatMap((item) =>
                item.personId ? [...item.candidates, item.personId] : item.candidates,
              ),
              ...holders.map((holder) => holder.personId),
            ]),
          ];
          const summaries = new Map(
            (await summariesOf(trx, ids)).map((person) => [person.id, person]),
          );
          // The ways to be reached of whoever a record is compared with: a duplicate's candidates, and a conflict's
          // person (PLAN R60, R78), but never beside a census answer (R24).
          const compared = (item: (typeof items)[number]) => item.source !== 'census';
          const contacts = await contactsOf(trx, [
            ...new Set(
              items
                .filter(compared)
                .flatMap((item) =>
                  item.personId ? [...item.candidates, item.personId] : item.candidates,
                ),
            ),
          ]);
          const withContacts = (id: string, item: (typeof items)[number]) => {
            const summary = summaries.get(id);
            const theirs = compared(item) ? contacts.get(id) : undefined;
            return summary && theirs ? { ...summary, contacts: theirs } : summary;
          };
          return {
            items: items.map((item) => {
              const { personId, candidates, ...rest } = item;
              const identities = taken(item).map((value) => {
                const holder = holders.find((one) => one.value === value);
                const summary = holder ? summaries.get(holder.personId) : undefined;
                return {
                  kind: holder?.kind ?? null,
                  value,
                  holder: summary
                    ? { id: summary.id, name: summary.name, fullName: summary.fullName }
                    : null,
                };
              });
              return {
                ...rest,
                conflicts:
                  identities.length > 0 ? { ...rest.conflicts, identities } : rest.conflicts,
                candidates: candidates.flatMap((id) => {
                  const candidate = withContacts(id, item);
                  return candidate ? [candidate] : [];
                }),
                person: personId ? (withContacts(personId, item) ?? null) : null,
              };
            }),
          };
        }),
      ),
    );

    scope.post<{
      Params: { id: string };
      Body: { decision: 'attach' | 'new' | 'discard' | 'apply' | 'keep'; target?: string };
    }>(
      '/bandeja/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            required: ['decision'],
            additionalProperties: false,
            properties: {
              decision: { type: 'string', enum: ['attach', 'new', 'discard', 'apply', 'keep'] },
              target: UUID,
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const status = await onboarding(db, actor, (trx) =>
            resolveBandeja(trx, request.params.id, request.body.decision, request.body.target),
          );
          return { status };
        }),
    );

    // Imports -----------------------------------------------------------------------------------------------------

    scope.get('/imports', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        onboarding(db, actor, async (trx) => {
          const imports = await listImports(trx);
          return {
            imports,
            airtable: {
              configured: syncAirtable !== undefined,
              // Whether an admin has turned it on, with a link, in Ajustes (ADR-0005).
              enabled: await airtableEnabled(trx),
              lastRun: imports.find((run) => run.kind === 'airtable') ?? null,
            },
          };
        }),
      ),
    );

    scope.post('/imports/airtable', async (request, reply) =>
      signedIn(request, reply, async (db, actor) => {
        await withActor(db, actor, (trx) => require(trx, ONBOARDING));
        if (!syncAirtable) {
          throw new Refusal(503, 'unavailable');
        }
        if (!allowSync(actor.userId)) {
          throw new Refusal(429, 'limit');
        }
        try {
          const counts = await syncAirtable();
          if (counts.skipped === true) {
            throw new Refusal(409, 'running');
          }
          return { counts };
        } catch (error) {
          // Off, or without a link: an admin's choice in Ajustes, not a failure.
          if (error instanceof AirtableError && error.reason === 'off') {
            throw new Refusal(409, 'off');
          }
          if (error instanceof AirtableError) {
            request.log.error(`The Airtable sync failed (${error.reason})`);
            captureException(error);
            throw new Refusal(502, 'airtable', { reason: error.reason });
          }
          throw error;
        }
      }),
    );

    scope.post<{ Body: { csv: string; mapping?: Record<string, string>; apply?: boolean } }>(
      '/imports/csv',
      {
        bodyLimit: CSV_BODY_LIMIT,
        schema: {
          body: {
            type: 'object',
            required: ['csv'],
            additionalProperties: false,
            properties: {
              csv: { type: 'string', maxLength: 1024 * 1024 },
              mapping: {
                type: 'object',
                maxProperties: 200,
                additionalProperties: { type: 'string', enum: [...CSV_FIELDS, ''] },
              },
              apply: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await withActor(db, actor, (trx) => require(trx, ONBOARDING));
          if (!allowImport(actor.userId)) {
            throw new Refusal(429, 'limit');
          }
          let parsed;
          try {
            parsed = parseCsv(request.body.csv);
          } catch (error) {
            if (error instanceof CsvError) {
              throw new Refusal(400, 'invalid', { field: 'csv', reason: error.reason });
            }
            throw error;
          }
          const mapping = Object.fromEntries(
            Object.entries(request.body.mapping ?? suggestMapping(parsed.columns)).filter(
              (entry): entry is [string, CsvField] =>
                entry[1] !== '' && parsed.columns.includes(entry[0]),
            ),
          );
          // Who each row is: a name, or a way to find them by (PLAN R37, R56).
          if (!Object.values(mapping).some((field) => IDENTIFYING_FIELDS.includes(field))) {
            throw new Refusal(400, 'invalid', { field: 'mapping' });
          }
          const mapped = mapRows(parsed, mapping);
          const sha = createHash('sha256').update(request.body.csv).digest('hex');
          // A dry run applies the rows in a transaction that is then rolled back: its counts are what applying does.
          const DRY_RUN = Symbol('dry run');
          let counts: Record<string, unknown> = {};
          try {
            await withActor(db, actor, async (trx) => {
              await require(trx, ONBOARDING);
              counts = await importCsv(trx, sha, mapped.rows);
              if (request.body.apply !== true) {
                throw DRY_RUN;
              }
            });
          } catch (error) {
            if (error !== DRY_RUN) {
              throw error;
            }
          }
          if (request.body.apply === true) {
            return { counts, importId: counts.import_id ?? null };
          }
          const { import_id: _import, ...dry } = counts;
          return {
            columns: parsed.columns,
            mapping,
            preview: mapped.rows.slice(0, 20).map((row) => ({
              name: row.payload.name ?? null,
              email: row.payload.emails?.[0] ?? null,
              phone: row.payload.phones?.[0] ?? null,
              province: row.payload.province ?? null,
              town: row.payload.town ?? null,
              stage: row.payload.stage ?? null,
              discord: row.payload.discords?.[0] ?? null,
              arrival: row.payload.arrival ?? null,
              arrivedOn: row.payload.arrived_on ?? null,
              joinedOn: row.payload.joined_on ?? null,
              leftOn: row.payload.left_on ?? null,
            })),
            invalid: mapped.invalid,
            counts: dry,
          };
        }),
    );

    // Where people come from ("Llegó por", PLAN M5): onboarding staff read the list, admins edit it -------------------

    scope.get('/arrival-channels', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        onboarding(db, actor, async (trx) => ({ channels: await listArrivalChannels(trx) })),
      ),
    );

    const LABEL = { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' } as const;

    scope.post<{ Body: { label: string } }>(
      '/arrival-channels',
      {
        schema: {
          body: {
            type: 'object',
            required: ['label'],
            additionalProperties: false,
            properties: { label: LABEL },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const id = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return addArrivalChannel(trx, request.body.label.trim());
          });
          return reply.code(201).send({ id });
        }),
    );

    scope.put<{ Body: { ids: string[] } }>(
      '/arrival-channels/order',
      {
        schema: {
          body: {
            type: 'object',
            required: ['ids'],
            additionalProperties: false,
            properties: { ids: { type: 'array', maxItems: 200, items: UUID } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const done = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return orderArrivalChannels(trx, request.body.ids);
          });
          if (!done) {
            throw new Refusal(409, 'changed');
          }
          return reply.code(204).send();
        }),
    );

    scope.patch<{ Params: { id: string }; Body: { label?: string; active?: boolean } }>(
      '/arrival-channels/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: { label: LABEL, active: { type: 'boolean' } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const changed = await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            return changeArrivalChannel(trx, request.params.id, {
              label: request.body.label?.trim(),
              active: request.body.active,
            });
          });
          if (!changed) {
            throw new Refusal(404, 'notFound');
          }
          return reply.code(204).send();
        }),
    );

    // The WhatsApp messages (Mensajes, PLAN M5): onboarding staff and admins read the team's and write their own,
    // which only they see; admins alone write the team's (PLAN R71) -------------------------------------------------

    scope.get('/message-templates', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        onboarding(db, actor, async (trx) => ({ templates: await listMessageTemplates(trx) })),
      ),
    );

    const TITLE = { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' } as const;
    // Up to 10,000 characters (PLAN R76).
    const BODY = { type: 'string', minLength: 1, maxLength: 10000, pattern: '\\S' } as const;

    scope.post<{
      Body: {
        purpose: (typeof MESSAGE_PURPOSES)[number];
        title: string;
        body: string;
        bodyNameless?: string | null;
        private: boolean;
      };
    }>(
      '/message-templates',
      {
        schema: {
          body: {
            type: 'object',
            required: ['purpose', 'title', 'body', 'private'],
            additionalProperties: false,
            properties: {
              purpose: { type: 'string', enum: [...MESSAGE_PURPOSES] },
              title: TITLE,
              body: BODY,
              bodyNameless: NULLABLE_TEXT(10000),
              // "Solo yo" (true), the writer's own; the team's (false) only for admins, which RLS says.
              private: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const id = await onboarding(db, actor, (trx) => addMessageTemplate(trx, request.body));
          return reply.code(201).send({ id });
        }),
    );

    scope.patch<{
      Params: { id: string };
      Body: { title?: string; body?: string; bodyNameless?: string | null; active?: boolean };
    }>(
      '/message-templates/:id',
      {
        schema: {
          params: ID_PARAMS,
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              title: TITLE,
              body: BODY,
              bodyNameless: NULLABLE_TEXT(10000),
              active: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          const changed = await onboarding(db, actor, (trx) =>
            changeMessageTemplate(trx, request.params.id, request.body),
          );
          if (changed === 'notFound') {
            throw new Refusal(404, 'notFound');
          }
          if (changed === 'forbidden') {
            throw new Refusal(403, 'forbidden');
          }
          return reply.code(204).send();
        }),
    );

    // Admin -------------------------------------------------------------------------------------------------------

    scope.get('/settings', async (request, reply) =>
      signedIn(request, reply, async (db, actor) => withActor(db, actor, readSettings)),
    );

    scope.patch<{ Body: SettingsChange }>(
      '/settings',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            minProperties: 1,
            properties: {
              followUpDays: { type: 'integer', minimum: 1, maximum: 60 },
              unresponsiveAttempts: { type: 'integer', minimum: 1, maximum: 20 },
              unresponsiveDays: { type: 'integer', minimum: 1, maximum: 180 },
              unassignedAlertHours: { type: 'integer', minimum: 1, maximum: 720 },
              matchThreshold: { type: 'number', minimum: 0.3, maximum: 1 },
              teamPostDays: { type: 'integer', minimum: 1, maximum: 60 },
              communityChats: {
                type: 'array',
                maxItems: 100,
                items: { type: 'string', minLength: 1, maxLength: 100 },
              },
            },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            await updateSettings(trx, request.body);
          });
          return reply.code(204).send();
        }),
    );

    // The Airtable sync's settings (ADR-0005): admins only. The link is write-only: no answer here carries it, nor its
    // ciphertext; the API seals it with the deployment's key before it reaches the database.

    scope.get('/airtable', async (request, reply) =>
      signedIn(request, reply, async (db, actor) =>
        withActor(db, actor, async (trx) => {
          await require(trx, ADMIN);
          return { available: airtableKey !== undefined, ...(await readAirtableSettings(trx)) };
        }),
      ),
    );

    scope.put<{ Body: { link: string } }>(
      '/airtable/link',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['link'],
            properties: { link: { type: 'string', minLength: 1, maxLength: 500 } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            if (!airtableKey) {
              throw new Refusal(503, 'unavailable');
            }
            const link = request.body.link.trim();
            if (!isSharedViewUrl(link)) {
              throw new Refusal(400, 'invalid', { field: 'link' });
            }
            await setAirtableLink(trx, sealLink(link, airtableKey));
          });
          return reply.code(204).send();
        }),
    );

    scope.delete('/airtable/link', async (request, reply) =>
      signedIn(request, reply, async (db, actor) => {
        await withActor(db, actor, async (trx) => {
          await require(trx, ADMIN);
          await setAirtableLink(trx, null);
        });
        return reply.code(204).send();
      }),
    );

    scope.patch<{ Body: { enabled: boolean } }>(
      '/airtable',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['enabled'],
            properties: { enabled: { type: 'boolean' } },
          },
        },
      },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor) => {
          await withActor(db, actor, async (trx) => {
            await require(trx, ADMIN);
            if ((await setAirtableEnabled(trx, request.body.enabled)) === 'no_link') {
              throw new Refusal(409, 'no_link');
            }
          });
          return reply.code(204).send();
        }),
    );

    scope.get<{ Querystring: Record<string, unknown> }>(
      '/export/people.csv',
      { schema: { querystring: FILTER_QUERY } },
      async (request, reply) =>
        fromAnotherSite(request)
          ? reply.code(403).send({ error: 'forbidden' })
          : signedIn(request, reply, async (db, actor) => {
              const filter = filterOf(request.query);
              const csv = await withActor(db, actor, async (trx) => {
                await require(trx, ADMIN);
                const { people } = await listPeople(trx, actor.userId, filter, { limit: 5000 });
                const ids = people.map((person) => person.id);
                const identities = (
                  await sql<{ person_id: string; kind: string; value: string }>`
                SELECT person_id, kind::text AS kind, value FROM app.identities
                 WHERE person_id = ANY (${ids}::uuid[]) ORDER BY created_at`.execute(trx)
                ).rows;
                await sql`INSERT INTO app.exports (kind, filter, row_count)
                      VALUES ('people_csv', ${JSON.stringify(filter)}::jsonb, ${people.length})`.execute(
                  trx,
                );
                const header = [
                  'id',
                  'nombre',
                  'resumen',
                  'estado',
                  'responsable',
                  'provincia',
                  'pais',
                  'emails',
                  'telefonos',
                  'discord',
                  'en_comunidad',
                  'fuentes',
                  'llego_por',
                  'llego_el',
                  'siguiente_paso',
                  'fecha',
                  'alta',
                ];
                const lines = people.map((person) =>
                  [
                    person.id,
                    person.fullName,
                    person.summary,
                    person.stage,
                    person.owner?.displayName ?? '',
                    person.province,
                    person.country === null ? '' : countryName(person.country),
                    identities
                      .filter((i) => i.person_id === person.id && i.kind === 'email')
                      .map((i) => i.value),
                    identities
                      .filter((i) => i.person_id === person.id && i.kind === 'phone')
                      .map((i) => i.value),
                    identities
                      .filter((i) => i.person_id === person.id && i.kind === 'discord')
                      .map((i) => i.value),
                    person.inCommunity ? 'sí' : 'no',
                    person.sources,
                    person.arrival?.label ?? '',
                    person.arrivedOn ?? '',
                    person.nextAction,
                    person.nextActionDue,
                    person.createdAt,
                  ]
                    .map(csvCell)
                    .join(','),
                );
                return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
              });
              return reply
                .header('content-type', 'text/csv; charset=utf-8')
                .header('content-disposition', 'attachment; filename="personas.csv"')
                .send(csv);
            }),
    );
  };
