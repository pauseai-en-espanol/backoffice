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
    arrivedOn: null,
    arrival: null,
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

  it('leaves someone without a name so when the field stays empty, and sends a name once typed', () => {
    const nameless = { ...profile, fullName: null };
    expect(
      profileChange(nameless, reader({ province: 'Madrid', languages: 'castellano' })),
    ).toEqual({});
    expect(
      profileChange(
        nameless,
        reader({ fullName: ' Ana Nueva ', province: 'Madrid', languages: 'castellano' }),
      ),
    ).toEqual({ fullName: 'Ana Nueva' });
  });

  it('sends when they arrived and where from, and emptied means nobody knows, or not said (PLAN M5)', () => {
    const dated = {
      ...profile,
      arrivedOn: '2025-03-01',
      arrival: { id: 'canal-1', label: 'WhatsApp' },
    };
    const same = { fullName: 'Ana Ejemplo', province: 'Madrid', languages: 'castellano' };
    expect(
      profileChange(dated, reader({ ...same, arrivedOn: '2025-03-01', arrivalId: 'canal-1' })),
    ).toEqual({});
    expect(
      profileChange(dated, reader({ ...same, arrivedOn: '2024-12-24', arrivalId: 'canal-2' })),
    ).toEqual({ arrivedOn: '2024-12-24', arrivalId: 'canal-2' });
    expect(profileChange(dated, reader(same))).toEqual({ arrivedOn: null, arrivalId: null });
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
  it('needs a valid phone or email, a name only if known, and a choice when there are candidates', () => {
    expect(quickAddProblems({ name: '', phone: '', email: '', candidates: 0, choice: '' })).toEqual(
      ['contact'],
    );
    expect(
      quickAddProblems({ name: '', phone: '612 345 678', email: '', candidates: 0, choice: '' }),
    ).toEqual([]);
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

  it('takes a Discord username as enough to find them by, when it is one (PLAN M5)', () => {
    const none = { name: '', phone: '', email: '', candidates: 0, choice: '' };
    expect(quickAddProblems({ ...none, discord: '@Persona_Ejemplo' })).toEqual([]);
    expect(quickAddProblems({ ...none, discord: 'a' })).toEqual(['discord']);
    expect(quickAddProblems({ ...none, discord: '   ' })).toEqual(['contact']);
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
