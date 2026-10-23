'use client';

import type { ContactChannel, ContactOutcome } from '@backoffice/domain/stages';

import { send, type WriteAnswer } from '@/write';

/**
 * The onboarding pages' calls to the API from the browser, each one route of docs/spec/staff-api.md (M1), on this
 * same host. Writes go through write.ts; the few reads made as someone types (candidates, the merge search) through
 * `read`, which answers like a write so the pages handle both alike.
 */

const person = (id: string) => `/api/people/${encodeURIComponent(id)}`;

/** A GET from the browser to the API, answered like a write (write.ts). */
export const read = async (path: string): Promise<WriteAnswer> => {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: 'application/json' } });
  } catch {
    return { ok: false, status: 0, error: 'network', body: {} };
  }
  const parsed: unknown = await response.json().catch(() => undefined);
  const body =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return {
    ok: response.ok,
    status: response.status,
    ...(typeof body.error === 'string' ? { error: body.error } : {}),
    ...(typeof body.field === 'string' ? { field: body.field } : {}),
    body,
  };
};

export interface PersonChange {
  fullName?: string;
  preferredName?: string | null;
  province?: string | null;
  town?: string | null;
  country?: string | null;
  originCountry?: string | null;
  originProvince?: string | null;
  languages?: string[];
  pronouns?: string | null;
  availability?: string | null;
  howHeard?: string | null;
  /** The one-line internal summary (PLAN M5, step 4). */
  summary?: string | null;
  stage?: string;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
  /** "Llegó el" (null: nobody knows) and "Llegó por" (PLAN M5). */
  arrivedOn?: string | null;
  arrivalId?: string | null;
  /** The day a stage change made now happened, if another. */
  stageOn?: string;
}

export const claim = (id: string) => send('POST', `${person(id)}/claim`);

export const updatePerson = (id: string, change: PersonChange) => send('PATCH', person(id), change);

/** A note; `happenedOn` when it tells of another day (PLAN M5). */
export const addNote = (id: string, note: { body: string; happenedOn?: string }) =>
  send('POST', `${person(id)}/notes`, note);

/** A contact attempt; the message that went out, when the team wrote it in Mensajes, by its id and version. */
export const addAttempt = (
  id: string,
  attempt: {
    channel: ContactChannel;
    outcome: ContactOutcome;
    note?: string;
    happenedOn?: string;
    templateId?: string;
    templateVersion?: number;
  },
) => send('POST', `${person(id)}/attempts`, attempt);

export const addIdentity = (
  id: string,
  identity: { kind: 'email' | 'phone' | 'discord'; value: string },
) => send('POST', `${person(id)}/identities`, identity);

export const removeIdentity = (id: string, identityId: string) =>
  send('DELETE', `${person(id)}/identities/${encodeURIComponent(identityId)}`);

export const markJoined = (id: string, joined: { joinedOn?: string; chat?: string }) =>
  send('POST', `${person(id)}/joined`, joined);

export const markLeft = (id: string, left: { leftOn?: string }) =>
  send('POST', `${person(id)}/left`, left);

export const merge = (survivorId: string, mergedId: string) =>
  send('POST', `${person(survivorId)}/merge`, { mergedId });

export const searchPeople = (q: string) =>
  read(`/api/people?${new URLSearchParams({ q, limit: '10' }).toString()}`);

export interface QuickAdd {
  name?: string;
  phone?: string;
  email?: string;
  discord?: string;
  /** An entry of "Llegó por"; "Llegó el", null when nobody knows (PLAN M5). */
  arrival?: string;
  arrivedOn?: string | null;
  province?: string;
  town?: string;
  /** Where they live, a country's code (PLAN R74), and where they're from (R75). */
  country?: string;
  originCountry?: string;
  originProvince?: string;
  chat?: string;
  note?: string;
  stage?: string;
  decision?: 'new' | 'attach';
  target?: string;
}

export const candidates = (query: {
  name: string;
  phone?: string;
  email?: string;
  province?: string;
}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  return read(`/api/candidates?${params.toString()}`);
};

export const quickAdd = (intake: QuickAdd) => send('POST', '/api/intake', intake);

export const decide = (
  itemId: string,
  decision: { decision: 'attach' | 'new' | 'discard' | 'apply' | 'keep'; target?: string },
) => send('POST', `/api/bandeja/${encodeURIComponent(itemId)}`, decision);

export const syncAirtable = () => send('POST', '/api/imports/airtable');

export const importCsv = (request: {
  csv: string;
  mapping?: Record<string, string>;
  apply?: boolean;
}) => send('POST', '/api/imports/csv', request);

export const updateSettings = (change: Record<string, unknown>) =>
  send('PATCH', '/api/settings', change);

/** "Llegó por", the list admins edit in Ajustes (PLAN M5). */
export const addArrivalChannel = (label: string) =>
  send('POST', '/api/arrival-channels', { label });

export const updateArrivalChannel = (id: string, change: { label?: string; active?: boolean }) =>
  send('PATCH', `/api/arrival-channels/${encodeURIComponent(id)}`, change);

/** The list's new order, all at once, first to last. */
export const orderArrivalChannels = (ids: readonly string[]) =>
  send('PUT', '/api/arrival-channels/order', { ids });

/** Global's view link, sealed by the API (ADR-0005): set once, never shown again; removing it turns the sync off. */
export const setAirtableLink = (link: string) => send('PUT', '/api/airtable/link', { link });

export const removeAirtableLink = () => send('DELETE', '/api/airtable/link');

export const setAirtableEnabled = (enabled: boolean) => send('PATCH', '/api/airtable', { enabled });

export const linkTelegram = () => send('POST', '/api/telegram/link');

export const unlinkTelegram = () => send('DELETE', '/api/telegram/link');
