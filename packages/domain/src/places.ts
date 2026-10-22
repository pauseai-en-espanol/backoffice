/**
 * Where someone lives, and where they're from (PLAN R74): a country, as its ISO 3166-1 code, and a province or region in
 * it, with Spain's 52 provinces by name. The community is Spain's, Spaniards abroad, Latin America's and Latin Americans
 * abroad: those countries come first wherever one is chosen. Names are Spanish, from the platform (`Intl`), never
 * stored: the database keeps the code (migration people_places).
 */

/** Every ISO 3166-1 alpha-2 country code. */
export const COUNTRY_CODES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA ' +
  'CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA ' +
  'GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS ' +
  'MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS ' +
  'RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW ' +
  'TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

export const SPAIN = 'ES';

/** Latin America, offered right after Spain. */
export const LATIN_AMERICA: readonly string[] = [
  'AR',
  'BO',
  'BR',
  'CL',
  'CO',
  'CR',
  'CU',
  'DO',
  'EC',
  'GT',
  'HN',
  'MX',
  'NI',
  'PA',
  'PE',
  'PR',
  'PY',
  'SV',
  'UY',
  'VE',
];

const names = new Intl.DisplayNames(['es'], { type: 'region' });
const englishNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** A country's name in Spanish ("Alemania"); the code itself if the platform has none. */
export const countryName = (code: string): string => names.of(code) ?? code;

const byName = (a: string, b: string) => countryName(a).localeCompare(countryName(b), 'es');

/** The countries as offered: Spain, then Latin America, then the rest of the world, each group by name. */
export const COUNTRY_GROUPS: readonly {
  group: 'spain' | 'latinAmerica' | 'world';
  codes: readonly string[];
}[] = [
  { group: 'spain', codes: [SPAIN] },
  { group: 'latinAmerica', codes: [...LATIN_AMERICA].sort(byName) },
  {
    group: 'world',
    codes: COUNTRY_CODES.filter((code) => code !== SPAIN && !LATIN_AMERICA.includes(code)).sort(
      byName,
    ),
  },
];

/** Lowercase, without accents or punctuation, for comparing what people write. */
const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Ways of writing a country that aren't its name in Spanish or English. */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  eeuu: 'US',
  'ee uu': 'US',
  usa: 'US',
  uk: 'GB',
  inglaterra: 'GB',
  escocia: 'GB',
  gales: 'GB',
  holanda: 'NL',
};

const COUNTRY_BY_NAME: ReadonlyMap<string, string> = new Map([
  ...Object.entries(COUNTRY_ALIASES),
  ...COUNTRY_CODES.flatMap((code): [string, string][] => [
    [fold(countryName(code)), code],
    [fold(englishNames.of(code) ?? code), code],
  ]),
]);

/** Every spelling a name map knows for each value, folded: its keys, by the value they stand for. */
const spellingsOf = (
  byName: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly string[]> => {
  const spellings = new Map<string, string[]>();
  for (const [name, value] of byName) {
    spellings.set(value, [...(spellings.get(value) ?? []), name]);
  }
  return spellings;
};

const COUNTRY_SPELLINGS = spellingsOf(COUNTRY_BY_NAME);

/**
 * Whether a country is one someone is typing, by any part of its name in Spanish or English or of another way of
 * writing it, accents and case aside ("alem", "Germ", "EEUU"): a picker's filter.
 */
export const countryMatches = (code: string, typed: string): boolean => {
  const query = fold(typed);
  return query === '' || (COUNTRY_SPELLINGS.get(code) ?? []).some((name) => name.includes(query));
};

/** A country as stored, its code, from a code or a name in Spanish or English ("España", "Spain", "es"). */
export const normalizeCountry = (raw: string): string | undefined => {
  const value = raw.trim();
  if (/^[A-Za-z]{2}$/u.test(value) && COUNTRY_CODES.includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  return value === '' ? undefined : COUNTRY_BY_NAME.get(fold(value));
};

/** Spain's provinces, and Ceuta and Melilla, by their official names. */
export const SPANISH_PROVINCES: readonly string[] = [
  'A Coruña',
  'Albacete',
  'Alicante/Alacant',
  'Almería',
  'Araba/Álava',
  'Asturias',
  'Ávila',
  'Badajoz',
  'Barcelona',
  'Bizkaia',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Cantabria',
  'Castellón/Castelló',
  'Ceuta',
  'Ciudad Real',
  'Córdoba',
  'Cuenca',
  'Gipuzkoa',
  'Girona',
  'Granada',
  'Guadalajara',
  'Huelva',
  'Huesca',
  'Illes Balears',
  'Jaén',
  'La Rioja',
  'Las Palmas',
  'León',
  'Lleida',
  'Lugo',
  'Madrid',
  'Málaga',
  'Melilla',
  'Murcia',
  'Navarra',
  'Ourense',
  'Palencia',
  'Pontevedra',
  'Salamanca',
  'Santa Cruz de Tenerife',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia/València',
  'Valladolid',
  'Zamora',
  'Zaragoza',
];

/** Other ways people write a province: in Spanish, in its other language, or by its community or main island. */
const PROVINCE_ALIASES: Readonly<Record<string, string>> = {
  coruna: 'A Coruña',
  'la coruna': 'A Coruña',
  alicante: 'Alicante/Alacant',
  alacant: 'Alicante/Alacant',
  alava: 'Araba/Álava',
  araba: 'Araba/Álava',
  'principado de asturias': 'Asturias',
  vizcaya: 'Bizkaia',
  castellon: 'Castellón/Castelló',
  castello: 'Castellón/Castelló',
  guipuzcoa: 'Gipuzkoa',
  gerona: 'Girona',
  baleares: 'Illes Balears',
  'islas baleares': 'Illes Balears',
  'illes balears': 'Illes Balears',
  balears: 'Illes Balears',
  mallorca: 'Illes Balears',
  rioja: 'La Rioja',
  'gran canaria': 'Las Palmas',
  lerida: 'Lleida',
  'comunidad de madrid': 'Madrid',
  'region de murcia': 'Murcia',
  nafarroa: 'Navarra',
  orense: 'Ourense',
  tenerife: 'Santa Cruz de Tenerife',
  valencia: 'Valencia/València',
};

const PROVINCE_BY_NAME: ReadonlyMap<string, string> = new Map([
  ...Object.entries(PROVINCE_ALIASES),
  ...SPANISH_PROVINCES.map((province): [string, string] => [fold(province), province]),
]);

const PROVINCE_SPELLINGS = spellingsOf(PROVINCE_BY_NAME);

/** Whether a province is one someone is typing, by any part of any of its names ("vizc", "lerid", "alacant"). */
export const provinceMatches = (province: string, typed: string): boolean => {
  const query = fold(typed);
  return (
    query === '' || (PROVINCE_SPELLINGS.get(province) ?? []).some((name) => name.includes(query))
  );
};

/** One of Spain's provinces, by its official name, from how someone wrote it ("Vizcaya", "provincia de Lérida"). */
export const spanishProvince = (raw: string): string | undefined =>
  PROVINCE_BY_NAME.get(fold(raw).replace(/^provincia de /u, ''));

/**
 * A place as a line ("Berlín, Alemania", "Getafe, Madrid"): the town and the province or region, and the country's
 * name, but Spain's when it goes without saying. Undefined when nothing is known.
 */
export const placeLine = (place: {
  town?: string | null | undefined;
  province?: string | null | undefined;
  country?: string | null | undefined;
}): string | undefined => {
  const parts = [place.town, place.province].map((part) => part?.trim()).filter(Boolean);
  const unique = parts.filter((part, index) => fold(part ?? '') !== fold(parts[index - 1] ?? ''));
  const country =
    place.country && (place.country !== SPAIN || unique.length === 0)
      ? countryName(place.country)
      : undefined;
  const line = [...unique, country].filter(Boolean).join(', ');
  return line === '' ? undefined : line;
};
