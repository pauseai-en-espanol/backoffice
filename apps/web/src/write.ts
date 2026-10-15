/**
 * Writes from the browser to the API, on this same host (`/api/...`, which the gateway sends to the API): the browser
 * sends the session cookie and the Origin the API checks. Every answer that isn't a success carries `{ error }`, a code
 * the page words in Spanish (packages/i18n `errors` and the page's own); never the API's or the database's text.
 */

export interface WriteAnswer {
  ok: boolean;
  status: number;
  /** The API's error code, when it gave one. */
  error?: string;
  /** For `invalid`: the field the API refused, when it said. */
  field?: string;
  body: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const send = async (
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: object,
): Promise<WriteAnswer> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: 'network', body: {} };
  }
  const parsed: unknown = await response.json().catch(() => undefined);
  const record = isRecord(parsed) ? parsed : {};
  return {
    ok: response.ok,
    status: response.status,
    ...(typeof record.error === 'string' ? { error: record.error } : {}),
    ...(typeof record.field === 'string' ? { field: record.field } : {}),
    body: record,
  };
};

/** What a status means when the API gave no code of its own, or one the page doesn't know. */
const BY_STATUS: Readonly<Record<number, string>> = {
  0: 'network',
  400: 'invalid',
  401: 'signIn',
  403: 'forbidden',
  404: 'notFound',
  409: 'stale',
  422: 'incomplete',
  429: 'limit',
};

/**
 * The words for a refused write: the field's own words for an `invalid` that names one (`messages[field]`), else the
 * code's, else the status's, else "unexpected". `messages` must hold at least `unexpected`.
 */
export const messageFor = (
  answer: Pick<WriteAnswer, 'status' | 'error' | 'field'>,
  messages: Readonly<Record<string, string>>,
): string => {
  const { status, error, field } = answer;
  if (error === 'invalid' && field !== undefined && messages[field] !== undefined) {
    return messages[field];
  }
  if (error !== undefined && messages[error] !== undefined) {
    return messages[error];
  }
  const byStatus = BY_STATUS[status];
  return (byStatus !== undefined ? messages[byStatus] : undefined) ?? messages.unexpected ?? '';
};
