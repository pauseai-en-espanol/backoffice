import { notFound, redirect } from 'next/navigation';

import { getFromApi } from '@/api';
import { readFromApi, UNAVAILABLE, type Unavailable } from '@/data';
import { forwardedRequest, PAGE_OF } from '@/session';

import { apiQuery, type PeopleFilters } from './filters';
import { parsePanel } from './panel/types';
import {
  parseAirtableSettings,
  parseArrivalChannels,
  parseBandeja,
  parseBoard,
  parseImports,
  parseMessageTemplates,
  parsePeople,
  parsePersonPage,
  parseSettings,
  parseTelegramLink,
  parseToday,
  type PersonPage,
} from './types';

/** What the onboarding pages read (docs/spec/staff-api.md, M1), each checked before a page renders it. */

/** Hoy: my people needing attention, the unassigned queue, and the counts. */
export const getToday = () => readFromApi('/api/today', parseToday);

/** Personas: a page of people for the filters, from `cursor` on. */
export const getPeople = (filters: PeopleFilters, cursor?: string) =>
  readFromApi(`/api/people${apiQuery(filters, { cursor })}`, parsePeople);

/** The Onboarding Pipeline: the people by stage, for the filters (without the search text). */
export const getBoard = (filters: PeopleFilters) =>
  readFromApi(`/api/board${apiQuery({ ...filters, q: '' })}`, parseBoard);

/** The Panel (M4): the funnel's numbers over the last `weeks` weeks. */
export const getPanel = (weeks: number) => readFromApi(`/api/panel?weeks=${weeks}`, parsePanel);

export const getBandeja = () => readFromApi('/api/bandeja', parseBandeja);

export const getImports = () => readFromApi('/api/imports', parseImports);

export const getSettings = () => readFromApi('/api/settings', parseSettings);

/** The Airtable sync's settings (ADR-0005), for admins: never the link. */
export const getAirtableSettings = () => readFromApi('/api/airtable', parseAirtableSettings);

export const getTelegramLink = () => readFromApi('/api/telegram/link', parseTelegramLink);

/** "Llegó por": the list to choose from, and to edit in Ajustes (PLAN M5). */
export const getArrivalChannels = () => readFromApi('/api/arrival-channels', parseArrivalChannels);

/** The team's WhatsApp messages (Mensajes, PLAN M5): to write, and to pick from when one is opened. */
export const getMessageTemplates = () =>
  readFromApi('/api/message-templates', parseMessageTemplates);

/** A read that may be refused: the page then says so, rather than "unavailable". */
export interface Forbidden {
  forbidden: true;
}

export const isForbidden = (value: unknown): value is Forbidden =>
  typeof value === 'object' && value !== null && 'forbidden' in value;

/**
 * A person's page: 404 is the not-found page, 403 the "not your section" page, a lost session goes back to sign-in,
 * anything else the API can't answer is "unavailable".
 */
export const getPerson = async (id: string): Promise<PersonPage | Forbidden | Unavailable> => {
  const path = `/api/people/${encodeURIComponent(id)}`;
  let answer;
  try {
    answer = await getFromApi(path, await forwardedRequest());
  } catch (error) {
    console.error('The API could not be reached for /api/people/:id', error);
    return UNAVAILABLE;
  }
  if (answer.status === 401) {
    redirect(PAGE_OF['signed-out']);
  }
  if (answer.status === 404 || answer.status === 400) {
    notFound();
  }
  if (answer.status === 403) {
    return { forbidden: true };
  }
  const parsed = answer.status === 200 ? parsePersonPage(answer.body) : undefined;
  if (!parsed) {
    console.error(`The API answered ${answer.status} for /api/people/:id`);
    return UNAVAILABLE;
  }
  return parsed;
};
