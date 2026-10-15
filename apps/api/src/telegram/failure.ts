import { TelegramError } from './client.js';

/**
 * What may be logged or reported of the bot's failures (ADR-0002, logs and errors): a Bot API failure by its method and
 * Telegram's description (never the address, which holds the token); a database error by its SQLSTATE and where it
 * came from, never its message or detail, which can quote what was written (a phone number, say); anything else by
 * its name alone.
 */
export const botFailure = (error: unknown): Error => {
  if (error instanceof TelegramError) {
    return error;
  }
  const { code, routine } = (error ?? {}) as { code?: unknown; routine?: unknown };
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code)) {
    return new Error(`The bot's database call failed: SQLSTATE ${code} in ${String(routine)}`);
  }
  return new Error(`The bot failed: ${error instanceof Error ? error.name : typeof error}`);
};
