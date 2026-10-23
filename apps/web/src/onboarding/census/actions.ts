'use client';

import type { ContactChannel } from '@backoffice/domain/stages';

import { send } from '@/write';

import type { OptionKind } from './types';

/**
 * The census's calls to the API from the browser, each one route of docs/spec/staff-api.md (M2: the census), on this
 * same host, through write.ts.
 */

const person = (id: string) => `/api/people/${encodeURIComponent(id)}`;

/**
 * A personal link for someone, valid 30 days: its URL comes back once, inside the message asked for (one of the team's
 * in Mensajes), or the first in use.
 */
export const createCensusLink = (personId: string, templateId?: string) =>
  send('POST', `${person(personId)}/census-link`, templateId === undefined ? {} : { templateId });

/** "Enviado": the link went from the onboarder's WhatsApp, logged as a contact attempt. */
/** "Sí, lo he enviado": by the channel it went by (PLAN R77). */
export const markCensusLinkSent = (linkId: string, channel: ContactChannel) =>
  send('POST', `/api/census-links/${encodeURIComponent(linkId)}/sent`, { channel });

export const addCensusOption = (option: { kind: OptionKind; label: string }) =>
  send('POST', '/api/census/options', option);

export const updateCensusOption = (
  id: string,
  change: { label?: string; active?: boolean; position?: number },
) => send('PATCH', `/api/census/options/${encodeURIComponent(id)}`, change);

/** A list's new order, all at once: every option of that kind, first to last. */
export const orderCensusOptions = (kind: OptionKind, ids: readonly string[]) =>
  send('PUT', '/api/census/options/order', { kind, ids });

/** Admins: the person's data erased for good, the record kept anonymised for the counts. */
export const erasePerson = (personId: string) => send('POST', `${person(personId)}/erase`);
