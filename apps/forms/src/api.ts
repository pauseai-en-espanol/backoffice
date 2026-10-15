/** The header the API checks the forms app's shared secret in (staff API spec, the forms app's routes). */
export const FORMS_TOKEN_HEADER = 'x-backoffice-forms-token';

export interface ApiAnswer {
  status: number;
  /** The parsed JSON body, or undefined when there was none. */
  body: unknown;
}

const TIMEOUT_MS = 10_000;

/**
 * A POST from this app's server to the API, inside the cluster at API_URL (ADR-0002 §7): the browser never reaches the
 * API. It carries the secret the two share (FORMS_TOKEN) and the visitor's address, which the API counts answers by.
 * Without either setting it answers 503, as the API would. Nothing else of the browser's request is passed on.
 * Server-only: the secret is read from the server's environment, which no browser bundle has.
 */
export const postToApi = async (
  path: '/public/census/form' | '/public/census/submit',
  body: object,
  visitor: string | undefined,
): Promise<ApiAnswer> => {
  const base = process.env.API_URL;
  const token = process.env.FORMS_TOKEN;
  if (!base || !token) {
    return { status: 503, body: { error: 'unavailable' } };
  }
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        [FORMS_TOKEN_HEADER]: token,
        ...(visitor ? { 'x-forwarded-for': visitor } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: 502, body: { error: 'unavailable' } };
  }
  const parsed: unknown = await response.json().catch(() => undefined);
  return { status: response.status, body: parsed };
};
