import type { Actor } from '@backoffice/db/actor';
import type { Database } from '@backoffice/db/client';
import type { DB } from '@backoffice/db/generated/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Transaction } from 'kysely';

import { withActor } from '@backoffice/db/actor';
import { MAX_RECEIPT_BYTES, receiptFileName, receiptTypeOf } from '@backoffice/domain/receipts';
import { captureException } from '@sentry/node';
import { sql } from 'kysely';
import { createHash, randomUUID } from 'node:crypto';

import type { ReceiptStore } from './receipt-store.js';

import { databaseRefusal } from '../database-errors.js';
import { fromAnotherSite } from '../fetch-site.js';
import { createRateLimiter } from '../rate-limit.js';
import { BOOKS, TESORERIA } from './books.js';

/** A refusal the API decides itself: its status and key, which the staff app shows in words. */
class Refusal extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
  ) {
    super(key);
  }
}

export interface ReceiptRoutesOptions {
  app: Database | undefined;
  staffOrigin: string;
  actorFor: (request: FastifyRequest) => Promise<Actor | undefined>;
  /** Receipts' files, encrypted on the API's volume; without it, none can be stored or read (503). */
  receipts: ReceiptStore | undefined;
}

const ID_PARAMS = {
  type: 'object',
  properties: { id: { type: 'string', format: 'uuid' } },
  required: ['id'],
} as const;

const require = async (trx: Transaction<DB>, check: typeof BOOKS): Promise<void> => {
  const { rows } = await check.execute(trx);
  if (rows[0]?.ok !== true) {
    throw new Refusal(403, 'forbidden');
  }
};

/** `filename*` as RFC 6266 has it, so a name with accents arrives whole; the plain `filename` is ASCII alone. */
const disposition = (fileName: string): string => {
  const ascii = fileName.replaceAll(/[^\x20-\x7e]|["\\]/gu, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/**
 * Receipts (ADR-0006 decision 7): tesorería attaches one to an entry, or removes a draft's; tesorería and admins
 * download them. The receipt's row is read or written through `withActor` first, so RLS decides who gets its bytes. A
 * file comes as the request's body (`application/octet-stream`, 10 MB at most), its name in `X-File-Name`
 * (URI-encoded); it is recognised by its first bytes, and stored encrypted before its row is written.
 */
export const receiptRoutes =
  ({ app, staffOrigin, actorFor, receipts }: ReceiptRoutesOptions) =>
  async (scope: FastifyInstance): Promise<void> => {
    // The file itself, as bytes: in this scope alone, and only up to a receipt's size.
    scope.addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer', bodyLimit: MAX_RECEIPT_BYTES },
      (_request, body, done) => {
        done(null, body);
      },
    );

    // Uploads per member and hour: a month's receipts at once, too few to fill the volume.
    const allowUpload = createRateLimiter({ limit: 200, windowMs: 60 * 60_000 });

    const signedIn = async (
      request: FastifyRequest,
      reply: FastifyReply,
      run: (db: Database, actor: Actor, store: ReceiptStore) => Promise<unknown>,
    ): Promise<unknown> => {
      if (!app || !receipts) {
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
        return await run(app, actor, receipts);
      } catch (error) {
        if (error instanceof Refusal) {
          return reply.code(error.status).send({ error: error.key });
        }
        const refusal = databaseRefusal(error);
        if (refusal.report) {
          const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
          request.log.error(
            { code, routine, constraint: refusal.constraint },
            'Receipt request failed',
          );
          captureException(
            typeof code === 'string'
              ? new Error(`Receipt request failed: SQLSTATE ${code} in ${String(routine)}`)
              : error,
          );
        }
        return reply.code(refusal.status).send({ error: refusal.error });
      }
    };

    scope.post<{ Params: { id: string }; Body: Buffer }>(
      '/accounting/entries/:id/receipts',
      { schema: { params: ID_PARAMS }, bodyLimit: MAX_RECEIPT_BYTES },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor, store) => {
          if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
            throw new Refusal(415, 'fileType');
          }
          const contentType = receiptTypeOf(request.body);
          if (!contentType) {
            throw new Refusal(415, 'fileType');
          }
          const header = request.headers['x-file-name'];
          let fileName: string | undefined;
          try {
            fileName =
              typeof header === 'string' ? receiptFileName(decodeURIComponent(header)) : undefined;
          } catch {
            fileName = undefined;
          }
          if (!fileName) {
            throw new Refusal(400, 'invalid');
          }
          const id = randomUUID();
          const bytes = request.body;
          const made = await withActor(db, actor, async (trx) => {
            await require(trx, TESORERIA);
            if (!allowUpload(actor.userId)) {
              throw new Refusal(429, 'limit');
            }
            const { rows } = await sql<{ closed: boolean }>`
              SELECT y.status = 'closed' AS closed
                FROM app.journal_entries e JOIN app.fiscal_years y ON y.year = e.fiscal_year
               WHERE e.id = ${request.params.id}`.execute(trx);
            if (!rows[0]) {
              throw new Refusal(404, 'notFound');
            }
            if (rows[0].closed) {
              throw new Refusal(409, 'yearClosed');
            }
            // The file before its row: a row never names a file that isn't there.
            await store.put(id, bytes);
            try {
              await sql`
                INSERT INTO app.receipts (id, entry_id, file_name, content_type, byte_size, sha256)
                VALUES (${id}, ${request.params.id}, ${fileName}, ${contentType}, ${bytes.length},
                        ${createHash('sha256').update(bytes).digest('hex')})`.execute(trx);
            } catch (error) {
              await store.remove(id).catch(() => undefined);
              throw error;
            }
            return { id, fileName, contentType, byteSize: bytes.length };
          });
          return reply.code(201).send(made);
        }),
    );

    scope.get<{ Params: { id: string } }>(
      '/accounting/receipts/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        fromAnotherSite(request)
          ? reply.code(403).send({ error: 'forbidden' })
          : signedIn(request, reply, async (db, actor, store) => {
              const row = await withActor(db, actor, async (trx) => {
                await require(trx, BOOKS);
                return (
                  await sql<{ fileName: string; contentType: string; sha256: string }>`
                    SELECT file_name AS "fileName", content_type AS "contentType", sha256
                      FROM app.receipts WHERE id = ${request.params.id}`.execute(trx)
                ).rows[0];
              });
              if (!row) {
                throw new Refusal(404, 'notFound');
              }
              const bytes = await store.get(request.params.id);
              // A row whose file is missing, or whose bytes aren't the ones uploaded, is never served as anything else.
              if (!bytes) {
                throw new Refusal(404, 'notFound');
              }
              if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
                throw new Error("A receipt's bytes don't match their row");
              }
              return reply
                .header('content-type', row.contentType)
                .header('content-disposition', disposition(row.fileName))
                .header(
                  'content-security-policy',
                  "sandbox; default-src 'none'; frame-ancestors 'none'",
                )
                .send(bytes);
            }),
    );

    scope.delete<{ Params: { id: string } }>(
      '/accounting/receipts/:id',
      { schema: { params: ID_PARAMS } },
      async (request, reply) =>
        signedIn(request, reply, async (db, actor, store) => {
          await withActor(db, actor, async (trx) => {
            await require(trx, TESORERIA);
            const { rows } = await sql<{ posted: boolean }>`
              SELECT e.status = 'posted' AS posted
                FROM app.receipts r JOIN app.journal_entries e ON e.id = r.entry_id
               WHERE r.id = ${request.params.id}`.execute(trx);
            if (!rows[0]) {
              throw new Refusal(404, 'notFound');
            }
            if (rows[0].posted) {
              throw new Refusal(409, 'posted');
            }
            await sql`DELETE FROM app.receipts WHERE id = ${request.params.id}`.execute(trx);
          });
          // The row is gone for good: its file goes too. One that can't be removed now is set aside at the next start.
          await store.remove(request.params.id).catch((error: unknown) => captureException(error));
          return reply.code(204).send();
        }),
    );
  };
