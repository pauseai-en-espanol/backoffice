import { describe, expect, it } from 'vitest';

import { looksLikeArrival, parseArrival, parseCommand } from './bot-message.js';

describe('parseCommand', () => {
  it('reads our commands, with or without the bot name and arguments', () => {
    expect(parseCommand('/alta')).toEqual({ command: 'alta', args: '' });
    expect(parseCommand('/ALTA@EjemploBot  Ana García 612 345 678 ')).toEqual({
      command: 'alta',
      args: 'Ana García 612 345 678',
    });
    expect(parseCommand('/buscar\nGarcía')).toEqual({ command: 'buscar', args: 'García' });
    expect(parseCommand('/start abc123')).toEqual({ command: 'start', args: 'abc123' });
  });

  it('ignores what is not one of ours', () => {
    expect(parseCommand('/borrar todo')).toBeUndefined();
    expect(parseCommand('alta Ana')).toBeUndefined();
    expect(parseCommand('')).toBeUndefined();
  });
});

describe('parseArrival', () => {
  it('reads a one-line report: name, phone, and the rest as a note', () => {
    expect(parseArrival('Ana García López 612 345 678, entró por el grupo de Madrid')).toEqual({
      name: 'Ana García López',
      phones: ['+34612345678'],
      emails: [],
      note: 'entró por el grupo de Madrid',
      hadContactDetails: true,
    });
  });

  it('reads a report over several lines, with labels', () => {
    expect(
      parseArrival(
        'Joan Martí\n+34 699 11 22 33\njoan.marti@ejemplo.test\nchat: Barcelona\nnota: vino a la charla',
      ),
    ).toEqual({
      name: 'Joan Martí',
      phones: ['+34699112233'],
      emails: ['joan.marti@ejemplo.test'],
      chat: 'Barcelona',
      note: 'vino a la charla',
      hadContactDetails: true,
    });
  });

  it('keeps numbers that are no phone in the note, and finds no name in a sentence', () => {
    expect(
      parseArrival('ha entrado alguien nuevo con el 1234 y no sé más, 0034 612-345-678'),
    ).toEqual({
      phones: ['+34612345678'],
      emails: [],
      note: 'ha entrado alguien nuevo con el 1234 y no sé más',
      hadContactDetails: true,
    });
  });

  it('reads a name alone, and repeats only once', () => {
    expect(parseArrival('María-José Núñez\n612345678\n612 345 678')).toEqual({
      name: 'María-José Núñez',
      phones: ['+34612345678'],
      emails: [],
      hadContactDetails: true,
    });
    expect(parseArrival('Lucía')).toEqual({
      name: 'Lucía',
      phones: [],
      emails: [],
      hadContactDetails: false,
    });
  });
});

describe('looksLikeArrival', () => {
  it('is a message with a phone number or an email', () => {
    expect(looksLikeArrival('Nueva: Ana 612345678')).toBe(true);
    expect(looksLikeArrival('ana@ejemplo.test')).toBe(true);
    expect(looksLikeArrival('hola, ¿qué tal?')).toBe(false);
    expect(looksLikeArrival('quedamos el 15/10 a las 18:00')).toBe(false);
  });
});
