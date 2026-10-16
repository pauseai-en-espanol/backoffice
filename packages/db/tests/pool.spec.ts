import { afterAll, describe, expect, it } from 'vitest';

import { createAuthPool } from '../src/auth-pool.js';
import { createPool } from '../src/pool.js';
import { superuserUrl } from './env.js';

const setting = async (pool: ReturnType<typeof createPool>, name: string): Promise<string> => {
  const { rows } = await pool.query<{ value: string }>('SELECT current_setting($1) AS value', [
    name,
  ]);
  return rows[0]?.value ?? '';
};

describe('every connection the code opens runs without JIT', () => {
  // Compiling the attention view's plan took ~0.6 s of a ~0.65 s Hoy with 138 people: the planner's estimate passes
  // jit_above_cost long before the work is worth compiling.
  const plain = createPool({ connectionString: superuserUrl(), max: 1 });
  const auth = createAuthPool({ connectionString: superuserUrl(), maxConnections: 1 });

  afterAll(async () => {
    await Promise.all([plain.end(), auth.end()]);
  });

  it('a pool from createPool', async () => {
    expect(await setting(plain, 'jit')).toBe('off');
  });

  it("Better Auth's pool, which brings options of its own, keeps both", async () => {
    expect(await setting(auth, 'jit')).toBe('off');
    expect(await setting(auth, 'search_path')).toBe('auth');
  });
});
