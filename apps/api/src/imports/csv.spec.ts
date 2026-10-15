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
      'Nombre,Teléfono,Email,Estado\nAna Ejemplo,612 345 678,ana@ejemplo.test,Activo\n,600000003,,\nBea,123,,\nCarla,,no-es-correo,\nDani,,,Raro\n',
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

  it('refuses an empty or unreadable file', () => {
    expect(() => parseCsv('')).toThrow(CsvError);
    expect(() => parseCsv('"sin cerrar\n')).toThrow(CsvError);
  });
});
