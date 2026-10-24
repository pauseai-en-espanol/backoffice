/**
 * Where someone lives, and where they're from (PLAN R74): a country, as its ISO 3166-1 code, and a province or region in
 * it, with Spain's 52 provinces by name, and Latin America's and the United States' regions (PLAN R83). The community
 * is Spain's, Spaniards abroad, Latin America's and Latin Americans abroad: those countries come first wherever one is
 * chosen. Countries' names are Spanish, from the platform (`Intl`), never stored: the database keeps the code
 * (migration people_places).
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

/**
 * Other countries' regions, offered by name (PLAN R83): the first level of ISO 3166-2, as each is called there, for
 * Latin America, where the community is, and the United States, where much of it lives abroad. Puerto Rico has none
 * of its own. Anywhere else a region is written as it's said there. Each list is in alphabetical order, as offered.
 */
const REGIONS_ABROAD: Readonly<Record<string, readonly string[]>> = {
  AR: [
    'Buenos Aires',
    'Catamarca',
    'Chaco',
    'Chubut',
    'Ciudad Autónoma de Buenos Aires',
    'Córdoba',
    'Corrientes',
    'Entre Ríos',
    'Formosa',
    'Jujuy',
    'La Pampa',
    'La Rioja',
    'Mendoza',
    'Misiones',
    'Neuquén',
    'Río Negro',
    'Salta',
    'San Juan',
    'San Luis',
    'Santa Cruz',
    'Santa Fe',
    'Santiago del Estero',
    'Tierra del Fuego',
    'Tucumán',
  ],
  BO: [
    'Beni',
    'Chuquisaca',
    'Cochabamba',
    'La Paz',
    'Oruro',
    'Pando',
    'Potosí',
    'Santa Cruz',
    'Tarija',
  ],
  BR: [
    'Acre',
    'Alagoas',
    'Amapá',
    'Amazonas',
    'Bahia',
    'Ceará',
    'Distrito Federal',
    'Espírito Santo',
    'Goiás',
    'Maranhão',
    'Mato Grosso',
    'Mato Grosso do Sul',
    'Minas Gerais',
    'Pará',
    'Paraíba',
    'Paraná',
    'Pernambuco',
    'Piauí',
    'Rio de Janeiro',
    'Rio Grande do Norte',
    'Rio Grande do Sul',
    'Rondônia',
    'Roraima',
    'Santa Catarina',
    'São Paulo',
    'Sergipe',
    'Tocantins',
  ],
  CL: [
    'Antofagasta',
    'Arica y Parinacota',
    'Atacama',
    'Aysén',
    'Biobío',
    'Coquimbo',
    'La Araucanía',
    'Los Lagos',
    'Los Ríos',
    'Magallanes',
    'Maule',
    'Metropolitana de Santiago',
    'Ñuble',
    "O'Higgins",
    'Tarapacá',
    'Valparaíso',
  ],
  CO: [
    'Amazonas',
    'Antioquia',
    'Arauca',
    'Atlántico',
    'Bogotá',
    'Bolívar',
    'Boyacá',
    'Caldas',
    'Caquetá',
    'Casanare',
    'Cauca',
    'Cesar',
    'Chocó',
    'Córdoba',
    'Cundinamarca',
    'Guainía',
    'Guaviare',
    'Huila',
    'La Guajira',
    'Magdalena',
    'Meta',
    'Nariño',
    'Norte de Santander',
    'Putumayo',
    'Quindío',
    'Risaralda',
    'San Andrés y Providencia',
    'Santander',
    'Sucre',
    'Tolima',
    'Valle del Cauca',
    'Vaupés',
    'Vichada',
  ],
  CR: ['Alajuela', 'Cartago', 'Guanacaste', 'Heredia', 'Limón', 'Puntarenas', 'San José'],
  CU: [
    'Artemisa',
    'Camagüey',
    'Ciego de Ávila',
    'Cienfuegos',
    'Granma',
    'Guantánamo',
    'Holguín',
    'Isla de la Juventud',
    'La Habana',
    'Las Tunas',
    'Matanzas',
    'Mayabeque',
    'Pinar del Río',
    'Sancti Spíritus',
    'Santiago de Cuba',
    'Villa Clara',
  ],
  DO: [
    'Azua',
    'Bahoruco',
    'Barahona',
    'Dajabón',
    'Distrito Nacional',
    'Duarte',
    'El Seibo',
    'Elías Piña',
    'Espaillat',
    'Hato Mayor',
    'Hermanas Mirabal',
    'Independencia',
    'La Altagracia',
    'La Romana',
    'La Vega',
    'María Trinidad Sánchez',
    'Monseñor Nouel',
    'Monte Cristi',
    'Monte Plata',
    'Pedernales',
    'Peravia',
    'Puerto Plata',
    'Samaná',
    'San Cristóbal',
    'San José de Ocoa',
    'San Juan',
    'San Pedro de Macorís',
    'Sánchez Ramírez',
    'Santiago',
    'Santiago Rodríguez',
    'Santo Domingo',
    'Valverde',
  ],
  EC: [
    'Azuay',
    'Bolívar',
    'Cañar',
    'Carchi',
    'Chimborazo',
    'Cotopaxi',
    'El Oro',
    'Esmeraldas',
    'Galápagos',
    'Guayas',
    'Imbabura',
    'Loja',
    'Los Ríos',
    'Manabí',
    'Morona Santiago',
    'Napo',
    'Orellana',
    'Pastaza',
    'Pichincha',
    'Santa Elena',
    'Santo Domingo de los Tsáchilas',
    'Sucumbíos',
    'Tungurahua',
    'Zamora Chinchipe',
  ],
  GT: [
    'Alta Verapaz',
    'Baja Verapaz',
    'Chimaltenango',
    'Chiquimula',
    'El Progreso',
    'Escuintla',
    'Guatemala',
    'Huehuetenango',
    'Izabal',
    'Jalapa',
    'Jutiapa',
    'Petén',
    'Quetzaltenango',
    'Quiché',
    'Retalhuleu',
    'Sacatepéquez',
    'San Marcos',
    'Santa Rosa',
    'Sololá',
    'Suchitepéquez',
    'Totonicapán',
    'Zacapa',
  ],
  HN: [
    'Atlántida',
    'Choluteca',
    'Colón',
    'Comayagua',
    'Copán',
    'Cortés',
    'El Paraíso',
    'Francisco Morazán',
    'Gracias a Dios',
    'Intibucá',
    'Islas de la Bahía',
    'La Paz',
    'Lempira',
    'Ocotepeque',
    'Olancho',
    'Santa Bárbara',
    'Valle',
    'Yoro',
  ],
  MX: [
    'Aguascalientes',
    'Baja California',
    'Baja California Sur',
    'Campeche',
    'Chiapas',
    'Chihuahua',
    'Ciudad de México',
    'Coahuila',
    'Colima',
    'Durango',
    'Estado de México',
    'Guanajuato',
    'Guerrero',
    'Hidalgo',
    'Jalisco',
    'Michoacán',
    'Morelos',
    'Nayarit',
    'Nuevo León',
    'Oaxaca',
    'Puebla',
    'Querétaro',
    'Quintana Roo',
    'San Luis Potosí',
    'Sinaloa',
    'Sonora',
    'Tabasco',
    'Tamaulipas',
    'Tlaxcala',
    'Veracruz',
    'Yucatán',
    'Zacatecas',
  ],
  NI: [
    'Boaco',
    'Carazo',
    'Chinandega',
    'Chontales',
    'Costa Caribe Norte',
    'Costa Caribe Sur',
    'Estelí',
    'Granada',
    'Jinotega',
    'León',
    'Madriz',
    'Managua',
    'Masaya',
    'Matagalpa',
    'Nueva Segovia',
    'Río San Juan',
    'Rivas',
  ],
  PA: [
    'Bocas del Toro',
    'Chiriquí',
    'Coclé',
    'Colón',
    'Darién',
    'Emberá-Wounaan',
    'Guna Yala',
    'Herrera',
    'Los Santos',
    'Naso Tjër Di',
    'Ngäbe-Buglé',
    'Panamá',
    'Panamá Oeste',
    'Veraguas',
  ],
  PE: [
    'Amazonas',
    'Áncash',
    'Apurímac',
    'Arequipa',
    'Ayacucho',
    'Cajamarca',
    'Callao',
    'Cusco',
    'Huancavelica',
    'Huánuco',
    'Ica',
    'Junín',
    'La Libertad',
    'Lambayeque',
    'Lima',
    'Loreto',
    'Madre de Dios',
    'Moquegua',
    'Pasco',
    'Piura',
    'Puno',
    'San Martín',
    'Tacna',
    'Tumbes',
    'Ucayali',
  ],
  PY: [
    'Alto Paraguay',
    'Alto Paraná',
    'Amambay',
    'Asunción',
    'Boquerón',
    'Caaguazú',
    'Caazapá',
    'Canindeyú',
    'Central',
    'Concepción',
    'Cordillera',
    'Guairá',
    'Itapúa',
    'Misiones',
    'Ñeembucú',
    'Paraguarí',
    'Presidente Hayes',
    'San Pedro',
  ],
  SV: [
    'Ahuachapán',
    'Cabañas',
    'Chalatenango',
    'Cuscatlán',
    'La Libertad',
    'La Paz',
    'La Unión',
    'Morazán',
    'San Miguel',
    'San Salvador',
    'San Vicente',
    'Santa Ana',
    'Sonsonate',
    'Usulután',
  ],
  US: [
    'Alabama',
    'Alaska',
    'Arizona',
    'Arkansas',
    'California',
    'Colorado',
    'Connecticut',
    'Delaware',
    'District of Columbia',
    'Florida',
    'Georgia',
    'Hawaii',
    'Idaho',
    'Illinois',
    'Indiana',
    'Iowa',
    'Kansas',
    'Kentucky',
    'Louisiana',
    'Maine',
    'Maryland',
    'Massachusetts',
    'Michigan',
    'Minnesota',
    'Mississippi',
    'Missouri',
    'Montana',
    'Nebraska',
    'Nevada',
    'New Hampshire',
    'New Jersey',
    'New Mexico',
    'New York',
    'North Carolina',
    'North Dakota',
    'Ohio',
    'Oklahoma',
    'Oregon',
    'Pennsylvania',
    'Rhode Island',
    'South Carolina',
    'South Dakota',
    'Tennessee',
    'Texas',
    'Utah',
    'Vermont',
    'Virginia',
    'Washington',
    'West Virginia',
    'Wisconsin',
    'Wyoming',
  ],
  UY: [
    'Artigas',
    'Canelones',
    'Cerro Largo',
    'Colonia',
    'Durazno',
    'Flores',
    'Florida',
    'Lavalleja',
    'Maldonado',
    'Montevideo',
    'Paysandú',
    'Río Negro',
    'Rivera',
    'Rocha',
    'Salto',
    'San José',
    'Soriano',
    'Tacuarembó',
    'Treinta y Tres',
  ],
  VE: [
    'Amazonas',
    'Anzoátegui',
    'Apure',
    'Aragua',
    'Barinas',
    'Bolívar',
    'Carabobo',
    'Cojedes',
    'Delta Amacuro',
    'Dependencias Federales',
    'Distrito Capital',
    'Falcón',
    'Guárico',
    'La Guaira',
    'Lara',
    'Mérida',
    'Miranda',
    'Monagas',
    'Nueva Esparta',
    'Portuguesa',
    'Sucre',
    'Táchira',
    'Trujillo',
    'Yaracuy',
    'Zulia',
  ],
};

/** Other ways people write some of them, that aren't part of their name: in Spanish, short, or as they were called. */
const REGION_ALIASES_ABROAD: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  AR: {
    caba: 'Ciudad Autónoma de Buenos Aires',
    'capital federal': 'Ciudad Autónoma de Buenos Aires',
    'ciudad de buenos aires': 'Ciudad Autónoma de Buenos Aires',
  },
  BR: {
    'san pablo': 'São Paulo',
    brasilia: 'Distrito Federal',
    'rio grande del norte': 'Rio Grande do Norte',
    'rio grande del sur': 'Rio Grande do Sul',
    'mato grosso del sur': 'Mato Grosso do Sul',
  },
  CL: {
    santiago: 'Metropolitana de Santiago',
    'region metropolitana': 'Metropolitana de Santiago',
    rm: 'Metropolitana de Santiago',
    'bio bio': 'Biobío',
    ohiggins: "O'Higgins",
    'libertador general bernardo o higgins': "O'Higgins",
    'aysen del general carlos ibanez del campo': 'Aysén',
    'magallanes y de la antartica chilena': 'Magallanes',
  },
  CO: { 'distrito capital': 'Bogotá', 'bogota d c': 'Bogotá' },
  DO: {
    montecristi: 'Monte Cristi',
    baoruco: 'Bahoruco',
    'el seybo': 'El Seibo',
    salcedo: 'Hermanas Mirabal',
  },
  GT: { 'el quiche': 'Quiché', xela: 'Quetzaltenango' },
  MX: {
    cdmx: 'Ciudad de México',
    df: 'Ciudad de México',
    'distrito federal': 'Ciudad de México',
    edomex: 'Estado de México',
    'coahuila de zaragoza': 'Coahuila',
    'michoacan de ocampo': 'Michoacán',
    'veracruz de ignacio de la llave': 'Veracruz',
  },
  NI: {
    raan: 'Costa Caribe Norte',
    raccn: 'Costa Caribe Norte',
    'region autonoma de la costa caribe norte': 'Costa Caribe Norte',
    'atlantico norte': 'Costa Caribe Norte',
    raas: 'Costa Caribe Sur',
    raccs: 'Costa Caribe Sur',
    'region autonoma de la costa caribe sur': 'Costa Caribe Sur',
    'atlantico sur': 'Costa Caribe Sur',
  },
  PA: { 'kuna yala': 'Guna Yala', 'san blas': 'Guna Yala', 'ngobe bugle': 'Ngäbe-Buglé' },
  PE: { cuzco: 'Cusco', 'lima metropolitana': 'Lima' },
  US: {
    'carolina del norte': 'North Carolina',
    'carolina del sur': 'South Carolina',
    'dakota del norte': 'North Dakota',
    'dakota del sur': 'South Dakota',
    'distrito de columbia': 'District of Columbia',
    'washington dc': 'District of Columbia',
    luisiana: 'Louisiana',
    misisipi: 'Mississippi',
    misuri: 'Missouri',
    'nueva jersey': 'New Jersey',
    'nueva york': 'New York',
    'nuevo hampshire': 'New Hampshire',
    'nuevo mexico': 'New Mexico',
    pensilvania: 'Pennsylvania',
    tejas: 'Texas',
    'virginia occidental': 'West Virginia',
  },
  VE: { vargas: 'La Guaira', caracas: 'Distrito Capital', margarita: 'Nueva Esparta' },
};

/**
 * The regions offered for a country (PLAN R83), in alphabetical order: Spain's provinces while it's Spain or not said,
 * else its own, if any.
 */
export const regionsOf = (country: string | null | undefined): readonly string[] =>
  !country || country === SPAIN ? SPANISH_PROVINCES : (REGIONS_ABROAD[country] ?? []);

/** Every spelling of each country's regions, folded, by the region they stand for. */
const REGION_SPELLINGS: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>> = new Map([
  [SPAIN, PROVINCE_SPELLINGS],
  ...Object.entries(REGIONS_ABROAD).map(
    ([country, regions]): [string, ReadonlyMap<string, readonly string[]>] => [
      country,
      spellingsOf(
        new Map([
          ...Object.entries(REGION_ALIASES_ABROAD[country] ?? {}),
          ...regions.map((region): [string, string] => [fold(region), region]),
        ]),
      ),
    ],
  ),
]);

/**
 * Whether one of a country's regions (Spain's, while it's not said) is one someone is typing, by any part of any of its
 * names, accents aside: "vizc" finds Bizkaia, "lérid" Lleida, "cdmx" Ciudad de México, "nueva york" New York.
 */
export const regionMatches = (
  country: string | null | undefined,
  region: string,
  typed: string,
): boolean => {
  const query = fold(typed);
  return (
    query === '' ||
    (REGION_SPELLINGS.get(country || SPAIN)?.get(region) ?? []).some((name) => name.includes(query))
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
