'use client';

import { read } from '@/onboarding/actions';
import { send } from '@/write';

import type { ContactFilters } from './filters';
import type { ImportFiles } from './format';
import type {
  AnchorInput,
  CampaignInput,
  ContactInput,
  OrganisationInput,
  TargetChange,
  TemplateInput,
} from './forms';
import type { Tier } from './types';

import { contactApiQuery } from './filters';

/**
 * The outreach pages' calls to the API from the browser, each one route of docs/spec/staff-api.md (M3), on this same
 * host, through write.ts. Nothing here sends mail: "Sí, enviado" only records that the sender sent it themselves.
 */

const at = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;
const ORGANISATIONS = '/api/outreach/organisations';
const CONTACTS = '/api/outreach/contacts';
const CAMPAIGNS = '/api/outreach/campaigns';
const TARGETS = '/api/outreach/targets';

export const createOrganisation = (input: OrganisationInput) => send('POST', ORGANISATIONS, input);

export const updateOrganisation = (id: string, change: OrganisationInput) =>
  send('PATCH', at(ORGANISATIONS, id), change);

export const createContact = (input: ContactInput) => send('POST', CONTACTS, input);

export const updateContact = (id: string, change: ContactInput) =>
  send('PATCH', at(CONTACTS, id), change);

export const addContactNote = (id: string, body: string) =>
  send('POST', `${at(CONTACTS, id)}/notes`, { body });

/** Admins: the contact's details, notes and timeline words go for good; they stay held. */
export const eraseContact = (id: string) => send('POST', `${at(CONTACTS, id)}/erase`);

/** The directory, read as someone picks contacts to add to a campaign. */
export const searchContacts = (filters: ContactFilters) =>
  read(`${CONTACTS}${contactApiQuery(filters)}`);

export const createCampaign = (input: CampaignInput) => send('POST', CAMPAIGNS, input);

export const updateCampaign = (id: string, change: CampaignInput) =>
  send('PATCH', at(CAMPAIGNS, id), change);

export const saveTemplate = (campaignId: string, tier: Tier, template: TemplateInput) =>
  send('PUT', `${at(CAMPAIGNS, campaignId)}/templates/${tier}`, template);

export const saveAnchor = (campaignId: string, key: string, anchor: AnchorInput) =>
  send('PUT', `${at(CAMPAIGNS, campaignId)}/anchors/${encodeURIComponent(key)}`, anchor);

export const deleteAnchor = (campaignId: string, key: string) =>
  send('DELETE', `${at(CAMPAIGNS, campaignId)}/anchors/${encodeURIComponent(key)}`);

export const addTargets = (campaignId: string, contactIds: readonly string[]) =>
  send('POST', `${at(CAMPAIGNS, campaignId)}/targets`, { contactIds });

/** The letter a contact would get from the campaign, with its handover: to read, never to send from here. */
export const previewLetter = (campaignId: string, contactId: string) =>
  read(
    `${at(CAMPAIGNS, campaignId)}/preview?${new URLSearchParams({ contact: contactId }).toString()}`,
  );

export const updateTarget = (id: string, change: TargetChange) =>
  send('PATCH', at(TARGETS, id), change);

export const removeTarget = (id: string) => send('DELETE', at(TARGETS, id));

/** "Sí, enviado": the sender sent it from their own mail; this records it, with the template's version. */
export const markSent = (id: string, templateVersion: number | null) =>
  send('POST', `${at(TARGETS, id)}/sent`, templateVersion === null ? {} : { templateVersion });

/** Admins: a campaign from the outreach repo's files; a dry run first, which writes nothing. */
export const importCampaign = (request: { dryRun: boolean; files: ImportFiles }) =>
  send('POST', '/api/outreach/import', request);
