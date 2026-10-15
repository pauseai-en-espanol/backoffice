import { describe, expect, it } from 'vitest';

import {
  buildAnswer,
  type CensusOption,
  normalisedHint,
  outcomeOf,
  parseFormInfo,
  splitLanguages,
} from './answer';

const OFFERED: CensusOption[] = [
  { id: '00000000-0000-4000-8000-000000000001', kind: 'skill', label: 'Diseño' },
  { id: '00000000-0000-4000-8000-000000000002', kind: 'interest', label: 'Acciones en la calle' },
];

const formOf = (fields: Record<string, string | string[]>): FormData => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      form.append(name, one);
    }
  }
  return form;
};

const COMPLETE = {
  name: '  Ada Ejemplo ',
  email: 'ada@example.org',
  consentPrivacy: 'on',
  ageOk: 'on',
};

describe('buildAnswer', () => {
  it('builds a minimal answer, trimmed, with every consent a boolean', () => {
    const { answer, problems } = buildAnswer(formOf(COMPLETE), OFFERED);
    expect(problems).toEqual([]);
    expect(answer).toEqual({
      name: 'Ada Ejemplo',
      email: 'ada@example.org',
      consentEmail: false,
      consentWhatsapp: false,
      consentPrivacy: true,
      ageOk: true,
    });
  });

  it('keeps only the options the API offered, each once, and a known availability', () => {
    const { answer } = buildAnswer(
      formOf({
        ...COMPLETE,
        options: [OFFERED[0]!.id, OFFERED[0]!.id, 'not-offered', OFFERED[1]!.id],
        availability: 'under_2h',
        languages: 'castellano, catalán y inglés; castellano',
        consentWhatsapp: 'on',
      }),
      OFFERED,
    );
    expect(answer.options).toEqual([OFFERED[0]!.id, OFFERED[1]!.id]);
    expect(answer.availability).toBe('under_2h');
    expect(answer.languages).toEqual(['castellano', 'catalán', 'inglés']);
    expect(answer.consentWhatsapp).toBe(true);
  });

  it('leaves out an unknown availability and empty fields', () => {
    const { answer } = buildAnswer(
      formOf({ ...COMPLETE, availability: 'always', town: '   ', pronouns: '' }),
      OFFERED,
    );
    expect(answer).not.toHaveProperty('availability');
    expect(answer).not.toHaveProperty('town');
    expect(answer).not.toHaveProperty('pronouns');
  });

  it('cuts text to the API limits', () => {
    const { answer } = buildAnswer(formOf({ ...COMPLETE, pronouns: 'x'.repeat(80) }), OFFERED);
    expect(answer.pronouns).toHaveLength(50);
  });

  it('asks for a name, a way to contact, the privacy notice and the age, in the form order', () => {
    expect(buildAnswer(formOf({}), OFFERED).problems).toEqual([
      'name',
      'contact',
      'consentPrivacy',
      'ageOk',
    ]);
  });

  it('accepts a phone without an email, and refuses one that is not a phone', () => {
    const { email: _email, ...withoutEmail } = COMPLETE;
    expect(
      buildAnswer(formOf({ ...withoutEmail, phone: '612 34 56 78' }), OFFERED).problems,
    ).toEqual([]);
    expect(buildAnswer(formOf({ ...withoutEmail, phone: '12' }), OFFERED).problems).toEqual([
      'phone',
    ]);
  });

  it('refuses an email that is not one', () => {
    expect(buildAnswer(formOf({ ...COMPLETE, email: 'ada@' }), OFFERED).problems).toEqual([
      'email',
    ]);
  });
});

describe('splitLanguages', () => {
  it('splits on commas, semicolons and "y", at most 20', () => {
    expect(splitLanguages(undefined)).toEqual([]);
    expect(splitLanguages('euskera;gallego y  portugués')).toEqual([
      'euskera',
      'gallego',
      'portugués',
    ]);
    expect(
      splitLanguages(Array.from({ length: 30 }, (_, i) => `idioma${i}`).join(',')),
    ).toHaveLength(20);
  });
});

describe('normalisedHint', () => {
  it('says how a phone will be stored when it differs from what was typed', () => {
    expect(normalisedHint('phone', '612 34 56 78')).toBe('+34612345678');
    expect(normalisedHint('phone', '+34612345678')).toBeUndefined();
    expect(normalisedHint('phone', '')).toBeUndefined();
  });

  it('says how an email will be stored', () => {
    expect(normalisedHint('email', ' Ada@Example.ORG ')).toBe('ada@example.org');
  });
});

describe('parseFormInfo', () => {
  it('keeps well-formed options and the API wording version', () => {
    expect(
      parseFormInfo(
        {
          options: [
            ...OFFERED,
            { id: 1, kind: 'skill', label: 'x' },
            { id: 'a', kind: 'other', label: 'y' },
          ],
          greeting: ' Ada ',
          link: 'personal',
          wordingVersion: 'v2',
        },
        'v1',
      ),
    ).toEqual({ options: OFFERED, greeting: 'Ada', link: 'personal', wordingVersion: 'v2' });
  });

  it('falls back to the generic link and the configured version', () => {
    expect(parseFormInfo({ options: [], greeting: '', link: 'odd' }, 'v1')).toEqual({
      options: [],
      greeting: null,
      link: 'generic',
      wordingVersion: 'v1',
    });
  });

  it('refuses what is not a form', () => {
    expect(parseFormInfo(undefined, 'v1')).toBeUndefined();
    expect(parseFormInfo({ options: 'none' }, 'v1')).toBeUndefined();
  });
});

describe('outcomeOf', () => {
  it('reads every answer the API gives', () => {
    expect(outcomeOf(200, { outcome: 'received' })).toEqual({ kind: 'done', outcome: 'received' });
    expect(outcomeOf(200, { outcome: 'updated' })).toEqual({ kind: 'done', outcome: 'updated' });
    // The generic link's outcomes before the review, which told whether someone was known: no longer taken.
    expect(outcomeOf(200, { outcome: 'review' }).kind).not.toBe('done');
    expect(outcomeOf(400, { error: 'invalid', field: 'email' })).toEqual({
      kind: 'invalid',
      field: 'email',
    });
    expect(outcomeOf(400, { error: 'invalid' })).toEqual({ kind: 'invalid' });
    expect(outcomeOf(409, { error: 'invalidLink' })).toEqual({ kind: 'invalidLink' });
    expect(outcomeOf(429, { error: 'limit' })).toEqual({ kind: 'limit' });
  });

  it('calls anything else a failure', () => {
    expect(outcomeOf(200, { outcome: 'odd' })).toEqual({ kind: 'failed' });
    expect(outcomeOf(503, { error: 'unavailable' })).toEqual({ kind: 'failed' });
    expect(outcomeOf(409, {})).toEqual({ kind: 'failed' });
  });
});
