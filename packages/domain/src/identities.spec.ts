import { describe, expect, it } from 'vitest';

import {
  BOT_PHONE_SEARCH_DIGITS,
  foldName,
  inferIdentityKind,
  mayBeDiscord,
  normalizeAirtableId,
  normalizeDiscord,
  normalizeEmail,
  normalizeIdentity,
  normalizePhone,
  phoneSearchDigits,
  spacedPhone,
} from './identities.js';

describe('Discord usernames (PLAN M5)', () => {
  it('are lowercased, trimmed and stripped of a leading @', () => {
    expect(normalizeDiscord('  @Persona_De.Ejemplo ')).toBe('persona_de.ejemplo');
    expect(normalizeIdentity('discord', 'ab')).toBe('ab');
    expect(normalizeDiscord('x'.repeat(32))).toBe('x'.repeat(32));
  });

  it('are read through the invisible marks pasted with them (PLAN R97)', () => {
    expect(normalizeDiscord('‪@Persona_De.Ejemplo‬')).toBe('persona_de.ejemplo');
  });

  it('refuse what Discord wouldn’t make', () => {
    for (const raw of ['', 'a', 'x'.repeat(33), 'per..sona', 'per sona', 'persona#1234', 'peña']) {
      expect(normalizeDiscord(raw), raw).toBeUndefined();
    }
  });
});

describe('inferIdentityKind: what someone typed in Contacto (PLAN R63)', () => {
  it('reads a phone number as people write it', () => {
    for (const raw of ['612 34 56 78', '+34 612 34 56 78', '0034 612345678', '(612) 345-678']) {
      expect(inferIdentityKind(raw), raw).toBe('phone');
    }
  });

  it('reads an @ with a dot after it as an email', () => {
    for (const raw of [
      'ana@ejemplo.test',
      ' Ana.Garcia@Ejemplo.TEST ',
      'mailto:ana@ejemplo.test',
    ]) {
      expect(inferIdentityKind(raw), raw).toBe('email');
    }
  });

  it('reads what was pasted with the invisible marks WhatsApp and phones copy with it (PLAN R97)', () => {
    for (const raw of [
      '‪+34 612 34 56 78‬',
      '⁦+34612345678⁩',
      '+34612345678‎',
      '612​345​678',
      '+34 612 34 56 78',
    ]) {
      expect(inferIdentityKind(raw), raw).toBe('phone');
    }
    expect(inferIdentityKind('‪ana@ejemplo.test‬')).toBe('email');
    expect(inferIdentityKind('‪@persona_de.ejemplo‬')).toBe('discord');
    expect(inferIdentityKind('‪‬')).toBeUndefined();
  });

  it('reads anything else Discord would make as a Discord username, a leading @ too', () => {
    for (const raw of ['persona_de.ejemplo', '@Persona', 'ab']) {
      expect(inferIdentityKind(raw), raw).toBe('discord');
    }
  });

  it('reads only digits as a phone, and the same digits with an @ in front as a Discord username (PLAN R69)', () => {
    expect(inferIdentityKind('612345678')).toBe('phone');
    expect(inferIdentityKind('@612345678')).toBe('discord');
    expect(inferIdentityKind('@2024')).toBe('discord');
  });

  it('says when what it read as a phone, or refused, could be a Discord username (PLAN R69)', () => {
    for (const raw of ['612345678', ' 612.345.678 ', '2024']) {
      expect(mayBeDiscord(raw), raw).toBe(true);
    }
    for (const raw of [
      '612 34 56 78',
      '+34612345678',
      '@612345678',
      'persona',
      'ana@ejemplo.test',
      '1',
      '',
    ]) {
      expect(mayBeDiscord(raw), raw).toBe(false);
    }
  });

  it('knows nothing it couldn’t store: a short number, an address without a dot, a space or a #', () => {
    for (const raw of [
      '',
      '   ',
      '612 34',
      '123',
      'ana@ejemplo',
      'ana @ejemplo.test',
      'persona#1234',
      'a',
    ]) {
      expect(inferIdentityKind(raw), raw).toBeUndefined();
    }
  });
});

describe('emails', () => {
  it('are trimmed, lowercased and stripped of mailto: and brackets', () => {
    expect(normalizeEmail('  Ana.Garcia@Ejemplo.TEST ')).toBe('ana.garcia@ejemplo.test');
    expect(normalizeEmail('mailto:ana@ejemplo.test')).toBe('ana@ejemplo.test');
    expect(normalizeEmail('<ana@ejemplo.test>')).toBe('ana@ejemplo.test');
  });

  it('are kept without the invisible marks pasted with them, so the same address is one (PLAN R97)', () => {
    expect(normalizeEmail('‪ana@ejemplo.test‬')).toBe('ana@ejemplo.test');
    expect(normalizeEmail('ana​@ejemplo.test‎')).toBe('ana@ejemplo.test');
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

  it('are read through the invisible marks and odd spaces pasted with them (PLAN R97)', () => {
    for (const raw of [
      '‪+34 612 34 56 78‬',
      '+34‎612‎345‎678',
      '+34 612 34 56 78',
      '+34 612 345 678',
    ]) {
      expect(normalizePhone(raw), raw).toBe('+34612345678');
    }
  });

  it('refuse what is not a valid number', () => {
    for (const raw of ['', '12345', '612 345', 'llámame', '+34 112']) {
      expect(normalizePhone(raw), raw).toBeUndefined();
    }
  });

  it('are written back with their spaces, which a spreadsheet keeps as text, and read the same again', () => {
    expect(spacedPhone('+34612345678')).toBe('+34 612 34 56 78');
    expect(spacedPhone('+447911123456')).toBe('+44 7911 123456');
    expect(normalizePhone(spacedPhone('+34612345678'))).toBe('+34612345678');
  });
});

describe('a phone searched for in part (PLAN R72, R96)', () => {
  it('is the digits of a query written as a phone, without the zeros its prefix starts with', () => {
    expect(phoneSearchDigits('857 756 3987')).toBe('8577563987');
    expect(phoneSearchDigits('(857) 756-3987')).toBe('8577563987');
    expect(phoneSearchDigits('+1 857 756 3987')).toBe('18577563987');
    expect(phoneSearchDigits('0044 7700 900123')).toBe('447700900123');
    expect(phoneSearchDigits('07700 900123')).toBe('7700900123');
    expect(phoneSearchDigits('56 78 90')).toBe('567890');
  });

  it('takes as few as 2 digits, however they are spaced (PLAN R96)', () => {
    for (const raw of ['56', '5 6', ' 5-6 ', '(5) 6', '5.6']) {
      expect(phoneSearchDigits(raw), raw).toBe('56');
    }
    expect(phoneSearchDigits('56 789')).toBe('56789');
    expect(phoneSearchDigits('+34 6')).toBe('346');
  });

  it('keeps the zeros when dropping them would leave too few digits (PLAN R96)', () => {
    expect(phoneSearchDigits('06')).toBe('06');
    expect(phoneSearchDigits('00')).toBe('00');
    expect(phoneSearchDigits('0 0 0')).toBe('000');
    expect(phoneSearchDigits('0612')).toBe('612');
  });

  it('reads a number pasted with the marks WhatsApp and phones put around it (PLAN R96)', () => {
    // Left-to-right embedding and mark, no-break and narrow no-break spaces, as a copied number brings them.
    expect(phoneSearchDigits('‪+34 612 34 56 78‬')).toBe('34612345678');
    expect(phoneSearchDigits('‎612 34')).toBe('61234');
  });

  it('is nothing for a single digit, or for what isn’t only a phone', () => {
    expect(phoneSearchDigits('5')).toBeUndefined();
    expect(phoneSearchDigits(' 0 ')).toBeUndefined();
    expect(phoneSearchDigits('Ana 612345678')).toBeUndefined();
    expect(phoneSearchDigits('ana@ejemplo.test')).toBeUndefined();
    expect(phoneSearchDigits('@612345678')).toBeUndefined();
  });

  it('needs 6 digits in the bot, which never shows a number (PLAN R82, ADR-0004)', () => {
    expect(phoneSearchDigits('56 789', BOT_PHONE_SEARCH_DIGITS)).toBeUndefined();
    expect(phoneSearchDigits('56 78 90', BOT_PHONE_SEARCH_DIGITS)).toBe('567890');
    // A prefix's zeros are no digits of the number.
    expect(phoneSearchDigits('0034 612', BOT_PHONE_SEARCH_DIGITS)).toBeUndefined();
    expect(phoneSearchDigits('0034 612')).toBe('34612');
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
