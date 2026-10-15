import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inRolledBackTransaction } from '../db.js';
import { superuserUrl } from '../env.js';
import { expectedOutcome, matrixCases } from './cases.js';
import { type Outcome, runCase } from './harness.js';
import { PRINCIPALS, RELATIONS } from './matrix.js';

/**
 * A deny must come from the security layers: RLS hiding the row, or a permission error (a missing grant, a failed
 * WITH CHECK). Any other error means the case itself is broken, and must not pass as a deny.
 */
const INSUFFICIENT_PRIVILEGE = '42501';

const verdict = (outcome: Outcome): string =>
  outcome.kind === 'allow' ||
  outcome.reason === 'no-rows' ||
  outcome.code === INSUFFICIENT_PRIVILEGE
    ? outcome.kind
    : `error ${outcome.code}`;

describe('access matrix', () => {
  it('covers every table and view in app, and nothing else', async () => {
    const relations = await inRolledBackTransaction(async (client) =>
      (
        await client.query<{ name: string }>(
          `SELECT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'app' AND c.relkind IN ('r', 'p', 'v') ORDER BY 1`,
        )
      ).rows.map((r) => r.name),
    );
    expect(Object.keys(RELATIONS).sort()).toEqual(relations);
  });

  it('names every principal uniquely', () => {
    const ids = PRINCIPALS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('denies everyone when a rule names nobody', () => {
    for (const principal of PRINCIPALS) {
      expect(expectedOutcome(principal, {})).toBe('deny');
    }
  });

  it('admits a role through the bot only where a rule says so', () => {
    const bot = PRINCIPALS.find((p) => p.id === 'admin bot');
    expect(bot && expectedOutcome(bot, { web: ['admin'] })).toBe('deny');
    expect(bot && expectedOutcome(bot, { bot: ['admin'] })).toBe('allow');
  });
});

const cases = matrixCases();

for (const relation of Object.keys(RELATIONS)) {
  describe(`matrix: ${relation}`, () => {
    let client: pg.Client;

    beforeAll(async () => {
      client = new pg.Client({ connectionString: superuserUrl() });
      await client.connect();
      await client.query('BEGIN');
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    });

    afterAll(async () => {
      await client.query('ROLLBACK');
      await client.end();
    });

    it.each(cases.filter((c) => c.relation === relation).map((c) => [c.principal.id, c.name, c]))(
      '%s: %s',
      async (_principal, _name, c) => {
        expect(verdict(await runCase(client, c))).toBe(c.expected);
      },
    );
  });
}
