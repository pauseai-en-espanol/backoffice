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

  it('applies to the names and places the team group sees', () => {
    const { text } = teamPost('https://backoffice.ejemplo.test', {
      personId: '0190f8c4-0000-7000-8000-0000000003a1',
      name: 'Premio en ejemplo.test',
      province: 'Visita @cuenta_de_ejemplo',
      country: 'MX',
      sources: ['airtable'],
      stage: 'new',
      ownerName: null,
    });
    expect(text).not.toMatch(LINKABLE);
  });
});

describe('the team group post says where someone lives (PLAN R81)', () => {
  const post = (place: { province: string | null; country: string | null }) =>
    teamPost('https://backoffice.ejemplo.test', {
      personId: '0190f8c4-0000-7000-8000-0000000003a1',
      name: 'Ana Ejemplo',
      ...place,
      sources: ['manual'],
      stage: 'new',
      ownerName: null,
    }).text.split('\n');

  it('as a province and a country, Spain going without saying', () => {
    expect(post({ province: 'Baviera', country: 'DE' })).toContain('Dónde vive: Baviera, Alemania');
    expect(post({ province: 'Sevilla', country: 'ES' })).toContain('Dónde vive: Sevilla');
    expect(post({ province: null, country: 'AR' })).toContain('Dónde vive: Argentina');
    expect(post({ province: 'Sevilla', country: null })).toContain('Dónde vive: Sevilla');
  });

  it('and nothing when nobody knows', () => {
    expect(post({ province: null, country: null }).join('\n')).not.toContain('Dónde vive');
  });
});
