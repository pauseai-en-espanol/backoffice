import { describe, expect, it } from 'vitest';

import { suggestMapping, usedMapping } from './csv-mapping';

describe('suggestMapping', () => {
  it('guesses the usual Spanish and English headers', () => {
    expect(
      suggestMapping(['Nombre', 'Teléfono', 'Email', 'Provincia', 'Localidad', 'Notas', 'Estado']),
    ).toEqual({
      Nombre: 'name',
      Teléfono: 'phone',
      Email: 'email',
      Provincia: 'province',
      Localidad: 'town',
      Notas: 'note',
      Estado: 'stage',
    });
    expect(suggestMapping(['Full name', 'E-mail', 'Phone', 'City'])).toEqual({
      'Full name': 'name',
      'E-mail': 'email',
      Phone: 'phone',
      City: 'town',
    });
  });

  it('reads a field from a word in a longer header', () => {
    expect(
      suggestMapping(['Nombre y apellidos', 'Correo electrónico de contacto', 'Teléfono móvil']),
    ).toEqual({
      'Nombre y apellidos': 'name',
      'Correo electrónico de contacto': 'email',
      'Teléfono móvil': 'phone',
    });
  });

  it('gives each field one column, and ignores what it does not know', () => {
    expect(suggestMapping(['Email', 'Correo', 'Talla de camiseta', ''])).toEqual({
      Email: 'email',
      Correo: 'ignore',
      'Talla de camiseta': 'ignore',
      '': 'ignore',
    });
  });

  it('knows the columns that retrofill older members: Discord, “Llegó por”, “Llegó el” (PLAN M5)', () => {
    expect(suggestMapping(['Usuario de Discord', 'Llegó por', 'Fecha de alta'])).toEqual({
      'Usuario de Discord': 'discord',
      'Llegó por': 'arrival',
      'Fecha de alta': 'arrivedOn',
    });
  });

  it('knows the columns of a stay in the group: “Entró el” and “Salió el” (PLAN R56)', () => {
    expect(suggestMapping(['Teléfono', 'Entró el', 'Salió el', 'Fecha de baja'])).toEqual({
      Teléfono: 'phone',
      'Entró el': 'joinedOn',
      'Salió el': 'leftOn',
      'Fecha de baja': 'ignore',
    });
    expect(
      suggestMapping(['Fecha de alta', 'Canal de alta', 'Entrada al grupo', 'Salida del grupo']),
    ).toEqual({
      'Fecha de alta': 'arrivedOn',
      'Canal de alta': 'arrival',
      'Entrada al grupo': 'joinedOn',
      'Salida del grupo': 'leftOn',
    });
    expect(suggestMapping(['Fecha de entrada', 'Salió el (día)'])).toEqual({
      'Fecha de entrada': 'joinedOn',
      'Salió el (día)': 'leftOn',
    });
  });
});

describe('usedMapping', () => {
  it('keeps only the columns that are used', () => {
    expect(usedMapping({ Nombre: 'name', Fecha: 'ignore', Tel: 'phone' })).toEqual({
      Nombre: 'name',
      Tel: 'phone',
    });
  });
});
