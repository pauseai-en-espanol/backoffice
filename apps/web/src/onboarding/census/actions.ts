'use client';

import { send } from '@/write';

import type { OptionKind } from './types';

/**
 * The census's calls to the API from the browser, each one route of docs/spec/staff-api.md (M2: the census), on this
 * same host, through write.ts.
 */

const person = (id: string) => `/api/people/${encodeURIComponent(id)}`;

/** A personal link for someone, valid 30 days: its URL comes back once. */
export const createCensusLink = (personId: string) =>
  send('POST', `${person(personId)}/census-link`);

/** "Enviado": the link went from the onboarder's WhatsApp, logged as a contact attempt. */
export const markCensusLinkSent = (linkId: string) =>
  send('POST', `/api/census-links/${encodeURIComponent(linkId)}/sent`);

export const addCensusOption = (option: { kind: OptionKind; label: string }) =>
  send('POST', '/api/census/options', option);

export const updateCensusOption = (
  id: string,
  change: { label?: string; active?: boolean; position?: number },
) => send('PATCH', `/api/census/options/${encodeURIComponent(id)}`, change);

/** Admins: the person's data erased for good, the record kept anonymised for the counts. */
export const erasePerson = (personId: string) => send('POST', `${person(personId)}/erase`);
