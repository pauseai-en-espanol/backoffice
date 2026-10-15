import { describe, expect, it } from 'vitest';

import { fromThisHost, MAX_BODY_BYTES, passBack, readJsonBody } from './request';

const HOST = 'unete.example.org';

const request = (body: string, headers: Record<string, string> = {}) =>
  new Request(`https://${HOST}/enviar`, {
    method: 'POST',
    body,
    headers: {
      host: HOST,
      origin: `https://${HOST}`,
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      ...headers,
    },
  });

describe('fromThisHost', () => {
  it('takes a request from a page of this host', () => {
    expect(fromThisHost(new Headers({ host: HOST, origin: `https://${HOST}` }))).toBe(true);
    expect(
      fromThisHost(
        new Headers({ host: HOST, origin: `https://${HOST}`, 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(true);
  });

  it('refuses one from another site, or without an Origin', () => {
    expect(fromThisHost(new Headers({ host: HOST, origin: 'https://elsewhere.example' }))).toBe(
      false,
    );
    expect(
      fromThisHost(
        new Headers({ host: HOST, origin: `https://${HOST}`, 'sec-fetch-site': 'cross-site' }),
      ),
    ).toBe(false);
    expect(fromThisHost(new Headers({ host: HOST }))).toBe(false);
    expect(fromThisHost(new Headers({ host: HOST, origin: 'null' }))).toBe(false);
  });
});

describe('readJsonBody', () => {
  it('reads a JSON object', async () => {
    await expect(readJsonBody(request('{"a":1}'))).resolves.toEqual({ ok: true, body: { a: 1 } });
  });

  it('refuses another site, another type, a big body, bad JSON or no object', async () => {
    await expect(
      readJsonBody(request('{}', { origin: 'https://elsewhere.example' })),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(
      readJsonBody(request('a=1', { 'content-type': 'application/x-www-form-urlencoded' })),
    ).resolves.toMatchObject({ ok: false, status: 415 });
    await expect(
      readJsonBody(request(JSON.stringify({ a: 'x'.repeat(MAX_BODY_BYTES) }))),
    ).resolves.toMatchObject({ ok: false, status: 413 });
    await expect(readJsonBody(request('{'))).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(readJsonBody(request('[1]'))).resolves.toMatchObject({ ok: false, status: 400 });
  });
});

describe('passBack', () => {
  it('keeps only the outcome, the error and the field', () => {
    expect(passBack({ outcome: 'received', person: 'x', error: 3 })).toEqual({
      outcome: 'received',
    });
    expect(passBack({ error: 'invalid', field: 'email', detail: 'x' })).toEqual({
      error: 'invalid',
      field: 'email',
    });
    expect(passBack('text')).toEqual({});
  });
});
