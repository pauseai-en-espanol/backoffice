import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';

/** A logger's output, line by line. */
const capture = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream };
};

/** A database error as pg throws one: its detail quotes the row. Fictional. */
const databaseError = () =>
  Object.assign(new Error('Fallo con persona.ejemplo@ejemplo.test y el 600 123 456'), {
    code: '23505',
    constraint: 'identities_kind_value_key',
    detail: 'Key (kind, value)=(email, persona.ejemplo@ejemplo.test) already exists.',
    where: 'PL/pgSQL function private.intake_process(uuid,text,uuid) line 40',
  });

describe('an error nobody caught', () => {
  it('is logged with its kind and code, never what could quote a person (ADR-0002, logs and errors)', async () => {
    const { lines, stream } = capture();
    const app = buildApp({ logger: { level: 'info', stream } });
    app.get('/fallo', async () => {
      throw databaseError();
    });
    await app.inject({ method: 'GET', url: '/fallo?token=secreto' });
    // Whoever writes a line with someone's address in it.
    app.log.warn('Aviso para persona.ejemplo@ejemplo.test');
    await app.close();
    const logged = lines.join('');
    expect(logged).toContain('23505');
    expect(logged).toContain('identities_kind_value_key');
    for (const quoted of [
      'ejemplo.test',
      '600 123 456',
      'already exists',
      'intake_process',
      'secreto',
    ]) {
      expect(logged).not.toContain(quoted);
    }
  });

  it('answers 500 without its message', async () => {
    const app = buildApp();
    app.get('/fallo', async () => {
      throw databaseError();
    });
    const answer = await app.inject({ method: 'GET', url: '/fallo' });
    await app.close();
    expect(answer.statusCode).toBe(500);
    expect(answer.json()).toEqual({ error: 'internal' });
  });

  it('leaves Fastify’s own refusals as they are', async () => {
    const app = buildApp();
    app.post('/eco', async () => ({ ok: true }));
    const answer = await app.inject({
      method: 'POST',
      url: '/eco',
      headers: { 'content-type': 'application/json' },
      payload: '{no es json',
    });
    await app.close();
    expect(answer.statusCode).toBe(400);
  });
});
