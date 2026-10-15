import pg from 'pg';

import { superuserUrl } from './env.js';

/** Runs `fn` in a superuser transaction that is always rolled back, so tests never leave anything behind. */
export const inRolledBackTransaction = async <T>(
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> => {
  const client = new pg.Client({ connectionString: superuserUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end();
  }
};

/** Runs `sql` inside a savepoint and returns the SQLSTATE it failed with, or null if it succeeded. */
export const errorCode = async (
  client: pg.Client,
  sql: string,
  params: unknown[] = [],
): Promise<string | null> => {
  await client.query('SAVEPOINT attempt');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT attempt');
    return null;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT attempt');
    return (error as { code?: string }).code ?? 'unknown';
  }
};

/**
 * Acts as `role`, for `userId` at `aal` through `channel`, for the rest of the transaction (as withActor does for the
 * API). Undo with `RESET ROLE`.
 */
export const actAs = async (
  client: pg.Client,
  role: RuntimeRole,
  actor: { userId?: string; aal?: 1 | 2; channel?: 'web' | 'bot' } = {},
): Promise<void> => {
  await client.query(`SET LOCAL ROLE ${role}`);
  await client.query(
    `SELECT set_config('app.user_id', $1, true), set_config('app.aal', $2, true),
            set_config('app.channel', $3, true)`,
    [actor.userId ?? '', actor.aal ? String(actor.aal) : '', actor.channel ?? ''],
  );
};

export const RUNTIME_ROLES = [
  'pauseai_backoffice_app',
  'pauseai_backoffice_auth',
  'pauseai_backoffice_ingest',
  'pauseai_backoffice_public',
] as const;

export type RuntimeRole = (typeof RUNTIME_ROLES)[number];
