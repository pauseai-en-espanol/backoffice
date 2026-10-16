import {
  isOrganisationKind,
  isRelationshipStage,
  isTier,
  type OrganisationKind,
  type RelationshipStage,
  type Tier,
} from './types';

/**
 * The filters of Contactos and Organizaciones, and their two spellings: the page's address, in Spanish, so a list can
 * be bookmarked and shared (`?nivel=A&responsable=yo`), and the API's query (docs/spec/staff-api.md, M3).
 */
export interface ContactFilters {
  /** Matches the organisation, the person and the role. */
  q: string;
  tier: Tier | '';
  territory: string;
  /** The organisation's kind. */
  kind: OrganisationKind | '';
  stage: RelationshipStage | '';
  /** 'me', a staff member's id, or '' for anyone. */
  owner: string;
  review: 'yes' | 'no' | '';
  hold: 'yes' | 'no' | '';
  /** "Quién lo ve" (PLAN M5, step 6): one's own private ones, the team's, or '' for both. */
  visibility: Visibility | '';
}

export type Visibility = 'private' | 'team';

export const NO_CONTACT_FILTERS: ContactFilters = {
  q: '',
  tier: '',
  territory: '',
  kind: '',
  stage: '',
  owner: '',
  review: '',
  hold: '',
  visibility: '',
};

export interface OrganisationFilters {
  q: string;
  kind: OrganisationKind | '';
  visibility: Visibility | '';
}

/** "Quién lo ve" in the page's address: `yo` or `equipo`. */
const visibilityOf = (value: string): Visibility | '' =>
  value === 'yo' ? 'private' : value === 'equipo' ? 'team' : '';

const visibilityWord = (value: Visibility | ''): string =>
  value === 'private' ? 'yo' : value === 'team' ? 'equipo' : '';

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const isUuid = (value: string): boolean => UUID.test(value);

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

const yesNo = (value: string): 'yes' | 'no' | '' =>
  value === 'si' ? 'yes' : value === 'no' ? 'no' : '';

const siNo = (value: 'yes' | 'no' | ''): string =>
  value === 'yes' ? 'si' : value === 'no' ? 'no' : '';

/** The contact filters an address asks for; anything it can't mean is left out. */
export const contactFiltersFromPage = (params: SearchParams): ContactFilters => {
  const tier = first(params.nivel);
  const kind = first(params.tipo);
  const stage = first(params.relacion);
  const owner = first(params.responsable);
  return {
    q: first(params.buscar).slice(0, 200),
    tier: isTier(tier) ? tier : '',
    territory: first(params.territorio).slice(0, 100),
    kind: isOrganisationKind(kind) ? kind : '',
    stage: isRelationshipStage(stage) ? stage : '',
    owner: owner === 'yo' ? 'me' : owner === 'nadie' ? 'none' : isUuid(owner) ? owner : '',
    review: yesNo(first(params.revisar)),
    hold: yesNo(first(params.pausa)),
    visibility: visibilityOf(first(params.quien)),
  };
};

const query = (params: URLSearchParams): string => {
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
};

/** The page's address for the contact filters. */
export const contactPageQuery = (filters: ContactFilters): string => {
  const params = new URLSearchParams();
  const set = (name: string, value: string) => {
    if (value !== '') {
      params.set(name, value);
    }
  };
  set('buscar', filters.q);
  set('nivel', filters.tier);
  set('territorio', filters.territory);
  set('tipo', filters.kind);
  set('relacion', filters.stage);
  set(
    'responsable',
    filters.owner === 'me' ? 'yo' : filters.owner === 'none' ? 'nadie' : filters.owner,
  );
  set('revisar', siNo(filters.review));
  set('pausa', siNo(filters.hold));
  set('quien', visibilityWord(filters.visibility));
  return query(params);
};

/** The API's query for the contact filters. */
export const contactApiQuery = (filters: ContactFilters): string => {
  const params = new URLSearchParams();
  const set = (name: string, value: string) => {
    if (value !== '') {
      params.set(name, value);
    }
  };
  set('q', filters.q);
  set('tier', filters.tier);
  set('territory', filters.territory);
  set('kind', filters.kind);
  set('stage', filters.stage);
  set('owner', filters.owner);
  set('review', filters.review === 'yes' ? 'true' : filters.review === 'no' ? 'false' : '');
  set('hold', filters.hold === 'yes' ? 'true' : filters.hold === 'no' ? 'false' : '');
  set('visibility', filters.visibility);
  return query(params);
};

export const hasContactFilters = (filters: ContactFilters): boolean =>
  contactPageQuery(filters) !== '';

/** The organisation filters an address asks for. */
export const organisationFiltersFromPage = (params: SearchParams): OrganisationFilters => {
  const kind = first(params.tipo);
  return {
    q: first(params.buscar).slice(0, 200),
    kind: isOrganisationKind(kind) ? kind : '',
    visibility: visibilityOf(first(params.quien)),
  };
};

/** The API's query for the organisation filters. */
export const organisationApiQuery = (filters: OrganisationFilters): string => {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.kind) {
    params.set('kind', filters.kind);
  }
  if (filters.visibility) {
    params.set('visibility', filters.visibility);
  }
  return query(params);
};

export const hasOrganisationFilters = (filters: OrganisationFilters): boolean =>
  filters.q !== '' || filters.kind !== '' || filters.visibility !== '';

/**
 * Siguiente's address: the campaign it is limited to, and the targets left for later in this visit ("Ahora no"), which
 * the page passes over. At most `MAX_SKIPPED`, the oldest dropped first, so the address stays short.
 */
export interface NextFilters {
  campaign: string;
  skip: string[];
}

export const MAX_SKIPPED = 50;

export const nextFiltersFromPage = (params: SearchParams): NextFilters => {
  const campaign = first(params.campana);
  return {
    campaign: isUuid(campaign) ? campaign : '',
    skip: [
      ...new Set(
        first(params.saltar)
          .split(',')
          .map((id) => id.trim())
          .filter(isUuid),
      ),
    ].slice(-MAX_SKIPPED),
  };
};

export const nextPageQuery = ({ campaign, skip }: NextFilters): string => {
  const params = new URLSearchParams();
  if (campaign) {
    params.set('campana', campaign);
  }
  const kept = [...new Set(skip)].slice(-MAX_SKIPPED);
  if (kept.length > 0) {
    params.set('saltar', kept.join(','));
  }
  return query(params);
};

/** The API's query for Siguiente: the campaign, and the targets left for later, which the API passes over. */
export const nextApiQuery = ({ campaign, skip }: NextFilters): string => {
  const params = new URLSearchParams();
  if (campaign) {
    params.set('campaign', campaign);
  }
  const kept = [...new Set(skip)].slice(-MAX_SKIPPED);
  if (kept.length > 0) {
    params.set('skip', kept.join(','));
  }
  return query(params);
};
