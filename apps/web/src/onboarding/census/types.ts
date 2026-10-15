import { parseSummary, type PersonSummary } from '../types';

/**
 * What the census pages read from the API (docs/spec/staff-api.md, M2: the census), and the checks that keep a page
 * from rendering an answer it doesn't understand. Shared by server and browser code: no node imports here.
 */

export type OptionKind = 'skill' | 'interest';

/** A skill or an area to help in, as admins edit them in Ajustes. */
export interface CensusOption {
  id: string;
  kind: OptionKind;
  label: string;
  active: boolean;
  position: number;
}

/** A personal link's life: made, sent from someone's WhatsApp, used by the person. */
export interface CensusLink {
  id: string;
  createdAt: string;
  expiresAt: string;
  sentAt: string | null;
  usedAt: string | null;
}

export interface CensusQueueItem {
  person: PersonSummary;
  link: CensusLink | null;
}

export interface Census {
  counts: { people: number; completed: number; linksSent: number; linksUsed: number };
  queue: CensusQueueItem[];
}

/** A new personal link, as `POST /api/people/:id/census-link` answers once: its URL is never shown again. */
export interface NewCensusLink {
  id: string;
  url: string;
  expiresAt: string;
  whatsapp: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): value is string => typeof value === 'string';

const nullable = (value: unknown): string | null | undefined =>
  value === undefined || value === null ? null : str(value) ? value : undefined;

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const every = <T>(value: unknown, parse: (item: unknown) => T | undefined): T[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === undefined) {
      return undefined;
    }
    out.push(parsed);
  }
  return out;
};

export const isOptionKind = (value: unknown): value is OptionKind =>
  value === 'skill' || value === 'interest';

export const parseOption = (value: unknown): CensusOption | undefined =>
  isRecord(value) && str(value.id) && isOptionKind(value.kind) && str(value.label)
    ? {
        id: value.id,
        kind: value.kind,
        label: value.label,
        active: value.active !== false,
        position: typeof value.position === 'number' ? value.position : 0,
      }
    : undefined;

/** `GET /api/census/options`'s body: `{ options }`, or the list itself. */
export const parseOptions = (body: unknown): CensusOption[] | undefined =>
  every(isRecord(body) ? body.options : body, parseOption);

export const parseLink = (value: unknown): CensusLink | null | undefined => {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value) || !str(value.id) || !str(value.createdAt) || !str(value.expiresAt)) {
    return undefined;
  }
  const sentAt = nullable(value.sentAt);
  const usedAt = nullable(value.usedAt);
  return sentAt === undefined || usedAt === undefined
    ? undefined
    : { id: value.id, createdAt: value.createdAt, expiresAt: value.expiresAt, sentAt, usedAt };
};

const parseQueueItem = (value: unknown): CensusQueueItem | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const person = parseSummary(value.person);
  const link = parseLink(value.link);
  return person && link !== undefined ? { person, link } : undefined;
};

/** `GET /api/census`'s body. */
export const parseCensus = (body: unknown): Census | undefined => {
  if (!isRecord(body) || !isRecord(body.counts)) {
    return undefined;
  }
  const queue = every(body.queue, parseQueueItem);
  return queue
    ? {
        counts: {
          people: count(body.counts.people),
          completed: count(body.counts.completed),
          linksSent: count(body.counts.linksSent),
          linksUsed: count(body.counts.linksUsed),
        },
        queue,
      }
    : undefined;
};

/** `POST /api/people/:id/census-link`'s body. */
export const parseNewLink = (body: unknown): NewCensusLink | undefined => {
  if (!isRecord(body) || !str(body.id) || !str(body.url) || !str(body.expiresAt)) {
    return undefined;
  }
  const whatsapp = nullable(body.whatsapp);
  return whatsapp === undefined
    ? undefined
    : { id: body.id, url: body.url, expiresAt: body.expiresAt, whatsapp };
};
