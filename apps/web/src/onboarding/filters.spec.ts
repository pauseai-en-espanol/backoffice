import { describe, expect, it } from 'vitest';

import {
  apiQuery,
  exportHref,
  filtersFromPage,
  hasFilters,
  NO_FILTERS,
  pageQuery,
} from './filters';

const OWNER = '0190f8c4-0000-7000-8000-000000000103';

describe('the people filters', () => {
  it('read the page address in Spanish', () => {
    expect(
      filtersFromPage({
        buscar: '  Ana ',
        etapa: ['new', 'contacting', 'no-es-etapa', 'new'],
        responsable: 'yo',
        atencion: '1',
        comunidad: 'si',
        fuente: 'airtable',
        provincia: 'Provincia de ejemplo',
      }),
    ).toEqual({
      q: 'Ana',
      stages: ['new', 'contacting'],
      owner: 'me',
      attention: true,
      inCommunity: 'yes',
      source: 'airtable',
      arrival: '',
      arrivedOn: '',
      reason: '',
      province: 'Provincia de ejemplo',
    });
  });

  it('leave out what the address cannot mean', () => {
    expect(
      filtersFromPage({ responsable: 'Pepe', comunidad: 'quizá', fuente: 'fax', atencion: 'si' }),
    ).toEqual(NO_FILTERS);
    expect(filtersFromPage({ responsable: OWNER }).owner).toBe(OWNER);
    expect(filtersFromPage({ responsable: 'nadie' }).owner).toBe('none');
  });

  it('round-trip through the page address', () => {
    const filters = {
      ...NO_FILTERS,
      q: 'García',
      stages: ['contacting' as const],
      owner: 'none',
      inCommunity: 'no' as const,
      arrival: 'none',
      arrivedOn: 'unknown' as const,
      reason: 'unassigned' as const,
    };
    const params = Object.fromEntries(new URLSearchParams(pageQuery(filters)));
    expect(filtersFromPage(params)).toEqual(filters);
    expect(pageQuery(NO_FILTERS)).toBe('');
  });

  it('spell “Llegó por”, “Llegó el” and a reason in Spanish, and ignore what they can’t mean (PLAN M5)', () => {
    const channel = '0190f8c4-0000-7000-8000-0000000000aa';
    expect(
      pageQuery({ ...NO_FILTERS, arrival: channel, arrivedOn: 'known', reason: 'follow_up' }),
    ).toBe(`?llegada=${channel}&fecha=sabida&motivo=toca-seguimiento`);
    expect(
      filtersFromPage({ llegada: 'ninguna', fecha: 'no-se-sabe', motivo: 'sin-asignar' }),
    ).toEqual({
      ...NO_FILTERS,
      arrival: 'none',
      arrivedOn: 'unknown',
      reason: 'unassigned',
    });
    expect(filtersFromPage({ llegada: 'whatsapp', fecha: 'ayer', motivo: 'unassigned' })).toEqual(
      NO_FILTERS,
    );
    expect(
      apiQuery({ ...NO_FILTERS, arrival: 'none', arrivedOn: 'unknown', reason: 'unassigned' }),
    ).toBe('?arrival=none&arrivedOn=unknown&reason=unassigned');
  });

  it('become the API query', () => {
    expect(
      apiQuery(
        {
          ...NO_FILTERS,
          q: '+34 612',
          stages: ['new', 'active'],
          owner: 'me',
          attention: true,
          inCommunity: 'yes',
          source: 'csv',
          province: 'Madrid',
        },
        { cursor: 'c1', limit: 50 },
      ),
    ).toBe(
      '?q=%2B34+612&stage=new&stage=active&owner=me&attention=1&inCommunity=true&source=csv&province=Madrid&limit=50&cursor=c1',
    );
    expect(apiQuery(NO_FILTERS)).toBe('');
  });

  it('give the export the same filters', () => {
    expect(exportHref({ ...NO_FILTERS, owner: 'none' })).toBe('/api/export/people.csv?owner=none');
  });

  it('say whether anything is filtered', () => {
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(hasFilters({ ...NO_FILTERS, attention: true })).toBe(true);
  });
});
