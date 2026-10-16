import { describe, expect, it } from 'vitest';

import { fillMessage, namelessDraft, templateProblems } from './message-templates.js';

describe('templateProblems', () => {
  it('passes a message with its purpose’s placeholders', () => {
    expect(templateProblems('welcome', 'Hola, {nombre}: soy {yo}.', 'Hola: soy {yo}.')).toEqual([]);
    expect(templateProblems('welcome', 'Hola: soy {yo}.', null)).toEqual([]);
    expect(templateProblems('census_link', 'Hola, {nombre}: {enlace}', 'Hola: {enlace}')).toEqual(
      [],
    );
  });

  it('names a placeholder the purpose doesn’t have, once, and a stray brace', () => {
    expect(templateProblems('welcome', 'Hola, {name}: {name}', null)).toEqual([
      { kind: 'unknown', placeholder: '{name}' },
    ]);
    expect(templateProblems('welcome', 'Tu enlace: {enlace}', null)).toEqual([
      { kind: 'unknown', placeholder: '{enlace}' },
    ]);
    expect(templateProblems('welcome', 'Hola {yo', null)).toEqual([{ kind: 'brace' }]);
    expect(templateProblems('welcome', 'Hola {{yo}}', null)).toEqual([{ kind: 'brace' }]);
    expect(templateProblems('welcome', 'Hola, {nombre}', 'Hola, {persona}')).toEqual([
      { kind: 'unknown', placeholder: '{persona}' },
    ]);
  });

  it('needs {enlace} in both versions of a census link’s message', () => {
    expect(templateProblems('census_link', 'Hola', null)).toEqual([{ kind: 'needsLink' }]);
    expect(templateProblems('census_link', 'Hola, {nombre}: {enlace}', 'Hola.')).toEqual([
      { kind: 'needsLink' },
    ]);
  });

  it('asks for a version without a name exactly when the message uses {nombre}', () => {
    expect(templateProblems('welcome', 'Hola, {nombre}.', null)).toEqual([
      { kind: 'needsNameless' },
    ]);
    expect(templateProblems('welcome', 'Hola, {nombre}.', '  ')).toEqual([
      { kind: 'needsNameless' },
    ]);
    expect(templateProblems('welcome', 'Hola, {nombre}.', 'Hola, {nombre}.')).toEqual([
      { kind: 'namelessNames' },
    ]);
    expect(templateProblems('welcome', 'Hola.', 'Hola.')).toEqual([{ kind: 'namelessUnneeded' }]);
  });
});

describe('namelessDraft', () => {
  it('takes the name out with the comma or space before it', () => {
    expect(namelessDraft('Hola, {nombre}: soy {yo}.')).toBe('Hola: soy {yo}.');
    expect(namelessDraft('¡Hola {nombre}!')).toBe('¡Hola!');
    expect(namelessDraft('{nombre}, te escribo.')).toBe('te escribo.');
  });
});

describe('fillMessage', () => {
  const template = {
    body: 'Hola, {nombre}: soy {yo}. {enlace}',
    bodyNameless: 'Hola: soy {yo}. {enlace}',
  };

  it('fills the placeholders', () => {
    expect(
      fillMessage(template, {
        nombre: 'Ana',
        yo: 'Persona de ejemplo',
        enlace: 'https://ejemplo.test/c',
      }),
    ).toBe('Hola, Ana: soy Persona de ejemplo. https://ejemplo.test/c');
  });

  it('uses the version without a name for someone saved without one', () => {
    expect(fillMessage(template, { yo: 'Persona de ejemplo', enlace: 'E' })).toBe(
      'Hola: soy Persona de ejemplo. E',
    );
    expect(fillMessage(template, { nombre: ' ', yo: 'P', enlace: 'E' })).toBe('Hola: soy P. E');
    expect(fillMessage({ body: 'Hola: soy {yo}.', bodyNameless: null }, { yo: 'P' })).toBe(
      'Hola: soy P.',
    );
  });
});
