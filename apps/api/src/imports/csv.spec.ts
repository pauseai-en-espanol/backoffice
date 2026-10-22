import { describe, expect, it } from 'vitest';

import { CsvError, mapRows, parseCsv, suggestMapping } from './csv.js';

describe('CSV imports', () => {
  it('reads semicolons, a byte-order mark and quoted fields', () => {
    const parsed = parseCsv(
      '﻿Nombre;Teléfono;Correo\n"García, Ana";612 345 678;ANA@ejemplo.test\n\n',
    );
    expect(parsed).toEqual({
      columns: ['Nombre', 'Teléfono', 'Correo'],
      rows: [['García, Ana', '612 345 678', 'ANA@ejemplo.test']],
    });
  });

  it('suggests a mapping from Spanish and English headers', () => {
    expect(
      suggestMapping([
        'Nombre y apellidos',
        'Móvil',
        'E-mail',
        'Ciudad',
        'Provincia',
        'Observaciones',
        'Otra cosa',
      ]),
    ).toEqual({
      'Nombre y apellidos': 'name',
      Móvil: 'phone',
      'E-mail': 'email',
      Ciudad: 'town',
      Provincia: 'province',
      Observaciones: 'note',
    });
    expect(suggestMapping(['Full name', 'Email', 'Phone', 'City'])).toEqual({
      'Full name': 'name',
      Email: 'email',
      Phone: 'phone',
      City: 'town',
    });
  });

  it('maps rows, normalising contact details, and lists the ones it leaves out', () => {
    const parsed = parseCsv(
      'Nombre,Teléfono,Email,Estado\nAna Ejemplo,612 345 678,ana@ejemplo.test,Activo\n,,,Nuevo\nBea,123,,\nCarla,,no-es-correo,\nDani,,,Raro\n',
    );
    const mapped = mapRows(parsed, {
      Nombre: 'name',
      Teléfono: 'phone',
      Email: 'email',
      Estado: 'stage',
    });
    expect(mapped.rows).toEqual([
      {
        payload: {
          name: 'Ana Ejemplo',
          emails: ['ana@ejemplo.test'],
          phones: ['+34612345678'],
          stage: 'active',
        },
      },
    ]);
    expect(mapped.invalid).toEqual([
      { row: 3, field: 'name' },
      { row: 4, field: 'phone' },
      { row: 5, field: 'email' },
      { row: 6, field: 'stage' },
    ]);
  });

  it('reads where someone lives and where they are from, a country by its name or code (PLAN R74)', () => {
    expect(suggestMapping(['País', 'País de origen', 'De dónde es'])).toEqual({
      País: 'country',
      'País de origen': 'originCountry',
      'De dónde es': 'originProvince',
    });
    const parsed = parseCsv(
      [
        'Nombre;Ciudad;País;País de origen;De dónde es',
        'Ana;Berlín;Alemania;España;Madrid',
        'Bea;;Narnia;;',
      ].join('\n'),
    );
    const mapped = mapRows(parsed, {
      Nombre: 'name',
      Ciudad: 'town',
      País: 'country',
      'País de origen': 'originCountry',
      'De dónde es': 'originProvince',
    });
    expect(mapped.rows).toEqual([
      {
        payload: {
          name: 'Ana',
          town: 'Berlín',
          country: 'DE',
          origin_country: 'ES',
          origin_province: 'Madrid',
        },
      },
    ]);
    expect(mapped.invalid).toEqual([{ row: 3, field: 'country' }]);
  });

  it('retrofills older members: when they arrived (empty: nobody knows), where from, Discord, and the old “Por clasificar” as new (PLAN M5)', () => {
    expect(suggestMapping(['Llegó el', 'Llegó por', 'Discord'])).toEqual({
      'Llegó el': 'arrivedOn',
      'Llegó por': 'arrival',
      Discord: 'discord',
    });
    const parsed = parseCsv(
      [
        'Nombre;Llegó el;Llegó por;Discord;Etapa',
        'Ana;03/02/2025;WhatsApp;@Ana_Ejemplo;Activo',
        'Bea;2024-12-31;;;Por clasificar',
        'Carla;;Discord;carla.ejemplo;',
        'Dani;31/02/2025;;;',
        'Eva;5.1.24;;;',
        'Fran;;;fran..mal;',
      ].join('\n'),
    );
    const mapped = mapRows(parsed, {
      Nombre: 'name',
      'Llegó el': 'arrivedOn',
      'Llegó por': 'arrival',
      Discord: 'discord',
      Etapa: 'stage',
    });
    expect(mapped.rows).toEqual([
      {
        payload: {
          name: 'Ana',
          discords: ['ana_ejemplo'],
          arrived_on: '2025-02-03',
          arrival: 'WhatsApp',
          stage: 'active',
        },
      },
      { payload: { name: 'Bea', arrived_on: '2024-12-31', stage: 'new' } },
      {
        payload: {
          name: 'Carla',
          discords: ['carla.ejemplo'],
          arrived_on: null,
          arrival: 'Discord',
        },
      },
      { payload: { name: 'Eva', arrived_on: '2024-01-05' } },
    ]);
    expect(mapped.invalid).toEqual([
      { row: 5, field: 'arrivedOn' },
      { row: 7, field: 'discord' },
    ]);
  });

  it('leaves the arrival day to the database when the file has no such column', () => {
    const mapped = mapRows(parseCsv('Nombre\nAna\n'), { Nombre: 'name' });
    expect(mapped.rows).toEqual([{ payload: { name: 'Ana' } }]);
  });

  it('brings in a stay in the group per row, Baja, and someone known only by a phone (PLAN R37, R56)', () => {
    expect(suggestMapping(['Teléfono', 'Entró el', 'Salió el', 'Estado'])).toEqual({
      Teléfono: 'phone',
      'Entró el': 'joinedOn',
      'Salió el': 'leftOn',
      Estado: 'stage',
    });
    const parsed = parseCsv(
      [
        'Nombre,Teléfono,Entró el,Salió el,Estado',
        'Ana Ejemplo,612 345 678,2025-03-01,2025-05-02,Nuevo',
        'Ana Ejemplo,612 345 678,2025-09-10,,Nuevo',
        ',600 000 003,,2025-06-01,Baja',
        'Bea,,2025-03-01,,',
        'Carla,,2025-03-01,2025-02-28,',
        'Dani,,,ayer,',
      ].join('\n'),
    );
    const mapped = mapRows(parsed, {
      Nombre: 'name',
      Teléfono: 'phone',
      'Entró el': 'joinedOn',
      'Salió el': 'leftOn',
      Estado: 'stage',
    });
    expect(mapped.rows).toEqual([
      {
        payload: {
          name: 'Ana Ejemplo',
          phones: ['+34612345678'],
          joined_on: '2025-03-01',
          left_on: '2025-05-02',
          stage: 'new',
        },
      },
      {
        payload: {
          name: 'Ana Ejemplo',
          phones: ['+34612345678'],
          joined_on: '2025-09-10',
          stage: 'new',
        },
      },
      {
        payload: {
          phones: ['+34600000003'],
          joined_on: null,
          left_on: '2025-06-01',
          stage: 'left',
        },
      },
      { payload: { name: 'Bea', joined_on: '2025-03-01' } },
    ]);
    expect(mapped.invalid).toEqual([
      { row: 6, field: 'leftOn' },
      { row: 7, field: 'leftOn' },
    ]);
  });

  it('knows the columns by their names since PLAN R58: "Fecha de alta", "Canal de alta", the group\'s in and out', () => {
    expect(
      suggestMapping(['Fecha de alta', 'Canal de alta', 'Entrada al grupo', 'Salida del grupo']),
    ).toEqual({
      'Fecha de alta': 'arrivedOn',
      'Canal de alta': 'arrival',
      'Entrada al grupo': 'joinedOn',
      'Salida del grupo': 'leftOn',
    });
  });

  it('refuses an empty or unreadable file', () => {
    expect(() => parseCsv('')).toThrow(CsvError);
    expect(() => parseCsv('"sin cerrar\n')).toThrow(CsvError);
  });
});
