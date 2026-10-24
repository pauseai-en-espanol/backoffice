import { describe, expect, it } from 'vitest';

import {
  COUNTRY_CODES,
  COUNTRY_GROUPS,
  countryMatches,
  countryName,
  LATIN_AMERICA,
  normalizeCountry,
  placeLine,
  regionMatches,
  regionsOf,
  SPANISH_PROVINCES,
  spanishProvince,
} from './places.js';

describe('countries (PLAN R74)', () => {
  it('are every ISO 3166-1 code, each with a Spanish name', () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    expect(COUNTRY_CODES.filter((code) => countryName(code) === code)).toEqual([]);
    expect(countryName('DE')).toBe('Alemania');
    expect(countryName('US')).toBe('Estados Unidos');
  });

  it('are offered Spain first, then Latin America, then the rest, each group once', () => {
    expect(COUNTRY_GROUPS.map((group) => group.group)).toEqual(['spain', 'latinAmerica', 'world']);
    expect(COUNTRY_GROUPS[0]?.codes).toEqual(['ES']);
    expect(COUNTRY_GROUPS[1]?.codes[0]).toBe('AR');
    expect([...(COUNTRY_GROUPS[1]?.codes ?? [])].sort()).toEqual([...LATIN_AMERICA].sort());
    expect(COUNTRY_GROUPS.flatMap((group) => group.codes).sort()).toEqual(
      [...COUNTRY_CODES].sort(),
    );
  });

  it('are read from a code, or a name in Spanish or English, however written', () => {
    expect(normalizeCountry('es')).toBe('ES');
    expect(normalizeCountry('España')).toBe('ES');
    expect(normalizeCountry(' espana ')).toBe('ES');
    expect(normalizeCountry('Spain')).toBe('ES');
    expect(normalizeCountry('Mexico')).toBe('MX');
    expect(normalizeCountry('EE. UU.')).toBe('US');
    expect(normalizeCountry('Germany')).toBe('DE');
    expect(normalizeCountry('Narnia')).toBeUndefined();
    expect(normalizeCountry('XX')).toBeUndefined();
    expect(normalizeCountry('')).toBeUndefined();
  });

  it('are found as they are typed, by part of any of their names', () => {
    expect(countryMatches('DE', 'alem')).toBe(true);
    expect(countryMatches('DE', 'Germ')).toBe(true);
    expect(countryMatches('US', 'EEUU')).toBe(true);
    expect(countryMatches('US', 'EE. UU.')).toBe(true);
    expect(countryMatches('MX', 'méx')).toBe(true);
    expect(countryMatches('MX', 'alem')).toBe(false);
    expect(countryMatches('MX', '')).toBe(true);
  });
});

describe('Spain’s provinces (PLAN R74)', () => {
  it('are the 50 provinces, and Ceuta and Melilla', () => {
    expect(SPANISH_PROVINCES).toHaveLength(52);
    expect(new Set(SPANISH_PROVINCES).size).toBe(52);
  });

  it('are read as people write them: in either language, without accents, by community or main island', () => {
    expect(spanishProvince('madrid')).toBe('Madrid');
    expect(spanishProvince('Comunidad de Madrid')).toBe('Madrid');
    expect(spanishProvince('Vizcaya')).toBe('Bizkaia');
    expect(spanishProvince('provincia de Lérida')).toBe('Lleida');
    expect(spanishProvince('Valencia')).toBe('Valencia/València');
    expect(spanishProvince('alacant')).toBe('Alicante/Alacant');
    expect(spanishProvince('Tenerife')).toBe('Santa Cruz de Tenerife');
    expect(spanishProvince('Cordoba')).toBe('Córdoba');
    expect(spanishProvince('Berlín')).toBeUndefined();
  });

  it('are found as they are typed, by part of any of their names', () => {
    expect(regionMatches('ES', 'Bizkaia', 'vizc')).toBe(true);
    expect(regionMatches('ES', 'Bizkaia', 'bizk')).toBe(true);
    expect(regionMatches('ES', 'Lleida', 'lérid')).toBe(true);
    expect(regionMatches('ES', 'Alicante/Alacant', 'alacant')).toBe(true);
    expect(regionMatches('ES', 'Sevilla', 'vizc')).toBe(false);
    // While the country isn't said, they're Spain's.
    expect(regionMatches(null, 'Bizkaia', 'vizc')).toBe(true);
    expect(regionMatches('', 'Bizkaia', 'vizc')).toBe(true);
  });

  it('are what’s offered while the country is Spain or not said', () => {
    expect(regionsOf('ES')).toBe(SPANISH_PROVINCES);
    expect(regionsOf(null)).toBe(SPANISH_PROVINCES);
    expect(regionsOf('')).toBe(SPANISH_PROVINCES);
  });
});

describe('other countries’ regions (PLAN R83)', () => {
  it('are each of Latin America’s, and the United States’, once and by name', () => {
    expect(regionsOf('MX')).toHaveLength(32);
    expect(regionsOf('AR')).toHaveLength(24);
    expect(regionsOf('CO')).toHaveLength(33);
    expect(regionsOf('BR')).toHaveLength(27);
    expect(regionsOf('CL')).toHaveLength(16);
    expect(regionsOf('US')).toHaveLength(51);
    for (const country of [...LATIN_AMERICA.filter((code) => code !== 'PR'), 'US']) {
      const regions = regionsOf(country);
      expect(regions.length, country).toBeGreaterThan(5);
      expect(new Set(regions).size, country).toBe(regions.length);
      expect(
        [...regions].sort((a, b) => a.localeCompare(b, 'es')),
        country,
      ).toEqual(regions);
    }
  });

  it('are none where nobody is listed: there a region is written as it’s said', () => {
    expect(regionsOf('DE')).toEqual([]);
    expect(regionsOf('PR')).toEqual([]);
  });

  it('are found as they are typed, by any part of any of their names, in their own country only', () => {
    expect(regionMatches('MX', 'Ciudad de México', 'cdmx')).toBe(true);
    expect(regionMatches('MX', 'Ciudad de México', 'ciudad de mex')).toBe(true);
    expect(regionMatches('MX', 'Jalisco', 'cdmx')).toBe(false);
    expect(regionMatches('AR', 'Ciudad Autónoma de Buenos Aires', 'CABA')).toBe(true);
    expect(regionMatches('AR', 'Córdoba', 'cordob')).toBe(true);
    expect(regionMatches('BR', 'São Paulo', 'sao pau')).toBe(true);
    expect(regionMatches('BR', 'São Paulo', 'san pablo')).toBe(true);
    expect(regionMatches('US', 'New York', 'Nueva York')).toBe(true);
    expect(regionMatches('US', 'North Carolina', 'carolina del n')).toBe(true);
    expect(regionMatches('CL', "O'Higgins", 'ohig')).toBe(true);
    expect(regionMatches('PE', 'Cusco', 'Cuzco')).toBe(true);
    expect(regionMatches('ES', 'Ciudad de México', 'cdmx')).toBe(false);
    expect(regionMatches('DE', 'Baviera', 'bav')).toBe(false);
  });
});

describe('a place as a line (PLAN R74)', () => {
  it('says the town and the province, and the country when it isn’t Spain', () => {
    expect(placeLine({ town: 'Getafe', province: 'Madrid', country: 'ES' })).toBe('Getafe, Madrid');
    expect(placeLine({ province: 'Madrid' })).toBe('Madrid');
    expect(placeLine({ town: 'Berlín', country: 'DE' })).toBe('Berlín, Alemania');
    expect(placeLine({ town: 'Madrid', province: 'Madrid', country: 'ES' })).toBe('Madrid');
    expect(placeLine({ country: 'MX' })).toBe('México');
    expect(placeLine({ country: 'ES' })).toBe('España');
    expect(placeLine({ town: ' ', province: null, country: null })).toBeUndefined();
  });
});
