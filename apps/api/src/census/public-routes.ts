import type { Database } from '@backoffice/db/client';
import type { FastifyInstance } from 'fastify';

import { normalizeEmail, normalizePhone } from '@backoffice/domain/identities';
import { COUNTRY_CODES } from '@backoffice/domain/places';
import { captureException } from '@sentry/node';
import { createHash, timingSafeEqual } from 'node:crypto';

import { visitorAddress } from '../auth/visitor.js';
import { createRateLimiter, visitorKey } from '../rate-limit.js';
import { censusForm, submitCensus } from './census.js';

/** The header the forms app sends its shared secret in (staff API spec, the forms app's routes). */
export const FORMS_TOKEN_HEADER = 'x-backoffice-forms-token';

/** A census answer must take at least this long to fill in: a bot posts at once. */
export const MIN_FILL_MS = 3_000;

export interface CensusPublicOptions {
  /** As pauseai_backoffice_public, which may only run the census form's two functions. */
  db: Database;
  /** The secret the forms app sends with every call. */
  token: string;
  wordingVersion: string;
  /** Submissions per visitor and 10 minutes, per API replica (the gateway limits too). */
  submitsPerVisitor?: number;
  now?: () => number;
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Compares two secrets in constant time, whatever their lengths. */
const sameSecret = (sent: string | string[] | undefined, expected: string): boolean =>
  typeof sent === 'string' && timingSafeEqual(digest(sent), digest(expected));

const TOKEN = {
  type: 'string',
  minLength: 20,
  maxLength: 200,
  pattern: '^[A-Za-z0-9_-]+$',
} as const;
const TEXT = (max: number) => ({ type: 'string', maxLength: max }) as const;

interface Answer {
  name: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  province?: string;
  town?: string;
  /** Where they live and where they're from (PLAN R74): countries by their ISO 3166-1 code. */
  country?: string;
  originCountry?: string;
  originProvince?: string;
  languages?: string[];
  options?: string[];
  skillsOther?: string;
  interestsOther?: string;
  availability?: 'occasional' | 'under_2h' | 'from_2_to_5h' | 'over_5h';
  howHeard?: string;
  pronouns?: string;
  consentEmail: boolean;
  consentWhatsapp: boolean;
  consentPrivacy: boolean;
  ageOk: boolean;
}

/**
 * The forms app's routes (ADR-0002 §7), reached only from its pods inside the cluster and never through the gateway:
 * every call must carry the shared secret, or the routes answer as if they weren't there. No sessions, no cookies; a
 * visitor's address is only counted, never stored. What a visitor sends is checked here, then again by the database.
 */
export const censusPublicRoutes =
  (options: CensusPublicOptions | undefined) =>
  async (scope: FastifyInstance): Promise<void> => {
    if (!options) {
      scope.all('/*', async (_request, reply) => reply.code(503).send({ error: 'unavailable' }));
      return;
    }
    const { db, token, wordingVersion, submitsPerVisitor = 5, now = Date.now } = options;
    const allowSubmit = createRateLimiter({ limit: submitsPerVisitor, windowMs: 10 * 60_000, now });
    const allowForm = createRateLimiter({ limit: 120, windowMs: 10 * 60_000, now });

    scope.removeContentTypeParser('text/plain');
    scope.addHook('onRequest', async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      if (!sameSecret(request.headers[FORMS_TOKEN_HEADER], token)) {
        return reply.code(404).send({ error: 'notFound' });
      }
    });
    scope.setErrorHandler(async (error, request, reply) => {
      const { validation, statusCode } = error as { validation?: unknown; statusCode?: unknown };
      if (Array.isArray(validation)) {
        const [first] = validation as {
          instancePath?: string;
          params?: { missingProperty?: string };
        }[];
        const parts = (first?.instancePath ?? '')
          .split('/')
          .filter((part: string) => part !== '' && !/^\d+$/u.test(part));
        const field = parts.at(-1) ?? first?.params?.missingProperty;
        return reply.code(400).send({ error: 'invalid', ...(field ? { field } : {}) });
      }
      if (typeof statusCode === 'number' && statusCode < 500) {
        return reply.code(statusCode).send({ error: 'invalid' });
      }
      // Never the answer or the database's words: only that it failed, and the SQLSTATE.
      const { code } = error as { code?: unknown };
      request.log.error({ code }, 'A census answer could not be saved');
      captureException(
        new Error(
          `A census answer could not be saved: ${typeof code === 'string' ? code : 'fault'}`,
        ),
      );
      return reply.code(500).send({ error: 'unexpected' });
    });

    const visitor = (request: {
      headers: Record<string, unknown>;
      socket: { remoteAddress?: string };
    }) =>
      visitorKey(
        visitorAddress(
          request.headers['x-forwarded-for'] as string | undefined,
          request.socket.remoteAddress,
        ) ?? 'unknown',
      );

    scope.post<{ Body: { token?: string } }>(
      '/form',
      {
        schema: {
          body: { type: 'object', additionalProperties: false, properties: { token: TOKEN } },
        },
      },
      async (request, reply) => {
        if (!allowForm(visitor(request))) {
          return reply.code(429).send({ error: 'limit' });
        }
        return { ...(await censusForm(db, request.body?.token)), wordingVersion };
      },
    );

    scope.post<{ Body: { token?: string; startedAt: number; website?: string; answer: Answer } }>(
      '/submit',
      {
        schema: {
          body: {
            type: 'object',
            required: ['startedAt', 'answer'],
            additionalProperties: false,
            properties: {
              token: TOKEN,
              startedAt: { type: 'integer', minimum: 0 },
              website: TEXT(200),
              answer: {
                type: 'object',
                required: ['name', 'consentEmail', 'consentWhatsapp', 'consentPrivacy', 'ageOk'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
                  preferredName: TEXT(100),
                  email: TEXT(254),
                  phone: TEXT(50),
                  province: TEXT(100),
                  town: TEXT(100),
                  country: { type: 'string', enum: [...COUNTRY_CODES] },
                  originCountry: { type: 'string', enum: [...COUNTRY_CODES] },
                  originProvince: TEXT(100),
                  languages: { type: 'array', maxItems: 20, items: TEXT(50) },
                  options: {
                    type: 'array',
                    maxItems: 50,
                    uniqueItems: true,
                    items: { type: 'string', format: 'uuid' },
                  },
                  skillsOther: TEXT(300),
                  interestsOther: TEXT(300),
                  availability: {
                    type: 'string',
                    enum: ['occasional', 'under_2h', 'from_2_to_5h', 'over_5h'],
                  },
                  howHeard: TEXT(500),
                  pronouns: TEXT(50),
                  consentEmail: { type: 'boolean' },
                  consentWhatsapp: { type: 'boolean' },
                  consentPrivacy: { type: 'boolean' },
                  ageOk: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      async (request, reply) => {
        const { token: link, startedAt, website, answer } = request.body;
        if (!allowSubmit(visitor(request))) {
          return reply.code(429).send({ error: 'limit' });
        }
        // The honeypot: a person never fills it in, so whatever filled it is answered as if it worked, and dropped.
        if (website !== undefined && website !== '') {
          return { outcome: link === undefined ? 'received' : 'updated' };
        }
        if (now() - startedAt < MIN_FILL_MS || startedAt > now() + 60_000) {
          return reply.code(400).send({ error: 'invalid', field: 'startedAt' });
        }
        if (!answer.ageOk) {
          return reply.code(400).send({ error: 'invalid', field: 'ageOk' });
        }
        if (!answer.consentPrivacy) {
          return reply.code(400).send({ error: 'invalid', field: 'consentPrivacy' });
        }
        const email = answer.email?.trim() ? normalizeEmail(answer.email) : null;
        const phone = answer.phone?.trim() ? normalizePhone(answer.phone) : null;
        if (email === undefined) {
          return reply.code(400).send({ error: 'invalid', field: 'email' });
        }
        if (phone === undefined) {
          return reply.code(400).send({ error: 'invalid', field: 'phone' });
        }
        if (!email && !phone) {
          return reply.code(400).send({ error: 'invalid', field: 'email' });
        }
        const text = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);
        const outcome = await submitCensus(db, link, {
          name: answer.name.trim(),
          preferred_name: text(answer.preferredName),
          email: email ?? undefined,
          phone: phone ?? undefined,
          province: text(answer.province),
          town: text(answer.town),
          country: answer.country,
          origin_country: answer.originCountry,
          origin_province: text(answer.originProvince),
          languages: (answer.languages ?? [])
            .map((language) => language.trim())
            .filter((l) => l !== ''),
          options: answer.options ?? [],
          skills_other: text(answer.skillsOther),
          interests_other: text(answer.interestsOther),
          availability: answer.availability,
          how_heard: text(answer.howHeard),
          pronouns: text(answer.pronouns),
          consent_email: answer.consentEmail,
          consent_whatsapp: answer.consentWhatsapp,
          consent_privacy: answer.consentPrivacy,
          age_ok: answer.ageOk,
          wording_version: wordingVersion,
        });
        if (outcome === 'invalid') {
          return reply.code(409).send({ error: 'invalidLink' });
        }
        // Through the generic link, one answer whatever happened: whether it made someone new or matched someone
        // would tell anyone who types a phone number whether its owner is known here.
        return { outcome: outcome === 'updated' ? 'updated' : 'received' };
      },
    );
  };
