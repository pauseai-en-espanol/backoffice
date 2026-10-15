import { notFound, redirect } from 'next/navigation';

import { getFromApi } from '@/api';
import { isUnavailable, readFromApi, UNAVAILABLE, type Unavailable } from '@/data';
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
import { queueAfterSkipping } from './format';
import {
  type CampaignRef,
  type Next,
  parseCampaignPage,
  parseCampaigns,
  parseContactPage,
  parseContacts,
  parseHandover,
  parseNext,
  parseOrganisationPage,
  parseOrganisations,
  type Target,
} from './types';

/** What the outreach pages read (docs/spec/staff-api.md, M3), each checked before a page renders it. */

export const getOrganisations = (filters: OrganisationFilters) =>
  readFromApi(`/api/outreach/organisations${organisationApiQuery(filters)}`, parseOrganisations);

export const getContacts = (filters: ContactFilters) =>
  readFromApi(`/api/outreach/contacts${contactApiQuery(filters)}`, parseContacts);

export const getCampaigns = () => readFromApi('/api/outreach/campaigns', parseCampaigns);

/**
 * Siguiente: my next target, in one campaign or all active ones, passing over those left for later in this visit. The
 * API's `next` doesn't know which those are: when it answers one of them, the page reads the campaigns' targets, finds
 * the next in the API's own order (format.ts queueAfterSkipping) and reads that target's letter.
 */
export const getNext = async (filters: NextFilters, me: string): Promise<Next | Unavailable> => {
  const next = await readFromApi(`/api/outreach/next${nextApiQuery(filters)}`, parseNext);
  if (isUnavailable(next) || next.target === null || !filters.skip.includes(next.target.id)) {
    return next;
  }
  let ids = [filters.campaign];
  if (!filters.campaign) {
    const campaigns = await getCampaigns();
    if (isUnavailable(campaigns)) {
      return campaigns;
    }
    ids = campaigns.filter((campaign) => campaign.status === 'active').map(({ id }) => id);
  }
  const pages = await Promise.all(
    ids.map((id) =>
      readFromApi(`/api/outreach/campaigns/${encodeURIComponent(id)}`, parseCampaignPage),
    ),
  );
  const entries: { target: Target; campaign: CampaignRef }[] = [];
  for (const page of pages) {
    if (isUnavailable(page)) {
      return page;
    }
    const { id, slug, name } = page.campaign;
    entries.push(...page.targets.map((target) => ({ target, campaign: { id, slug, name } })));
  }
  const queue = queueAfterSkipping(entries, { me, skip: filters.skip });
  const [first] = queue;
  if (!first) {
    return { target: null, campaign: null, handover: null, remaining: 0, blocked: next.blocked };
  }
  const handover = await readFromApi(
    `/api/outreach/targets/${encodeURIComponent(first.target.id)}/letter`,
    parseHandover,
  );
  return isUnavailable(handover)
    ? handover
    : { ...first, handover, remaining: queue.length, blocked: next.blocked };
};

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
