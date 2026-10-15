import { describe, expect, it } from 'vitest';

import {
  bySendOrder,
  checkProse,
  countWords,
  fieldsIn,
  type LetterContact,
  mailtoLink,
  merge,
  readableOrg,
  renderLetter,
  salutation,
} from './outreach.js';

describe('salutation', () => {
  it('greets a person neutrally unless someone has checked how they are addressed', () => {
    expect(salutation({ orgDisplay: 'Org', personName: 'Berta Ejemplo' })).toBe(
      'Estimado/a Berta Ejemplo:',
    );
    expect(
      salutation({ orgDisplay: 'Org', personName: 'Berta Ejemplo', treatment: 'femenino' }),
    ).toBe('Estimada Berta Ejemplo:');
    expect(
      salutation({
        orgDisplay: 'Org',
        personName: 'Carlos Ejemplo Ejemplo',
        greetingName: 'Carlos Ejemplo',
        treatment: 'masculino',
      }),
    ).toBe('Estimado Carlos Ejemplo:');
  });

  it('greets an inbox as the organisation, reading its listing name as a sentence', () => {
    expect(salutation({ orgDisplay: 'Sindicato Ejemplo — Aragón', territory: 'Aragón' })).toBe(
      'Estimadas compañeras y compañeros de Sindicato Ejemplo en Aragón:',
    );
    expect(
      salutation({ orgDisplay: 'Sindicato Ejemplo — Sección de Fábrica', personName: ' ' }),
    ).toBe('Estimadas compañeras y compañeros de Sindicato Ejemplo, Sección de Fábrica:');
    expect(readableOrg('Asociación Ejemplo')).toBe('Asociación Ejemplo');
  });
});

describe('merge', () => {
  it('fills in fields and reports, rather than blanks, the unknown or empty ones', () => {
    expect(
      merge('{{saludo}} {{ org }} {{otro}} {{role}}', { saludo: 'Hola', org: 'Org', role: ' ' }),
    ).toEqual({
      output: 'Hola Org {{otro}} {{role}}',
      missing: ['otro', 'role'],
    });
    // Nothing from the object's prototype.
    expect(merge('{{constructor}}', {}).missing).toEqual(['constructor']);
    expect(fieldsIn('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
    expect(countWords('  una  dos\ntres ')).toBe(3);
  });
});

describe('checkProse', () => {
  it('fails on a dash and warns on filler, with the words around it', () => {
    const issues = checkProse('Una frase — con raya. Cabe señalar algo; y otra – con guion.');
    expect(issues.map(({ rule, fatal }) => ({ rule, fatal }))).toEqual([
      { rule: 'emDash', fatal: true },
      { rule: 'enDash', fatal: true },
      { rule: 'phrase', fatal: false },
    ]);
    expect(issues[2]?.found).toBe('Cabe señalar');
    expect(checkProse('Un texto\n\nlimpio, con comas: y punto.')).toEqual([]);
  });
});

describe('bySendOrder', () => {
  it('puts priority first, unprioritised last, then tier A, then id', () => {
    const targets = [
      { id: 'd', tier: 'A' as const },
      { id: 'c', tier: 'B' as const, priority: 2 },
      { id: 'b', tier: 'B' as const },
      { id: 'a', tier: 'B' as const, priority: 1 },
      { id: 'e', tier: 'A' as const, priority: null },
    ];
    expect([...targets].sort(bySendOrder).map((t) => t.id)).toEqual(['a', 'c', 'd', 'e', 'b']);
  });
});

const berta: LetterContact = {
  org: 'Asociación Ejemplo',
  tier: 'A',
  orgDisplay: 'Asociación Ejemplo — Aragón',
  territory: 'Aragón',
  personName: 'Berta Ejemplo',
  role: 'Presidencia',
  anchor: 'empleo',
  needsReview: false,
  hold: false,
};
const template = {
  subject: 'Para {{org}}',
  body: '{{saludo}}\n\n{{anchor}}\n\n{{firma}}',
  maxWords: 12,
  sources: ['https://ejemplo.test/carta'],
};
const anchors = {
  empleo: { text: 'Un párrafo con una cifra de ejemplo.', sources: ['https://ejemplo.test/cifra'] },
};

describe('renderLetter', () => {
  it('writes the letter, with its sources and what to look at', () => {
    const letter = renderLetter({ template, contact: berta, anchors, signature: 'Firma' });
    expect(letter).toEqual({
      ok: true,
      subject: 'Para Asociación Ejemplo',
      body: 'Estimado/a Berta Ejemplo:\n\nUn párrafo con una cifra de ejemplo.\n\nFirma',
      words: 11,
      sources: ['https://ejemplo.test/carta', 'https://ejemplo.test/cifra'],
      warnings: [],
    });
    const long = renderLetter({
      template: { ...template, maxWords: 5 },
      contact: berta,
      anchors,
      signature: 'Firma',
    });
    expect(long.ok && long.warnings).toEqual([{ kind: 'long', words: 11, maxWords: 5 }]);
  });

  it("leaves out the anchor's sources when the letter doesn't use it", () => {
    const letter = renderLetter({
      template: { ...template, body: '{{saludo}} {{firma}}' },
      contact: berta,
      anchors,
      signature: 'Firma',
    });
    expect(letter.ok && letter.sources).toEqual(['https://ejemplo.test/carta']);
  });

  it('refuses, with every reason: review, hold, an unknown anchor, a missing field, a dash', () => {
    const letter = renderLetter({
      template: { ...template, body: '{{saludo}} {{sector}} {{anchor}} {{firma}}' },
      contact: { ...berta, needsReview: true, hold: true, anchor: 'vivienda' },
      anchors,
      signature: 'Firma — Equipo',
    });
    expect(letter).toEqual({
      ok: false,
      problems: [
        { kind: 'needsReview' },
        { kind: 'held' },
        { kind: 'unknownAnchor', anchor: 'vivienda' },
        { kind: 'unresolved', fields: ['sector'] },
        { kind: 'prose', issue: expect.objectContaining({ rule: 'emDash' }) },
      ],
    });
  });

  it("says when the campaign has no template for the contact's tier", () => {
    expect(
      renderLetter({
        template: undefined,
        contact: { ...berta, tier: 'B', hold: true },
        anchors,
        signature: 'Firma',
      }),
    ).toEqual({ ok: false, problems: [{ kind: 'held' }, { kind: 'noTemplate', tier: 'B' }] });
  });

  it('asks for an anchor when the letter uses one and the contact has none', () => {
    const letter = renderLetter({
      template,
      contact: { ...berta, anchor: null },
      anchors,
      signature: 'Firma',
    });
    expect(letter).toEqual({ ok: false, problems: [{ kind: 'unresolved', fields: ['anchor'] }] });
  });
});

describe('mailtoLink', () => {
  it('escapes everything and writes line breaks as CRLF', () => {
    expect(
      mailtoLink({
        to: ['berta@ejemplo.test', 'a&b@ejemplo.test'],
        cc: ['info@ejemplo.test'],
        subject: 'Hola & adiós?',
        body: 'Línea uno\nLínea dos',
      }),
    ).toBe(
      'mailto:berta@ejemplo.test,a%26b@ejemplo.test?cc=info@ejemplo.test&subject=Hola%20%26%20adi%C3%B3s%3F' +
        '&body=L%C3%ADnea%20uno%0D%0AL%C3%ADnea%20dos',
    );
    expect(mailtoLink({ to: ['berta@ejemplo.test'], subject: 'S', body: 'B' })).toBe(
      'mailto:berta@ejemplo.test?subject=S&body=B',
    );
  });
});
