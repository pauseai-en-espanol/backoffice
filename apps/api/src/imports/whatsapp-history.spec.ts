import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contactBook, readGoogleContacts } from './google-contacts.js';
import {
  ChatError,
  historyRows,
  importCsv,
  isInside,
  parseChat,
  participantsOf,
  personName,
  provinceIn,
  unresolvedCsv,
} from './whatsapp-history.js';

/** An Android export in English, month first, as WhatsApp writes it; every person in it is made up. */
const ANDROID_EN = [
  '1/15/25, 22:11 - Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. Learn more',
  '1/15/25, 22:11 - Persona Fundadora [Madrid] (PauseAI ES) created group "Grupo de ejemplo"',
  '1/15/25, 22:12 - Persona Fundadora [Madrid] (PauseAI ES) added you',
  '1/15/25, 22:13 - Persona Fundadora [Madrid] (PauseAI ES): Hola a todos',
  'y una segunda línea del mismo mensaje',
  '1/16/25, 09:00 - \u200eAna Ejemplo [Sevilla] joined using this group’s invite link',
  "1/16/25, 09:05 - +34 600 00 00 51 joined using this group's invite link",
  '1/20/25, 18:30 - Persona Fundadora [Madrid] (PauseAI ES) added Bea Ejemplo, Carla Ejemplo and +34 600 00 00 52',
  '1/21/25, 10:00 - Ana Ejemplo [Sevilla]: Gracias por añadirme: estoy dentro',
  '2/14/25, 12:00 - Bea Ejemplo left',
  '3/1/25, 08:00 - Persona Fundadora [Madrid] (PauseAI ES) removed Carla Ejemplo',
  '3/2/25, 08:00 - Dani Antiguo: Yo ya estaba antes del historial',
  '3/3/25, 08:00 - Unknown: ',
  "4/10/25, 19:45 - Bea Ejemplo joined using this group's invite link",
  '5/5/25, 11:11 - Ana Ejemplo [Sevilla]: Bea Ejemplo left',
  '6/6/25, 06:06 - Persona Fundadora [Madrid] (PauseAI ES) changed the group description',
  '6/7/25, 06:06 - Persona Fundadora [Madrid] (PauseAI ES) did something new',
  '7/1/25, 10:00 - Eva Ejemplo changed their phone number to a new number. Tap to message or add the new number.',
  '7/2/25, 10:00 - Eva Ejemplo: Sigo aquí con otro número',
  '8/1/25, 10:00 - Gema Ejemplo joined using a group link.',
  '8/2/25, 10:00 - +34 600 00 00 53 joined via invite link',
].join('\n');

describe('reading a WhatsApp export', () => {
  it('finds who joined, left and wrote, and when, by day; leaves out the exporter and the other system lines', () => {
    const chat = parseChat(ANDROID_EN);
    expect(chat.dateOrder).toBe('mdy');
    expect(chat.aboutYou).toBe(1);
    expect(chat.unknown).toBe(1);
    expect(chat.events).toEqual([
      { kind: 'wrote', who: 'Persona Fundadora [Madrid] (PauseAI ES)', day: '2025-01-15' },
      { kind: 'joined', who: 'Ana Ejemplo [Sevilla]', day: '2025-01-16' },
      { kind: 'joined', who: '+34 600 00 00 51', day: '2025-01-16' },
      { kind: 'joined', who: 'Bea Ejemplo', day: '2025-01-20' },
      { kind: 'joined', who: 'Carla Ejemplo', day: '2025-01-20' },
      { kind: 'joined', who: '+34 600 00 00 52', day: '2025-01-20' },
      { kind: 'wrote', who: 'Ana Ejemplo [Sevilla]', day: '2025-01-21' },
      { kind: 'left', who: 'Bea Ejemplo', day: '2025-02-14' },
      { kind: 'left', who: 'Carla Ejemplo', day: '2025-03-01' },
      { kind: 'wrote', who: 'Dani Antiguo', day: '2025-03-02' },
      { kind: 'joined', who: 'Bea Ejemplo', day: '2025-04-10' },
      { kind: 'wrote', who: 'Ana Ejemplo [Sevilla]', day: '2025-05-05' },
      { kind: 'changedNumber', who: 'Eva Ejemplo', day: '2025-07-01' },
      { kind: 'wrote', who: 'Eva Ejemplo', day: '2025-07-02' },
      { kind: 'joined', who: 'Gema Ejemplo', day: '2025-08-01' },
      { kind: 'joined', who: '+34 600 00 00 53', day: '2025-08-02' },
    ]);
  });

  it('reads Spanish exports, day first, and iOS ones, whose system lines go under the group’s name', () => {
    const spanish = parseChat(
      [
        '15/1/25, 9:00 - Ana Ejemplo se unió usando el enlace de invitación de este grupo',
        '16/1/25, 9:00 - Persona Fundadora añadió a Bea Ejemplo y Carla Ejemplo',
        '17/1/25, 9:00 - Persona Fundadora te añadió',
        '18/1/25, 9:00 - Bea Ejemplo salió',
        '19/1/25, 9:00 - Persona Fundadora eliminó a Carla Ejemplo',
      ].join('\n'),
    );
    expect(spanish.dateOrder).toBe('dmy');
    expect(spanish.aboutYou).toBe(1);
    expect(spanish.events.map(({ kind, who, day }) => `${kind} ${who} ${day}`)).toEqual([
      'joined Ana Ejemplo 2025-01-15',
      'joined Bea Ejemplo 2025-01-16',
      'joined Carla Ejemplo 2025-01-16',
      'left Bea Ejemplo 2025-01-18',
      'left Carla Ejemplo 2025-01-19',
    ]);
    const ios = parseChat(
      [
        "[13/01/2025, 17:31:05] Grupo de ejemplo: \u200eAna Ejemplo joined using this group's invite link",
        '[14/01/2025, 5:31:05 PM] Ana Ejemplo: Hola',
        '[15/01/2025, 17:31:05] Grupo de ejemplo: \u200eAna Ejemplo left',
      ].join('\n'),
    );
    expect(ios.events.map(({ kind, who, day }) => `${kind} ${who} ${day}`)).toEqual([
      'joined Ana Ejemplo 2025-01-13',
      'wrote Ana Ejemplo 2025-01-14',
      'left Ana Ejemplo 2025-01-15',
    ]);
  });

  it('takes a message that says something was switched on for a message', () => {
    expect(parseChat('1/16/25, 9:00 - Ana Ejemplo: we turned on the stream').events).toEqual([
      { kind: 'wrote', who: 'Ana Ejemplo', day: '2025-01-16' },
    ]);
  });

  it('leaves the exporter out of a list of names', () => {
    const chat = parseChat('1/16/25, 9:00 - Persona Fundadora added Hugo Ejemplo and you');
    expect(chat.events).toEqual([{ kind: 'joined', who: 'Hugo Ejemplo', day: '2025-01-16' }]);
    expect(chat.aboutYou).toBe(1);
  });

  it('keeps a list that is one person’s name whole, when the contacts know it', () => {
    const chat = parseChat('16/1/25, 9:00 - Persona Fundadora añadió a José Ortega y Gasset', {
      isName: (name) => name === 'José Ortega y Gasset',
    });
    expect(chat.events.map((event) => event.who)).toEqual(['José Ortega y Gasset']);
  });

  it('asks which way round the dates are when every one could be either, and refuses what isn’t an export', () => {
    const early = '1/2/25, 9:00 - Ana Ejemplo left';
    expect(() => parseChat(early)).toThrow(new ChatError('ambiguousDates'));
    expect(parseChat(early, { dateOrder: 'dmy' }).events[0]?.day).toBe('2025-02-01');
    expect(parseChat(early, { dateOrder: 'mdy' }).events[0]?.day).toBe('2025-01-02');
    expect(() => parseChat('13/1/25, 9:00 - A left\n1/13/25, 9:00 - B left')).toThrow(
      new ChatError('mixedDates'),
    );
    expect(() => parseChat('Nombre;Teléfono\nAna;600000000')).toThrow(new ChatError('notAnExport'));
  });
});

describe('stays in the group', () => {
  it('opens one on a join, closes it on a leave, and starts one before the history for who wrote or left first', () => {
    const byWho = Object.fromEntries(
      participantsOf(parseChat(ANDROID_EN).events).map((one) => [one.who, one]),
    );
    expect(byWho['Bea Ejemplo']?.stays).toEqual([
      { joined: '2025-01-20', left: '2025-02-14' },
      { joined: '2025-04-10', left: null },
    ]);
    expect(byWho['Carla Ejemplo']?.stays).toEqual([{ joined: '2025-01-20', left: '2025-03-01' }]);
    expect(byWho['Ana Ejemplo [Sevilla]']?.stays).toEqual([{ joined: '2025-01-16', left: null }]);
    expect(byWho['Dani Antiguo']?.stays).toEqual([{ joined: null, left: null }]);
    expect(byWho['Eva Ejemplo']).toMatchObject({
      changedNumber: true,
      stays: [{ joined: null, left: null }],
    });
    expect(
      participantsOf([
        { kind: 'left', who: 'Fran Ejemplo', day: '2025-01-01' },
        { kind: 'wrote', who: 'Fran Ejemplo', day: '2025-02-01' },
      ])[0]?.stays,
    ).toEqual([
      { joined: null, left: '2025-01-01' },
      { joined: null, left: null },
    ]);
    expect(
      participantsOf([{ kind: 'changedNumber', who: 'Hugo Ejemplo', day: '2025-01-01' }])[0],
    ).toEqual({ who: 'Hugo Ejemplo', changedNumber: true, stays: [{ joined: null, left: null }] });
  });
});

/** A Google Contacts export (2024 and after), made up. */
const CONTACTS = [
  'First Name,Middle Name,Last Name,Name Prefix,Name Suffix,Nickname,File As,E-mail 1 - Label,E-mail 1 - Value,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value',
  'Persona,,Fundadora [Madrid] (PauseAI ES),,,,,,,Mobile,+34 600 00 00 60,,',
  'Ana,,Ejemplo [Sevilla],,,,,* Home,ana@ejemplo.test,Home,910 00 00 00,Mobile,600 00 00 61',
  'Bea,,Ejemplo,,,,,,,Mobile,600000062 ::: 600000063,,',
  'Carla,,Ejemplo,,,,,,,,,,',
  'Dani,,Antiguo,,,,,,,Mobile,600 00 00 64,,',
  'Dani,,Antiguo,,,,,,,Mobile,600 00 00 65,,',
  'Persona,,Con Número,,,,,Work,numero@ejemplo.test,Mobile,+34 600 00 00 52,,',
  'Eva,,Ejemplo,,,,,,,Mobile,600 00 00 66,,',
].join('\n');

describe('the exporter’s Google Contacts', () => {
  it('reads names as the phone shows them, mobile numbers first, and emails; several in one cell', () => {
    const [founder, ana, bea, carla] = readGoogleContacts(CONTACTS);
    expect(founder).toEqual({
      names: ['Persona Fundadora [Madrid] (PauseAI ES)', 'Fundadora [Madrid] (PauseAI ES) Persona'],
      phones: ['+34600000060'],
      emails: [],
    });
    expect(ana?.phones).toEqual(['+34600000061', '+34910000000']);
    expect(ana?.emails).toEqual(['ana@ejemplo.test']);
    expect(bea?.phones).toEqual(['+34600000062', '+34600000063']);
    expect(carla).toMatchObject({ phones: [], emails: [] });
    expect(
      readGoogleContacts(
        'Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value\nLola Vieja,Lola,Vieja,Mobile,600000067',
      )[0],
    ).toEqual({ names: ['Lola Vieja', 'Vieja Lola'], phones: ['+34600000067'], emails: [] });
  });

  it('finds a contact by its name folded, by its name without what is in brackets, or by a number', () => {
    const book = contactBook(readGoogleContacts(CONTACTS));
    expect(book.byName('ANA EJEMPLO [SEVILLA]')[0]?.emails).toEqual(['ana@ejemplo.test']);
    expect(book.byName('Bea Ejemplo (Valencia)')[0]?.phones[0]).toBe('+34600000062');
    expect(book.byName('Dani Antiguo')).toHaveLength(2);
    expect(book.byName('Nadie')).toEqual([]);
    expect(book.byPhone('+34600000052')[0]?.names[0]).toBe('Persona Con Número');
  });
});

describe('where the files are', () => {
  it('knows a path inside a folder, links followed, from one beside it', () => {
    const base = mkdtempSync(join(tmpdir(), 'historial-'));
    const folder = join(base, 'repositorio');
    const beside = join(base, 'descargas');
    mkdirSync(join(folder, 'dentro'), { recursive: true });
    mkdirSync(beside);
    symlinkSync(join(folder, 'dentro'), join(beside, 'enlace'));
    expect(isInside(folder, folder)).toBe(true);
    expect(isInside(folder, join(folder, 'dentro'))).toBe(true);
    expect(isInside(folder, join(beside, 'enlace'))).toBe(true);
    expect(isInside(folder, beside)).toBe(false);
    expect(isInside(join(folder, 'dentro'), folder)).toBe(false);
  });
});

describe('Importar’s rows', () => {
  it('gives a row per stay to everyone with a number or an email, and leaves the rest to resolve by hand', () => {
    const book = contactBook(readGoogleContacts(CONTACTS));
    const { rows, unresolved } = historyRows(participantsOf(parseChat(ANDROID_EN).events), book);
    expect(rows).toEqual([
      {
        name: 'Persona Fundadora',
        phone: '+34 600 00 00 60',
        email: '',
        province: 'Madrid',
        arrivedOn: '',
        joinedOn: '',
        leftOn: '',
        stage: 'Nuevo',
      },
      {
        name: 'Ana Ejemplo',
        phone: '+34 600 00 00 61',
        email: 'ana@ejemplo.test',
        province: 'Sevilla',
        arrivedOn: '2025-01-16',
        joinedOn: '2025-01-16',
        leftOn: '',
        stage: 'Nuevo',
      },
      {
        name: '',
        phone: '+34 600 00 00 51',
        email: '',
        province: '',
        arrivedOn: '2025-01-16',
        joinedOn: '2025-01-16',
        leftOn: '',
        stage: 'Nuevo',
      },
      {
        name: 'Bea Ejemplo',
        phone: '+34 600 00 00 62',
        email: '',
        province: '',
        arrivedOn: '2025-01-20',
        joinedOn: '2025-01-20',
        leftOn: '2025-02-14',
        stage: 'Nuevo',
      },
      {
        name: 'Bea Ejemplo',
        phone: '+34 600 00 00 62',
        email: '',
        province: '',
        arrivedOn: '2025-01-20',
        joinedOn: '2025-04-10',
        leftOn: '',
        stage: 'Nuevo',
      },
      {
        name: 'Persona Con Número',
        phone: '+34 600 00 00 52',
        email: 'numero@ejemplo.test',
        province: '',
        arrivedOn: '2025-01-20',
        joinedOn: '2025-01-20',
        leftOn: '',
        stage: 'Nuevo',
      },
      {
        name: 'Eva Ejemplo',
        phone: '+34 600 00 00 66',
        email: '',
        province: '',
        arrivedOn: '',
        joinedOn: '',
        leftOn: '',
        stage: 'Nuevo',
      },
      {
        name: '',
        phone: '+34 600 00 00 53',
        email: '',
        province: '',
        arrivedOn: '2025-08-02',
        joinedOn: '2025-08-02',
        leftOn: '',
        stage: 'Nuevo',
      },
    ]);
    expect(unresolved).toEqual([
      {
        who: 'Carla Ejemplo',
        reason: 'noPhoneOrEmail',
        firstJoined: '2025-01-20',
        lastLeft: '2025-03-01',
        stillIn: false,
      },
      {
        who: 'Dani Antiguo',
        reason: 'severalContacts',
        firstJoined: '',
        lastLeft: '',
        stillIn: true,
      },
      { who: 'Eva Ejemplo', reason: 'changedNumber', firstJoined: '', lastLeft: '', stillIn: true },
      {
        who: 'Gema Ejemplo',
        reason: 'notInContacts',
        firstJoined: '2025-08-01',
        lastLeft: '',
        stillIn: true,
      },
    ]);
    const nobody = historyRows(
      participantsOf([
        { kind: 'left', who: 'Nadie Conocido', day: '2025-01-01' },
        { kind: 'joined', who: '+34 1', day: '2025-01-01' },
        { kind: 'joined', who: '+34 000 000 000', day: '2025-01-01' },
      ]),
      book,
    );
    expect(nobody.rows).toEqual([]);
    expect(nobody.unresolved.map((one) => one.reason)).toEqual([
      'notInContacts',
      'notInContacts',
      'unreadableNumber',
    ]);
  });

  it('marks someone whose last stay has ended as Baja, on every row of theirs', () => {
    const book = contactBook(readGoogleContacts(CONTACTS));
    const { rows } = historyRows(
      [
        {
          who: 'Bea Ejemplo',
          changedNumber: false,
          stays: [
            { joined: null, left: '2025-01-01' },
            { joined: '2025-02-01', left: '2025-03-01' },
          ],
        },
      ],
      book,
    );
    expect(rows.map((row) => [row.joinedOn, row.leftOn, row.stage, row.arrivedOn])).toEqual([
      ['', '2025-01-01', 'Baja', ''],
      ['2025-02-01', '2025-03-01', 'Baja', ''],
    ]);
  });

  it('writes files a spreadsheet in Spanish opens, with the headers Importar maps by itself', () => {
    const file = importCsv([
      {
        name: 'Ana "la" Ejemplo',
        phone: '+34 600 00 00 61',
        email: '',
        province: 'Sevilla',
        arrivedOn: '2025-01-16',
        joinedOn: '2025-01-16',
        leftOn: '',
        stage: 'Nuevo',
      },
    ]);
    expect(file).toBe(
      '\ufeff"Nombre";"Teléfono";"Correo";"Provincia";"Llegó el";"Llegó por";"Entró el";"Salió el";"Estado"\n' +
        '"Ana ""la"" Ejemplo";"+34 600 00 00 61";"";"Sevilla";"2025-01-16";"WhatsApp";"2025-01-16";"";"Nuevo"\n',
    );
    expect(
      unresolvedCsv([
        {
          who: 'Nadie',
          reason: 'notInContacts',
          firstJoined: '',
          lastLeft: '2025-01-01',
          stillIn: false,
        },
      ]),
    ).toContain('"Nadie";"No está en tus contactos con ese nombre";"";"2025-01-01";"No"');
  });

  it('takes a person’s name and province out of how they are saved', () => {
    expect(personName('Persona Fundadora [Madrid] (PauseAI ES) ⏸️')).toBe('Persona Fundadora');
    expect(personName('María-José O’Ejemplo Jr.')).toBe('María-José O’Ejemplo Jr.');
    expect(personName('🙂')).toBe('');
    expect(provinceIn('Ana Ejemplo [ Gran Canaria ]')).toBe('Gran Canaria');
    expect(provinceIn('Ana Ejemplo')).toBe('');
  });
});
