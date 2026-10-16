import { describe, expect, it } from 'vitest';

import { nameOf, teamPost, unlinked } from './replies.js';

/** What Telegram makes a link of, in plain text: a web address, a domain, an email, an @handle, a /command. */
const LINKABLE = /:\/\/|[\p{L}\p{N}]\.[\p{L}\p{N}]|@|(?:^|\s)\//u;

describe('text someone outside typed, as the bot posts it (security review)', () => {
  it.each([
    'Gana un premio en https://ejemplo.test/premio',
    'Escribe a premio@ejemplo.test',
    'Sígueme en @cuenta_de_ejemplo',
    'www.ejemplo.test',
    'ejemplo.test',
    '/start',
    'Ana /help',
  ])('links nowhere: %s', (typed) => {
    expect(unlinked(typed)).not.toMatch(LINKABLE);
  });

  it('leaves a name as it reads', () => {
    expect(unlinked('María José Ejemplo-Pérez')).toBe('María José Ejemplo-Pérez');
    expect(nameOf(' Ana Ejemplo ')).toBe('Ana Ejemplo');
    expect(nameOf(null)).toBe('Sin nombre');
  });

  it('applies to the names and provinces the team group sees', () => {
    const { text } = teamPost('https://backoffice.ejemplo.test', {
      personId: '0190f8c4-0000-7000-8000-0000000003a1',
      name: 'Premio en ejemplo.test',
      province: 'Visita @cuenta_de_ejemplo',
      sources: ['airtable'],
      stage: 'new',
      ownerName: null,
    });
    expect(text).not.toMatch(LINKABLE);
  });
});
