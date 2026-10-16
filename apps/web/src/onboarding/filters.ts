import {
  ATTENTION_REASONS,
  type AttentionReason,
  isStage,
  type Source,
  SOURCES,
  type Stage,
} from '@backoffice/domain/stages';

/**
 * The filters of Personas and the Onboarding Pipeline, and their two spellings: the page's address, in Spanish, so a list can be
 * bookmarked and shared (`?etapa=new&responsable=yo`), and the API's query (docs/spec/staff-api.md, People).
 */
export interface PeopleFilters {
  /** A name, a phone number or an email. */
  q: string;
  stages: Stage[];
  /** 'me', 'none', a staff member's id, or '' for anyone. */
  owner: string;
  attention: boolean;
  inCommunity: 'yes' | 'no' | '';
  /** On the team: linked to an active team account (PLAN M5, step 5). */
  team: 'yes' | 'no' | '';
  source: Source | '';
  /** "Llegó por" (PLAN M5): an entry's id, 'none' for not said, or '' for any. */
  arrival: string;
  /** Whether "Llegó el" is known. */
  arrivedOn: 'known' | 'unknown' | '';
  /** One attention reason: Hoy's "Ver los N sin asignar" asks for `unassigned`. */
  reason: AttentionReason | '';
  province: string;
}

export const NO_FILTERS: PeopleFilters = {
  q: '',
  stages: [],
  owner: '',
  attention: false,
  inCommunity: '',
  team: '',
  source: '',
  arrival: '',
  arrivedOn: '',
  reason: '',
  province: '',
};

/** The reasons as the address spells them, in Spanish. */
const REASON_WORDS: Readonly<Record<AttentionReason, string>> = {
  unassigned: 'sin-asignar',
  action_due: 'accion-pendiente',
  no_next_step: 'sin-siguiente-paso',
  follow_up: 'toca-seguimiento',
  left_community: 'ha-salido',
  possible_duplicate: 'posible-duplicado',
};

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const all = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const first = (value: string | string[] | undefined): string => all(value)[0]?.trim() ?? '';

/** The filters an address asks for; anything it can't mean is left out. */
export const filtersFromPage = (params: SearchParams): PeopleFilters => {
  const owner = first(params.responsable);
  const community = first(params.comunidad);
  const team = first(params.equipo);
  const source = first(params.fuente);
  const arrival = first(params.llegada);
  const arrivedOn = first(params.fecha);
  const reason = ATTENTION_REASONS.find((key) => REASON_WORDS[key] === first(params.motivo));
  return {
    q: first(params.buscar).slice(0, 200),
    stages: [...new Set(all(params.etapa).filter(isStage))],
    owner: owner === 'yo' ? 'me' : owner === 'nadie' ? 'none' : UUID.test(owner) ? owner : '',
    attention: first(params.atencion) === '1',
    inCommunity: community === 'si' ? 'yes' : community === 'no' ? 'no' : '',
    team: team === 'si' ? 'yes' : team === 'no' ? 'no' : '',
    source: (SOURCES as readonly string[]).includes(source) ? (source as Source) : '',
    arrival: arrival === 'ninguna' ? 'none' : UUID.test(arrival) ? arrival : '',
    arrivedOn: arrivedOn === 'sabida' ? 'known' : arrivedOn === 'no-se-sabe' ? 'unknown' : '',
    reason: reason ?? '',
    province: first(params.provincia).slice(0, 100),
  };
};

const query = (params: URLSearchParams): string => {
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
};

/** A reason as the address spells it, for a form that keeps it. */
export const pageReason = (reason: AttentionReason): string => REASON_WORDS[reason];

/** The page's address for the filters. */
export const pageQuery = (filters: PeopleFilters): string => {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('buscar', filters.q);
  }
  for (const stage of filters.stages) {
    params.append('etapa', stage);
  }
  if (filters.owner) {
    params.set(
      'responsable',
      filters.owner === 'me' ? 'yo' : filters.owner === 'none' ? 'nadie' : filters.owner,
    );
  }
  if (filters.attention) {
    params.set('atencion', '1');
  }
  if (filters.inCommunity) {
    params.set('comunidad', filters.inCommunity === 'yes' ? 'si' : 'no');
  }
  if (filters.team) {
    params.set('equipo', filters.team === 'yes' ? 'si' : 'no');
  }
  if (filters.source) {
    params.set('fuente', filters.source);
  }
  if (filters.arrival) {
    params.set('llegada', filters.arrival === 'none' ? 'ninguna' : filters.arrival);
  }
  if (filters.arrivedOn) {
    params.set('fecha', filters.arrivedOn === 'known' ? 'sabida' : 'no-se-sabe');
  }
  if (filters.reason) {
    params.set('motivo', REASON_WORDS[filters.reason]);
  }
  if (filters.province) {
    params.set('provincia', filters.province);
  }
  return query(params);
};

/** The API's query for the filters. */
export const apiQuery = (
  filters: PeopleFilters,
  { cursor, limit }: { cursor?: string | undefined; limit?: number } = {},
): string => {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  for (const stage of filters.stages) {
    params.append('stage', stage);
  }
  if (filters.owner) {
    params.set('owner', filters.owner);
  }
  if (filters.attention) {
    params.set('attention', '1');
  }
  if (filters.inCommunity) {
    params.set('inCommunity', filters.inCommunity === 'yes' ? 'true' : 'false');
  }
  if (filters.team) {
    params.set('team', filters.team === 'yes' ? 'true' : 'false');
  }
  if (filters.source) {
    params.set('source', filters.source);
  }
  if (filters.arrival) {
    params.set('arrival', filters.arrival);
  }
  if (filters.arrivedOn) {
    params.set('arrivedOn', filters.arrivedOn);
  }
  if (filters.reason) {
    params.set('reason', filters.reason);
  }
  if (filters.province) {
    params.set('province', filters.province);
  }
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }
  if (cursor) {
    params.set('cursor', cursor);
  }
  return query(params);
};

/** The admin's export of the list the filters show (docs/spec/staff-api.md, Admin). */
export const exportHref = (filters: PeopleFilters): string =>
  `/api/export/people.csv${apiQuery(filters)}`;

/** Whether any filter is set, so the page offers to clear them. */
export const hasFilters = (filters: PeopleFilters): boolean => pageQuery(filters) !== '';
