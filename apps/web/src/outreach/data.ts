import { notFound, redirect } from 'next/navigation';

import { getFromApi } from '@/api';
import { readFromApi, UNAVAILABLE, type Unavailable } from '@/data';
import { type Forbidden } from '@/onboarding/data';
import { forwardedRequest, PAGE_OF } from '@/session';

import {
  contactApiQuery,
  type ContactFilters,
  nextApiQuery,
  type NextFilters,
  organisationApiQuery,
  type OrganisationFilters,
} from './filters';
import {
  parseCampaignPage,
  parseCampaigns,
  parseContactPage,
  parseContacts,
  parseNext,
  parseOrganisationPage,
  parseOrganisations,
  parseRightsContacts,
} from './types';

/** What the outreach pages read (docs/spec/staff-api.md, M3), each checked before a page renders it. */

export const getOrganisations = (filters: OrganisationFilters) =>
  readFromApi(`/api/outreach/organisations${organisationApiQuery(filters)}`, parseOrganisations);

export const getContacts = (filters: ContactFilters) =>
  readFromApi(`/api/outreach/contacts${contactApiQuery(filters)}`, parseContacts);

export const getCampaigns = () => readFromApi('/api/outreach/campaigns', parseCampaigns);

/** Siguiente: my next target, in one campaign or all active ones, past those left for later in this visit. */
export const getNext = (filters: NextFilters) =>
  readFromApi(`/api/outreach/next${nextApiQuery(filters)}`, parseNext);

/**
 * One record's page (a contact, a campaign, an organisation): 404 is the not-found page, 403 the "not your section"
 * page, a lost session goes back to sign-in, anything else the API can't answer is "unavailable". `route` names the
 * route in the log, never the id.
 */
const readRecord = async <T>(
  route: string,
  id: string,
  parse: (body: unknown) => T | undefined,
): Promise<T | Forbidden | Unavailable> => {
  let answer;
  try {
    answer = await getFromApi(
      route.replace(':id', encodeURIComponent(id)),
      await forwardedRequest(),
    );
  } catch (error) {
    console.error(`The API could not be reached for ${route}`, error);
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
  const parsed = answer.status === 200 ? parse(answer.body) : undefined;
  if (parsed === undefined) {
    console.error(`The API answered ${answer.status} for ${route}`);
    return UNAVAILABLE;
  }
  return parsed;
};

export const getContact = (id: string) =>
  readRecord('/api/outreach/contacts/:id', id, parseContactPage);

export const getCampaign = (id: string) =>
  readRecord('/api/outreach/campaigns/:id', id, parseCampaignPage);

export const getOrganisation = (id: string) =>
  readRecord('/api/outreach/organisations/:id', id, parseOrganisationPage);

/** Team contacts that may be the same person as one's private contact, to merge it into (PLAN M5, step 6). */
export const getMatches = (id: string) =>
  readFromApi(`/api/outreach/contacts/${encodeURIComponent(id)}/matches`, parseContacts);

/** A rights request's contacts, private ones too (admins, PLAN M5, step 6). */
export const getRightsContacts = (q: string) =>
  readFromApi(`/api/outreach/rights?${new URLSearchParams({ q }).toString()}`, parseRightsContacts);
