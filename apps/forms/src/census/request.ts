/**
 * What the form's own routes (`/formulario`, `/enviar`) take from a browser: JSON (which a page elsewhere can't send
 * without the browser asking first), from a page of this host (Origin and Fetch Metadata), and small. There is no
 * cookie or session to protect; this keeps other sites from posting through their visitors' browsers.
 */

/** A census answer is a few kilobytes; this is plenty. */
export const MAX_BODY_BYTES = 32 * 1024;

export type Read = { ok: true; body: Record<string, unknown> } | Refused;
export type Refused = { ok: false; status: 400 | 403 | 413 | 415; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether the request comes from a page of the host it was sent to. */
export const fromThisHost = (headers: Headers): boolean => {
  const site = headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') {
    return false;
  }
  const origin = headers.get('origin');
  const host = headers.get('host');
  if (!origin || !host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

export const readJsonBody = async (request: Request): Promise<Read> => {
  if (!fromThisHost(request.headers)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, status: 415, error: 'invalid' };
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'invalid' };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'invalid' };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: 'invalid' };
  }
  return isRecord(body) ? { ok: true, body } : { ok: false, status: 400, error: 'invalid' };
};

/** Only what the API's answer may carry back to the browser: its outcome, its error code and the field at fault. */
export const passBack = (body: unknown): Record<string, string> => {
  if (!isRecord(body)) {
    return {};
  }
  return Object.fromEntries(
    ['outcome', 'error', 'field']
      .filter((key) => typeof body[key] === 'string')
      .map((key) => [key, body[key] as string]),
  );
};

export const json = (status: number, body: object): Response =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
