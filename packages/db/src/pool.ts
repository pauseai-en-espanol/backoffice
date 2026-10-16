import pg from 'pg';

/**
 * A pool that outlives a lost connection (PLAN R153). When an idle connection dies (Postgres restarted, a restore
 * ended every session, the network dropped it), pg emits `error` on the pool; with no listener, Node throws it and
 * the process exits. The pool has already let that connection go and opens another when next asked, so a warning is
 * all it takes. Only the SQLSTATE is logged, never the message.
 *
 * Every connection runs without JIT, after the caller's own options: the attention view's estimate passes
 * jit_above_cost with a few hundred people, and compiling its plan took ~0.6 s of a ~0.65 s Hoy, every time.
 */
export const createPool = (config: pg.PoolConfig): pg.Pool => {
  const pool = new pg.Pool({
    ...config,
    options: [config.options, '-c jit=off'].filter(Boolean).join(' '),
  });
  pool.on('error', (error: Error & { code?: unknown }) => {
    const code = typeof error.code === 'string' ? error.code : 'no SQLSTATE';
    console.warn(`A database connection was lost (${code}); the pool opens another when needed`);
  });
  return pool;
};
