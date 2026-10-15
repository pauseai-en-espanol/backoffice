import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as form } from '../formulario/route';
import { POST as send } from './route';

const HOST = 'unete.example.org';
// Made up for the tests.
const SECRET = 'test-only-forms-secret-0123456789abcdef';
const TOKEN = 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ-0123';

const post = (path: string, body: unknown, forwardedFor = '198.51.100.1, 203.0.113.7') =>
  new Request(`https://${HOST}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      host: HOST,
      origin: `https://${HOST}`,
      'content-type': 'application/json',
      'x-forwarded-for': forwardedFor,
    },
  });

const ANSWER = {
  name: 'Ada Ejemplo',
  email: 'ada@example.org',
  consentEmail: false,
  consentWhatsapp: false,
  consentPrivacy: true,
  ageOk: true,
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('API_URL', 'http://backoffice-api:3001');
  vi.stubEnv('FORMS_TOKEN', SECRET);
  vi.stubEnv('WORDING_VERSION', '');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const answering = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(Response.json(body, { status }));

/** What the route sent the API, in its nth call. */
const sent = (index = 0) => {
  const [input, init] = fetchMock.mock.calls[index]!;
  return {
    url: input instanceof Request ? input.url : input.toString(),
    headers: new Headers(init?.headers),
    body: JSON.parse(typeof init?.body === 'string' ? init.body : 'null') as unknown,
  };
};

describe('POST /enviar', () => {
  it('forwards the answer with the secret and the visitor, and passes the outcome back', async () => {
    answering(200, { outcome: 'created', extra: 'never passed back' });
    const response = await send(
      post('/enviar', { token: TOKEN, startedAt: 1, website: '', answer: ANSWER }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outcome: 'created' });
    expect(response.headers.get('cache-control')).toBe('no-store');

    const { url, headers, body } = sent();
    expect(url).toBe('http://backoffice-api:3001/public/census/submit');
    expect(headers.get('x-backoffice-forms-token')).toBe(SECRET);
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(body).toEqual({
      token: TOKEN,
      startedAt: 1,
      website: '',
      answer: ANSWER,
    });
  });

  it('passes the API refusals back as they are', async () => {
    answering(400, { error: 'invalid', field: 'email' });
    const invalid = await send(post('/enviar', { startedAt: 1, website: '', answer: ANSWER }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'invalid', field: 'email' });

    answering(409, { error: 'invalidLink' });
    expect(
      (await send(post('/enviar', { token: TOKEN, startedAt: 1, website: '', answer: ANSWER })))
        .status,
    ).toBe(409);

    answering(429, { error: 'limit' });
    expect(
      (await send(post('/enviar', { startedAt: 1, website: '', answer: ANSWER }))).status,
    ).toBe(429);
  });

  it('answers 503 when the API fails, cannot be reached or is not configured', async () => {
    answering(500, { error: 'unexpected' });
    const failed = await send(post('/enviar', { startedAt: 1, website: '', answer: ANSWER }));
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toEqual({ error: 'unavailable' });

    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(
      (await send(post('/enviar', { startedAt: 1, website: '', answer: ANSWER }))).status,
    ).toBe(503);

    vi.stubEnv('FORMS_TOKEN', '');
    expect(
      (await send(post('/enviar', { startedAt: 1, website: '', answer: ANSWER }))).status,
    ).toBe(503);
  });

  it('refuses a malformed body before calling the API', async () => {
    for (const body of [
      { startedAt: 'now', website: '', answer: ANSWER },
      { startedAt: 1, answer: ANSWER },
      { startedAt: 1, website: '', answer: [] },
      { token: 'short', startedAt: 1, website: '', answer: ANSWER },
    ]) {
      expect((await send(post('/enviar', body))).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no visitor address when the last one is not an address', async () => {
    answering(200, { outcome: 'updated' });
    await send(post('/enviar', { startedAt: 1, website: '', answer: ANSWER }, '203.0.113.7, junk'));
    expect(sent().headers.has('x-forwarded-for')).toBe(false);
  });
});

describe('POST /formulario', () => {
  it('asks the API for the form, and answers its lists', async () => {
    answering(200, { options: [], greeting: 'Ada', link: 'personal', wordingVersion: 'v1' });
    const response = await form(post('/formulario', { token: TOKEN }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      options: [],
      greeting: 'Ada',
      link: 'personal',
      wordingVersion: 'v1',
    });
    expect(sent().url).toBe('http://backoffice-api:3001/public/census/form');
    expect(sent().body).toEqual({ token: TOKEN });
  });

  it('calls a token of the wrong shape invalid without asking the API', async () => {
    const response = await form(post('/formulario', { token: 'short' }));
    await expect(response.json()).resolves.toMatchObject({ link: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 503 when the API does not give a form', async () => {
    answering(404, { error: 'notFound' });
    expect((await form(post('/formulario', {}))).status).toBe(503);
  });
});
