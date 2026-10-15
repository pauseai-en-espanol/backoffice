import { afterEach, describe, expect, it, vi } from 'vitest';

import { messageFor, send } from './write';

const messages = {
  unexpected: 'Algo ha fallado.',
  forbidden: 'Sin permiso.',
  stale: 'Ha cambiado.',
  limit: 'Demasiados intentos.',
  network: 'Sin conexión.',
  signIn: 'Vuelve a entrar.',
  invalid: 'Un dato no es válido.',
  lastAdmin: 'Última persona con administración.',
  email: 'Escribe un correo.',
};

describe('messageFor', () => {
  it("words the API's own code", () => {
    expect(messageFor({ status: 409, error: 'lastAdmin' }, messages)).toBe(
      'Última persona con administración.',
    );
    expect(messageFor({ status: 403, error: 'forbidden' }, messages)).toBe('Sin permiso.');
  });

  it("words an invalid field by the field's own words, else as invalid", () => {
    expect(messageFor({ status: 400, error: 'invalid', field: 'email' }, messages)).toBe(
      'Escribe un correo.',
    );
    expect(messageFor({ status: 400, error: 'invalid', field: 'otro' }, messages)).toBe(
      'Un dato no es válido.',
    );
  });

  it('falls back to the status, then to unexpected, for a code it does not know', () => {
    expect(messageFor({ status: 429, error: 'nuevo' }, messages)).toBe('Demasiados intentos.');
    expect(messageFor({ status: 401 }, messages)).toBe('Vuelve a entrar.');
    expect(messageFor({ status: 0, error: 'network' }, messages)).toBe('Sin conexión.');
    expect(messageFor({ status: 500, error: 'boom' }, messages)).toBe('Algo ha fallado.');
    expect(messageFor({ status: 418 }, messages)).toBe('Algo ha fallado.');
  });
});

describe('send', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends JSON and reads the code and field of a refusal', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: 'invalid', field: 'email' }, { status: 400 }),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await send('POST', '/api/invitations', { email: 'x' })).toMatchObject({
      ok: false,
      status: 400,
      error: 'invalid',
      field: 'email',
    });
    expect(fetch).toHaveBeenCalledWith('/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"email":"x"}',
    });
  });

  it('takes an empty answer as a success, and a failed request as no connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    expect(await send('DELETE', '/api/invitations/1')).toEqual({ ok: true, status: 204, body: {} });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await send('DELETE', '/api/invitations/1')).toMatchObject({
      ok: false,
      error: 'network',
    });
  });
});
