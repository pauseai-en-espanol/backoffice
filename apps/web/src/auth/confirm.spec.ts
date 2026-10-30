import { describe, expect, it } from 'vitest';

import { confirmPath, riskyDownload, safeNext } from './confirm';

describe('confirming it’s you again', () => {
  it('comes back only to a page of this app', () => {
    expect(safeNext('/equipo')).toBe('/equipo');
    expect(safeNext('/contactos?derechos=ana#derechos')).toBe('/contactos?derechos=ana#derechos');
    for (const elsewhere of [
      '//ejemplo.test',
      '/\\ejemplo.test',
      'https://ejemplo.test',
      'equipo',
      '',
      undefined,
    ]) {
      expect(safeNext(elsewhere)).toBe('/');
    }
  });

  it('carries where to come back to in its address', () => {
    expect(confirmPath('/registro')).toBe('/confirmar?next=%2Fregistro');
    expect(confirmPath('//ejemplo.test')).toBe('/confirmar?next=%2F');
  });
});

describe('riskyDownload', () => {
  it('downloads straight away only with a recent second factor, else asks to confirm first', () => {
    expect(riskyDownload(true, '/api/export/people.csv', '/personas')).toEqual({
      href: '/api/export/people.csv',
      download: true,
    });
    expect(riskyDownload(false, '/api/export/people.csv', '/personas')).toEqual({
      href: '/confirmar?next=%2Fpersonas',
    });
  });
});
