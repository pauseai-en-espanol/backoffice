import type { createAuthPool } from '@backoffice/db/auth-pool';

/** The rate limiter's windows last seconds (auth.ts); a row a day past its last request counts nothing any more. */
export const RATE_LIMIT_KEEP_MS = 24 * 60 * 60 * 1000;

export interface DeletedAuthRows {
  sessions: number;
  verifications: number;
  rateLimits: number;
  linkCodes: number;
}

/**
 * Deletes what Better Auth keeps about people once it serves nothing (personal data): sessions past their
 * end, which it deletes only when it meets them again, so a session nobody comes back to would stay with its address
 * and browser; verification values past theirs (pending second factors and their attempt counts); and the rate
 * limiter's rows, keyed by address, a day after their last request. Runs as pauseai_backoffice_auth, which reaches these
 * tables and nothing else (ADR-0002).
 */
export const deleteExpiredAuthRows = async (
  pool: ReturnType<typeof createAuthPool>,
  now: Date = new Date(),
): Promise<DeletedAuthRows> => {
  const sessions = await pool.query('DELETE FROM sessions WHERE expires_at < $1', [now]);
  const verifications = await pool.query('DELETE FROM verifications WHERE expires_at < $1', [now]);
  const rateLimits = await pool.query('DELETE FROM rate_limits WHERE last_request < $1', [
    now.getTime() - RATE_LIMIT_KEEP_MS,
  ]);
  return {
    sessions: sessions.rowCount ?? 0,
    verifications: verifications.rowCount ?? 0,
    rateLimits: rateLimits.rowCount ?? 0,
    linkCodes: await deleteSpentLinkCodes(pool, now),
  };
};

/**
 * Ends every session of an account at once, and unlinks its Telegram account (ADR-0004): a deactivated staff
 * member's, so they are signed out everywhere and the bot no longer listens to them, not only refused by the
 * database. As pauseai_backoffice_auth. Returns the sessions ended.
 */
export const endSessions = async (
  pool: ReturnType<typeof createAuthPool>,
  userId: string,
): Promise<number> => {
  await pool.query('DELETE FROM telegram_links WHERE user_id = $1', [userId]);
  return (await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId])).rowCount ?? 0;
};

/** Telegram link codes past their ten minutes, or used: they serve nothing any more (ADR-0004). */
export const deleteSpentLinkCodes = async (
  pool: ReturnType<typeof createAuthPool>,
  now: Date = new Date(),
): Promise<number> =>
  (
    await pool.query(
      'DELETE FROM telegram_link_codes WHERE expires_at < $1 OR used_at IS NOT NULL',
      [now],
    )
  ).rowCount ?? 0;
