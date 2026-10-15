import { describe, expect, it } from 'vitest';

import type { CensusOption } from './types';

import {
  answerRows,
  consentText,
  linkState,
  linkText,
  progressOf,
  reorder,
  textBar,
} from './format';
import { parseCensus, parseNewLink, parseOptions } from './types';

const option = (
  id: string,
  kind: 'skill' | 'interest',
  label: string,
  position: number,
): CensusOption => ({
  id,
  kind,
  label,
  active: true,
  position,
});

const OPTIONS = [
  option('s1', 'skill', 'Diseño', 1),
  option('s2', 'skill', 'Programación', 2),
  option('i1', 'interest', 'Eventos', 1),
];

const WORDS = {
  fields: {
    name: 'Nombre',
    preferredName: 'Nombre preferido',
    province: 'Provincia',
    languages: 'Idiomas',
    availability: 'Disponibilidad',
    skills: 'Habilidades',
    interests: 'Quiere ayudar en',
    skillsOther: 'Otra habilidad',
    consentEmail: 'Contacto por correo',
    consentWhatsapp: 'Contacto por WhatsApp',
    consentPrivacy: 'Aviso de privacidad',
    wordingVersion: 'Versión del texto',
  },
  availability: { under_2h: 'Menos de 2 h a la semana' },
  yes: 'Sí',
  no: 'No',
  unknownOption: 'Opción que ya no existe',
};

describe('census progress', () => {
  it('is whole percent, rounded down, and never more than everyone', () => {
    expect(progressOf({ people: 3, completed: 2 })).toEqual({
      people: 3,
      completed: 2,
      percent: 66,
    });
    expect(progressOf({ people: 0, completed: 0 }).percent).toBe(0);
    expect(progressOf({ people: 2, completed: 5 })).toEqual({
      people: 2,
      completed: 2,
      percent: 100,
    });
  });

  it('draws a bar of text that shows anyone done, and fills only for everyone', () => {
    expect(textBar(0, 10)).toBe('░░░░░░░░░░');
    expect(textBar(1, 10)).toBe('█░░░░░░░░░');
    expect(textBar(66, 10)).toBe('███████░░░');
    expect(textBar(99, 10)).toBe('█████████░');
    expect(textBar(100, 10)).toBe('██████████');
  });
});

describe('consents in words', () => {
  const words = {
    granted: 'Sí, desde el {date} (texto {version})',
    denied: 'No, desde el {date} (texto {version})',
    never: 'Nunca',
  };

  it('say yes or no, since when (in Madrid) and which wording; or that nobody asked', () => {
    expect(
      consentText({ granted: true, at: '2026-10-14T23:30:00Z', wordingVersion: 'v1' }, words),
    ).toBe('Sí, desde el 15 de octubre de 2026 (texto v1)');
    expect(
      consentText({ granted: false, at: '2026-10-15T10:00:00Z', wordingVersion: '' }, words),
    ).toBe('No, desde el 15 de octubre de 2026 (texto —)');
    expect(consentText(null, words)).toBe('Nunca');
  });
});

describe('a personal link’s state', () => {
  const link = {
    id: 'l',
    createdAt: '2026-10-01T00:00:00Z',
    expiresAt: '2026-10-31T00:00:00Z',
    sentAt: null,
    usedAt: null,
  };
  const now = new Date('2026-10-15T00:00:00Z');

  it('is used, expired, sent or new, in that order', () => {
    expect(linkState(link, now)).toBe('new');
    expect(linkState({ ...link, sentAt: '2026-10-02T00:00:00Z' }, now)).toBe('sent');
    expect(linkState(link, new Date('2026-11-01T00:00:00Z'))).toBe('expired');
    expect(
      linkState({ ...link, usedAt: '2026-10-03T00:00:00Z' }, new Date('2026-11-01T00:00:00Z')),
    ).toBe('used');
  });

  it('is said in one line: made, sent, and used or until when', () => {
    const words = {
      created: 'Enlace creado el {date}',
      expires: 'caduca el {date}',
      expired: 'caducó el {date}',
      sent: 'enviado el {date}',
      notSent: 'sin enviar',
      used: 'usado el {date}',
    };
    expect(linkText(link, words, now)).toBe(
      'Enlace creado el 1 de octubre de 2026 · sin enviar · caduca el 31 de octubre de 2026',
    );
    expect(
      linkText(
        { ...link, sentAt: '2026-10-02T09:00:00Z' },
        words,
        new Date('2026-11-01T00:00:00Z'),
      ),
    ).toBe(
      'Enlace creado el 1 de octubre de 2026 · enviado el 2 de octubre de 2026 · caducó el 31 de octubre de 2026',
    );
    expect(
      linkText(
        { ...link, sentAt: '2026-10-02T09:00:00Z', usedAt: '2026-10-03T09:00:00Z' },
        words,
        now,
      ),
    ).toBe(
      'Enlace creado el 1 de octubre de 2026 · enviado el 2 de octubre de 2026 · usado el 3 de octubre de 2026',
    );
  });
});

describe('a census answer in the Bandeja', () => {
  it('shows its fields in words, options by label, and never an email or phone', () => {
    const rows = answerRows(
      {
        name: 'Ana Ejemplo',
        preferred_name: 'Ani',
        email: 'ana@ejemplo.test',
        phone: '+34600000001',
        languages: ['Castellano', 'Catalán'],
        availability: 'under_2h',
        options: ['s2', 'i1', 'gone'],
        skills_other: 'Fotografía',
        consent_email: true,
        consent_whatsapp: false,
        consent_privacy: true,
        wording_version: 'v1',
      },
      OPTIONS,
      WORDS,
    );
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ['Nombre', 'Ana Ejemplo'],
      ['Nombre preferido', 'Ani'],
      ['Idiomas', 'Castellano, Catalán'],
      ['Disponibilidad', 'Menos de 2 h a la semana'],
      ['Habilidades', 'Programación, Opción que ya no existe'],
      ['Otra habilidad', 'Fotografía'],
      ['Quiere ayudar en', 'Eventos, Opción que ya no existe'],
      ['Contacto por correo', 'Sí'],
      ['Contacto por WhatsApp', 'No'],
      ['Aviso de privacidad', 'Sí'],
      ['Versión del texto', 'v1'],
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/ejemplo\.test|600000001/u);
  });

  it('reads the form’s camelCase keys too, and leaves out what is empty', () => {
    expect(
      answerRows({ name: 'Bea', preferredName: ' ', consentPrivacy: true }, OPTIONS, WORDS),
    ).toEqual([
      { key: 'name', label: 'Nombre', value: 'Bea' },
      { key: 'consentPrivacy', label: 'Aviso de privacidad', value: 'Sí' },
    ]);
  });
});

describe('reordering an options list', () => {
  it('moves one option past its neighbour, giving the whole list in its new order', () => {
    expect(
      reorder(
        OPTIONS.filter((o) => o.kind === 'skill'),
        's2',
        'up',
      ),
    ).toEqual(['s2', 's1']);
    const tied = [
      option('a', 'skill', 'A', 0),
      option('b', 'skill', 'B', 0),
      option('c', 'skill', 'C', 0),
    ];
    expect(reorder(tied, 'a', 'down')).toEqual(['b', 'a', 'c']);
    expect(reorder(tied, 'a', 'up')).toEqual([]);
    expect(reorder(tied, 'z', 'down')).toEqual([]);
  });

  it('does nothing past either end', () => {
    expect(reorder(OPTIONS, 's1', 'up')).toEqual([]);
    expect(reorder(OPTIONS, 'nadie', 'down')).toEqual([]);
  });
});

describe('the census answers', () => {
  it('parse the census, a new link and the options, refusing what they don’t understand', () => {
    const person = {
      id: 'p',
      name: 'Ana',
      fullName: 'Ana Ejemplo',
      stage: 'new',
      owner: null,
      province: null,
      nextAction: null,
      nextActionDue: null,
      reasons: [],
      inCommunity: true,
      sources: ['manual'],
      createdAt: '2026-10-15T00:00:00Z',
    };
    expect(
      parseCensus({
        counts: { people: 10, completed: 3, linksSent: 2, linksUsed: 1 },
        queue: [{ person, link: null }],
      })?.queue[0]?.link,
    ).toBeNull();
    expect(parseCensus({ counts: {}, queue: [{ person: {}, link: null }] })).toBeUndefined();
    expect(
      parseNewLink({
        id: 'l',
        url: 'https://x.test/c#token=t',
        expiresAt: '2026-11-14T00:00:00Z',
        whatsapp: null,
      }),
    ).toEqual({
      id: 'l',
      url: 'https://x.test/c#token=t',
      expiresAt: '2026-11-14T00:00:00Z',
      whatsapp: null,
    });
    expect(parseOptions({ options: [{ id: 'o', kind: 'skill', label: 'Diseño' }] })).toEqual([
      { id: 'o', kind: 'skill', label: 'Diseño', active: true, position: 0 },
    ]);
    expect(parseOptions([{ id: 'o', kind: 'otra', label: 'X' }])).toBeUndefined();
  });
});
