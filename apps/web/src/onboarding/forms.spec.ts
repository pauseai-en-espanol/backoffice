import { describe, expect, it } from 'vitest';

import {
  listFrom,
  normalised,
  parseAnalysis,
  profileChange,
  quickAddProblems,
  settingsChange,
} from './forms';

const reader = (values: Record<string, string>) => (name: string) => values[name] ?? '';

describe('the profile form', () => {
  const profile = {
    id: 'p',
    fullName: 'Ana Ejemplo',
    preferredName: null,
    province: 'Madrid',
    town: null,
    languages: ['castellano'],
    pronouns: null,
    availability: null,
    howHeard: null,
  };

  it('sends only what changed, trimmed, and null for what was emptied', () => {
    expect(
      profileChange(
        profile,
        reader({
          fullName: ' Ana Ejemplo ',
          preferredName: ' Anita ',
          province: '',
          languages: 'castellano, catalán, castellano',
          availability: 'under_2h',
        }),
      ),
    ).toEqual({
      preferredName: 'Anita',
      province: null,
      languages: ['castellano', 'catalán'],
      availability: 'under_2h',
    });
  });

  it('sends nothing when nothing changed', () => {
    expect(
      profileChange(
        profile,
        reader({ fullName: 'Ana Ejemplo', province: 'Madrid', languages: 'castellano' }),
      ),
    ).toEqual({});
  });
});

describe('the settings form', () => {
  const settings = {
    followUpDays: 5,
    unresponsiveAttempts: 3,
    unresponsiveDays: 14,
    unassignedAlertHours: 48,
    matchThreshold: 0.55,
    communityChats: ['Madrid'],
  };

  it('sends changed numbers (a decimal comma too) and the chats, one a line', () => {
    expect(
      settingsChange(
        settings,
        reader({
          followUpDays: '7',
          unresponsiveAttempts: '3',
          unresponsiveDays: '',
          unassignedAlertHours: 'muchas',
          matchThreshold: '0,6',
          communityChats: 'Madrid\n\n Barcelona \nMadrid',
        }),
      ),
    ).toEqual({ followUpDays: 7, matchThreshold: 0.6, communityChats: ['Madrid', 'Barcelona'] });
  });

  it('splits lists without blanks or repeats', () => {
    expect(listFrom(' a, b ,, a ', ',')).toEqual(['a', 'b']);
  });
});

describe('quick-add', () => {
  it('needs a name and a valid phone or email, and a choice when there are candidates', () => {
    expect(quickAddProblems({ name: '', phone: '', email: '', candidates: 0, choice: '' })).toEqual(
      ['name', 'contact'],
    );
    expect(
      quickAddProblems({ name: 'Ana', phone: '123', email: 'ana@', candidates: 2, choice: '' }),
    ).toEqual(['phone', 'email', 'choice']);
    expect(
      quickAddProblems({
        name: 'Ana',
        phone: '612 345 678',
        email: '',
        candidates: 1,
        choice: 'new',
      }),
    ).toEqual([]);
  });

  it('hints how a phone or email will be stored', () => {
    expect(normalised('phone', '612 345 678')).toBe('+34612345678');
    expect(normalised('email', ' Ana@Ejemplo.TEST ')).toBe('ana@ejemplo.test');
    expect(normalised('phone', 'no')).toBeUndefined();
    expect(normalised('email', '')).toBeUndefined();
  });
});

describe("a CSV dry run's answer", () => {
  it("takes the API's mapping, ignoring the columns it leaves out", () => {
    expect(
      parseAnalysis({
        columns: ['Nombre', 'Tel', 'Otra'],
        mapping: { Nombre: 'name', Tel: 'phone', Otra: 'no-es-campo' },
        preview: [{ name: 'Ana' }, 'basura'],
        invalid: [{ row: 3, field: 'phone' }],
        counts: { created: 2, import_id: 'x' },
      }),
    ).toEqual({
      columns: ['Nombre', 'Tel', 'Otra'],
      mapping: { Nombre: 'name', Tel: 'phone', Otra: 'ignore' },
      preview: [{ name: 'Ana' }],
      invalid: [{ row: '3', field: 'phone' }],
      counts: { created: 2 },
    });
  });

  it('guesses from the headers when the API gives no mapping, and refuses an answer without columns', () => {
    expect(parseAnalysis({ columns: ['Nombre', 'Email'] })?.mapping).toEqual({
      Nombre: 'name',
      Email: 'email',
    });
    expect(parseAnalysis({ rows: [] })).toBeUndefined();
  });
});
