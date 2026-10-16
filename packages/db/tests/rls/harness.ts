import type pg from 'pg';

import { actAs, RUNTIME_ROLES, type RuntimeRole } from '../db.js';

/** Who runs a case: a runtime role, plus the actor and channel withActor would set (ADR-0002). */
export interface Principal {
  /** Stable name used in test titles, e.g. "onboarding web". */
  id: string;
  role: RuntimeRole;
  userId?: string;
  aal?: 1 | 2;
  channel?: 'web' | 'bot';
}

export interface Case {
  principal: Principal;
  /** Runs as the principal. Writes use RETURNING, so "affected" can be counted. */
  sql: string;
  params?: unknown[];
  /** Runs as superuser before the attempt and must return exactly one row: the target exists. */
  target: string;
  targetParams?: unknown[];
}

export type Outcome =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: 'error'; code: string }
  | { kind: 'deny'; reason: 'no-rows' };

const fingerprint = async (client: pg.Client, c: Case): Promise<string> =>
  JSON.stringify((await client.query(c.target, c.targetParams)).rows);

/**
 * Runs one case inside the caller's transaction and classifies it:
 * - allow: exactly one row visible or affected;
 * - deny: an error, or zero rows, and the target is unchanged afterwards.
 * Anything else (a missing target, several rows, a deny that still changed data) throws, so it can never pass
 * silently. Everything the case did is rolled back.
 */
export const runCase = async (client: pg.Client, c: Case): Promise<Outcome> => {
  if (!RUNTIME_ROLES.includes(c.principal.role)) {
    throw new Error(`Unknown runtime role ${c.principal.role}`);
  }
  const before = await client.query(c.target, c.targetParams);
  if (before.rowCount !== 1) {
    throw new Error(
      `[${c.principal.id}] target must match exactly one row, matched ${before.rowCount}: ${c.target}`,
    );
  }
  const beforePrint = JSON.stringify(before.rows);

  await client.query('SAVEPOINT rls_case');
  try {
    await actAs(client, c.principal.role, c.principal);

    let outcome: Outcome;
    let affected = 0;
    await client.query('SAVEPOINT rls_attempt');
    try {
      affected = (await client.query(c.sql, c.params)).rowCount ?? 0;
      await client.query('RELEASE SAVEPOINT rls_attempt');
      outcome = affected === 0 ? { kind: 'deny', reason: 'no-rows' } : { kind: 'allow' };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT rls_attempt');
      outcome = {
        kind: 'deny',
        reason: 'error',
        code: (error as { code?: string }).code ?? 'unknown',
      };
    }

    await client.query('RESET ROLE');
    if (outcome.kind === 'allow' && affected !== 1) {
      throw new Error(`[${c.principal.id}] expected exactly one row, got ${affected}: ${c.sql}`);
    }
    if (outcome.kind === 'deny' && (await fingerprint(client, c)) !== beforePrint) {
      throw new Error(`[${c.principal.id}] denied but the target changed: ${c.sql}`);
    }
    return outcome;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT rls_case');
  }
};
