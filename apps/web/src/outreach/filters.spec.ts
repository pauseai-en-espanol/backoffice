import { describe, expect, it } from 'vitest';

import {
  contactApiQuery,
  contactFiltersFromPage,
  contactPageQuery,
  foldedContactFilters,
  hasContactFilters,
  MAX_SKIPPED,
  nextApiQuery,
  nextFiltersFromPage,
  nextPageQuery,
  NO_CONTACT_FILTERS,
  organisationApiQuery,
  organisationFiltersFromPage,
} from './filters';

const ID = '0190a0b0-0000-7000-8000-000000000001';
const OTHER = '0190a0b0-0000-7000-8000-000000000002';

describe('the contact filters', () => {
  it('reads the Spanish address, dropping what it cannot mean', () => {
    expect(
      contactFiltersFromPage({
        buscar: ' sindicato ',
        nivel: 'A',
        territorio: 'Aragón',
        tipo: 'union',
        relacion: 'qualified',
        responsable: 'yo',
        revisar: 'si',
        pausa: 'no',
        quien: 'yo',
      }),
    ).toEqual({
      q: 'sindicato',
      tier: 'A',
      territory: 'Aragón',
      kind: 'union',
      stage: 'qualified',
      owner: 'me',
      review: 'yes',
      hold: 'no',
      visibility: 'private',
    });
    expect(
      contactFiltersFromPage({ nivel: 'C', tipo: 'club', relacion: 'friend', responsable: 'x' }),
    ).toEqual(NO_CONTACT_FILTERS);
  });

  it("writes the page's address and the API's query", () => {
    const filters = contactFiltersFromPage({ nivel: 'B', responsable: ID, revisar: 'no' });
    expect(contactPageQuery(filters)).toBe(`?nivel=B&responsable=${ID}&revisar=no`);
    expect(contactApiQuery(filters)).toBe(`?tier=B&owner=${ID}&review=false`);
    // "Quién lo ve" (PLAN M5, step 6): `quien=equipo` in the address, `visibility=team` for the API.
    expect(contactPageQuery({ ...NO_CONTACT_FILTERS, visibility: 'team' })).toBe('?quien=equipo');
    expect(contactApiQuery({ ...NO_CONTACT_FILTERS, visibility: 'team' })).toBe('?visibility=team');
    expect(contactApiQuery({ ...NO_CONTACT_FILTERS, owner: 'me', hold: 'yes' })).toBe(
      '?owner=me&hold=true',
    );
    expect(hasContactFilters(filters)).toBe(true);
    expect(hasContactFilters(NO_CONTACT_FILTERS)).toBe(false);
    expect(contactApiQuery(NO_CONTACT_FILTERS)).toBe('');
  });
});

describe('the organisation filters', () => {
  it('reads the address and writes the query', () => {
    const filters = organisationFiltersFromPage({ buscar: 'Ejemplo', tipo: 'media' });
    expect(organisationApiQuery(filters)).toBe('?q=Ejemplo&kind=media');
    expect(organisationApiQuery(organisationFiltersFromPage({ tipo: 'club' }))).toBe('');
  });
});

describe("Siguiente's address", () => {
  it('reads the campaign and the targets left for later', () => {
    expect(nextFiltersFromPage({ campana: ID, saltar: `${OTHER},nope,${OTHER}` })).toEqual({
      campaign: ID,
      skip: [OTHER],
    });
    expect(nextFiltersFromPage({ campana: 'todas' })).toEqual({ campaign: '', skip: [] });
  });

  it('keeps the address short, dropping the oldest left for later first', () => {
    const many = Array.from(
      { length: MAX_SKIPPED + 5 },
      (_, index) => `0190a0b0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    );
    const query = nextPageQuery({ campaign: '', skip: many });
    const kept = new URLSearchParams(query).get('saltar')?.split(',') ?? [];
    expect(kept).toHaveLength(MAX_SKIPPED);
    expect(kept[0]).toBe(many[5]);
  });

  it('asks the API for the campaign only', () => {
    expect(nextApiQuery({ campaign: ID, skip: [] })).toBe(`?campaign=${ID}`);
    expect(nextApiQuery({ campaign: '', skip: [] })).toBe('');
    expect(nextApiQuery({ campaign: '', skip: [ID, ID] })).toBe(`?skip=${ID}`);
  });
});

describe('Contactos folds its filters under "Más filtros" (PLAN R67)', () => {
  it('says how many of the folded ones are on, the search apart', () => {
    expect(foldedContactFilters(NO_CONTACT_FILTERS)).toBe(0);
    expect(foldedContactFilters({ ...NO_CONTACT_FILTERS, q: 'Ana' })).toBe(0);
    expect(
      foldedContactFilters({ ...NO_CONTACT_FILTERS, tier: 'A', hold: 'no', visibility: 'team' }),
    ).toBe(3);
  });
});
