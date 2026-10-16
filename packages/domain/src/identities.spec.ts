import { describe, expect, it } from 'vitest';

import {
  foldName,
  normalizeAirtableId,
  normalizeDiscord,
  normalizeEmail,
  normalizeIdentity,
  normalizePhone,
} from './identities.js';

describe('Discord usernames (PLAN M5)', () => {
  it('are lowercased, trimmed and stripped of a leading @', () => {
    expect(normalizeDiscord('  @Persona_De.Ejemplo ')).toBe('persona_de.ejemplo');
    expect(normalizeIdentity('discord', 'ab')).toBe('ab');
    expect(normalizeDiscord('x'.repeat(32))).toBe('x'.repeat(32));
  });

  it('refuse what Discord wouldn’t make', () => {
    for (const raw of ['', 'a', 'x'.repeat(33), 'per..sona', 'per sona', 'persona#1234', 'peña']) {
      expect(normalizeDiscord(raw), raw).toBeUndefined();
    }
  });
});

describe('emails', () => {
  it('are trimmed, lowercased and stripped of mailto: and brackets', () => {
    expect(normalizeEmail('  Ana.Garcia@Ejemplo.TEST ')).toBe('ana.garcia@ejemplo.test');
    expect(normalizeEmail('mailto:ana@ejemplo.test')).toBe('ana@ejemplo.test');
    expect(normalizeEmail('<ana@ejemplo.test>')).toBe('ana@ejemplo.test');
  });

  it('refuse what is not one', () => {
    for (const raw of [
      '',
      'ana',
      'ana@',
      '@ejemplo.test',
      'ana@ejemplo',
      'ana garcía@ejemplo.test',
      'a@b@c.test',
    ]) {
      expect(normalizeEmail(raw), raw).toBeUndefined();
    }
  });
});

describe('phone numbers', () => {
  it('become E.164, Spanish by default, however they are written', () => {
    for (const raw of [
      '612 345 678',
      '612345678',
      '+34 612 34 56 78',
      '0034 612-345-678',
      '(+34) 612.345.678',
    ]) {
      expect(normalizePhone(raw), raw).toBe('+34612345678');
    }
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
  });

  it('refuse what is not a valid number', () => {
    for (const raw of ['', '12345', '612 345', 'llámame', '+34 112']) {
      expect(normalizePhone(raw), raw).toBeUndefined();
    }
  });
});

describe('Airtable record ids', () => {
  it('are rec plus 14 letters and digits', () => {
    expect(normalizeAirtableId(' recAbCdEfGh123456 ')).toBe('recAbCdEfGh123456');
    expect(normalizeAirtableId('recShort')).toBeUndefined();
  });
});

describe('normalizeIdentity', () => {
  it('normalises by kind', () => {
    expect(normalizeIdentity('email', 'A@B.TEST')).toBe('a@b.test');
    expect(normalizeIdentity('phone', '612345678')).toBe('+34612345678');
    expect(normalizeIdentity('airtable', 'nope')).toBeUndefined();
  });
});

describe('foldName', () => {
  it('folds case, accents and punctuation for comparing', () => {
    expect(foldName('  María-José  NÚÑEZ ')).toBe('maria jose nunez');
    expect(foldName("Joan Pau i Martí · L'Hospitalet")).toBe('joan pau i marti l hospitalet');
    expect(foldName('Ánxela Conceição')).toBe('anxela conceicao');
  });
});
