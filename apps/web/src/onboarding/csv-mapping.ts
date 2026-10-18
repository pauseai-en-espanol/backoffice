import { foldName } from '@backoffice/domain/identities';

/**
 * What each column of an imported CSV holds (docs/spec/staff-api.md, Intake): the fields a row can map to, and a
 * first guess from the column's header, which the person checks before anything is imported.
 */
export const MAPPING_FIELDS = [
  'name',
  'preferredName',
  'email',
  'phone',
  'province',
  'town',
  'chat',
  'note',
  'stage',
  'discord',
  'arrival',
  'arrivedOn',
  'joinedOn',
  'leftOn',
] as const;
export type MappingField = (typeof MAPPING_FIELDS)[number];

/** What says who a row is: a name, or a way to find them by (PLAN R37). An import maps one of them at least. */
export const IDENTIFYING_FIELDS: readonly MappingField[] = ['name', 'phone', 'email', 'discord'];

export const isMappingField = (value: unknown): value is MappingField =>
  typeof value === 'string' && (MAPPING_FIELDS as readonly string[]).includes(value);

/** A column's header, folded, and the field it most likely is: whole headers first, then a word in them. */
const EXACT: Readonly<Record<string, MappingField>> = {
  nombre: 'name',
  name: 'name',
  'full name': 'name',
  'nombre completo': 'name',
  'nombre y apellidos': 'name',
  'nombre apellidos': 'name',
  'nombre preferido': 'preferredName',
  'preferred name': 'preferredName',
  apodo: 'preferredName',
  email: 'email',
  'e mail': 'email',
  mail: 'email',
  correo: 'email',
  'correo electronico': 'email',
  telefono: 'phone',
  tel: 'phone',
  movil: 'phone',
  phone: 'phone',
  whatsapp: 'phone',
  provincia: 'province',
  province: 'province',
  localidad: 'town',
  ciudad: 'town',
  municipio: 'town',
  pueblo: 'town',
  town: 'town',
  city: 'town',
  chat: 'chat',
  grupo: 'chat',
  nota: 'note',
  notas: 'note',
  note: 'note',
  notes: 'note',
  comentario: 'note',
  comentarios: 'note',
  observaciones: 'note',
  etapa: 'stage',
  estado: 'stage',
  stage: 'stage',
  discord: 'discord',
  'usuario de discord': 'discord',
  'llego por': 'arrival',
  'por donde llego': 'arrival',
  canal: 'arrival',
  via: 'arrival',
  origen: 'arrival',
  'llego el': 'arrivedOn',
  'fecha de llegada': 'arrivedOn',
  llegada: 'arrivedOn',
  'fecha de alta': 'arrivedOn',
  'entro el': 'joinedOn',
  'fecha de entrada': 'joinedOn',
  entrada: 'joinedOn',
  'salio el': 'leftOn',
  'fecha de salida': 'leftOn',
  salida: 'leftOn',
  'fecha de baja': 'leftOn',
};

const WORDS: readonly [RegExp, MappingField][] = [
  [/\bdiscord\b/u, 'discord'],
  [/\bllego por\b/u, 'arrival'],
  [/\b(?:llego el|llegada)\b/u, 'arrivedOn'],
  [/\bentro el\b/u, 'joinedOn'],
  [/\bsalio el\b/u, 'leftOn'],
  [/\b(?:correo|email|mail)\b/u, 'email'],
  [/\b(?:telefono|movil|phone|whatsapp)\b/u, 'phone'],
  [/\bprovincia\b/u, 'province'],
  [/\b(?:localidad|ciudad|municipio)\b/u, 'town'],
  [/\bpreferid[oa]\b/u, 'preferredName'],
  [/\bnombre\b/u, 'name'],
];

const guess = (header: string): MappingField | undefined => {
  const folded = foldName(header);
  return EXACT[folded] ?? WORDS.find(([pattern]) => pattern.test(folded))?.[1];
};

/**
 * Each column's likely field, or 'ignore'. A field goes to the first column that looks like it; any other column that
 * looks the same is ignored, so no two columns fill one field.
 */
export const suggestMapping = (
  headers: readonly string[],
): Record<string, MappingField | 'ignore'> => {
  const taken = new Set<MappingField>();
  const mapping: Record<string, MappingField | 'ignore'> = {};
  for (const header of headers) {
    const field = guess(header);
    if (field === undefined || taken.has(field)) {
      mapping[header] = 'ignore';
    } else {
      taken.add(field);
      mapping[header] = field;
    }
  }
  return mapping;
};

/** The mapping the API takes: only the columns that are used. */
export const usedMapping = (
  mapping: Readonly<Record<string, MappingField | 'ignore'>>,
): Record<string, MappingField> =>
  Object.fromEntries(
    Object.entries(mapping).filter(
      (entry): entry is [string, MappingField] => entry[1] !== 'ignore',
    ),
  );
