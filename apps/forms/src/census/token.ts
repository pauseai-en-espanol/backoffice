/**
 * A personal link's token (onboarding spec §7.2): it travels in the address's fragment, `/c#token=…`, which browsers
 * never send to any server, so no log records it. The page reads it here, takes it out of the address bar, and sends it
 * in a request's body.
 */

/** base64url, as the API makes them (32 random bytes: 43 characters), as loose as the API's check. */
const TOKEN = /^[\w-]{20,200}$/u;

/** The token in a fragment such as `#token=abc`, or undefined when there is none, or it isn't one. */
export const tokenFromHash = (hash: string): string | undefined => {
  const value = new URLSearchParams(hash.replace(/^#/u, '')).get('token') ?? undefined;
  return value !== undefined && TOKEN.test(value) ? value : undefined;
};

/** Whether a token in a request's body has a token's shape, before it goes to the API. */
export const isToken = (value: unknown): value is string =>
  typeof value === 'string' && TOKEN.test(value);
