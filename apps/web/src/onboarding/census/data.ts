import { readFromApi } from '@/data';

import { parseCensus, parseOptions } from './types';

/** What the census pages read (docs/spec/staff-api.md, M2: the census), each checked before a page renders it. */

/** Censo: the counts and a page of the people still to answer (searched, after a cursor), with their links. */
export const getCensus = ({
  q,
  cursor,
}: { q?: string | undefined; cursor?: string | undefined } = {}) => {
  const query = new URLSearchParams();
  if (q) {
    query.set('q', q);
  }
  if (cursor) {
    query.set('cursor', cursor);
  }
  const search = query.toString();
  return readFromApi(`/api/census${search === '' ? '' : `?${search}`}`, parseCensus);
};

/** The skills and the areas to help in, active or not, for everyone to read. */
export const getCensusOptions = () => readFromApi('/api/census/options', parseOptions);

/**
 * The census form's generic link, from the deployment's configuration (CENSUS_URL): the public forms app's address,
 * which staff paste in the community's announcements. Blank when unset, so the page says so rather than guess one.
 */
export const censusUrl = (): string => process.env.CENSUS_URL?.trim() ?? '';
