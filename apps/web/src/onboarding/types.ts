import { MESSAGE_PURPOSES, type MessagePurpose } from '@backoffice/domain/message-templates';
import { isMissingDetail, type MissingDetail } from '@backoffice/domain/missing';
import { isStage, type Stage } from '@backoffice/domain/stages';

/**
 * What the onboarding pages read from the API (docs/spec/staff-api.md, M1), and the checks that keep a page from
 * rendering an answer it doesn't understand. Optional or nullable fields the API may leave out become null.
 */

export interface StaffRef {
  userId: string;
  displayName: string;
}

/**
 * A person as lists show one. `name` is the preferred name, else the full name; both are null for someone saved with
 * only a phone or an email (PLAN R37), shown as "Sin nombre" (`personName`).
 */
export interface PersonSummary {
  id: string;
  name: string | null;
  fullName: string | null;
  stage: Stage;
  owner: StaffRef | null;
  province: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  reasons: string[];
  inCommunity: boolean;
  sources: string[];
  /** "Llegó el": null when nobody knows (PLAN M5). */
  arrivedOn: string | null;
  /** "Llegó por", from the list in Ajustes. */
  arrival: { id: string; label: string } | null;
  createdAt: string;
  /** The one-line internal summary (PLAN M5, step 4): staff only, never to Telegram. */
  summary: string | null;
  /** What the card says is missing ("Falta: correo · qué quiere hacer"). */
  missing: MissingDetail[];
  /** The team account linked to this person (PLAN M5, step 5), active or not. */
  team: (StaffRef & { active: boolean }) | null;
}

/** An entry of "Llegó por" (PLAN M5): `key` marks the ones the backoffice picks itself (the bot's, Global's form). */
export interface ArrivalChannel {
  id: string;
  key: string | null;
  label: string;
  active: boolean;
  position: number;
}

/**
 * A WhatsApp message the team wrote in Mensajes (PLAN M5): its purpose, title, what it says (with its version for
 * someone without a name when it uses {nombre}), whether it's in use, and its version.
 */
export interface MessageTemplate {
  id: string;
  purpose: MessagePurpose;
  title: string;
  body: string;
  bodyNameless: string | null;
  active: boolean;
  version: number;
  updatedAt: string;
  updatedBy: StaffRef | null;
}

export interface Identity {
  id: string;
  kind: 'email' | 'phone' | 'discord' | 'airtable';
  value: string;
  verified: boolean;
  source: string;
}

export interface Presence {
  id: string;
  joinedOn: string | null;
  leftOn: string | null;
  chat: string | null;
}

export interface PersonSource {
  source: string;
  firstSeenAt: string | null;
  /** Who reported it: a staff member, or nobody known (a sync, the owner). */
  reportedBy: StaffRef | string | null;
}

/** A skill or an area to help in that the person chose in the census (M2). */
export interface PersonOption {
  id: string;
  kind: 'skill' | 'interest';
  label: string;
}

/** A consent's latest answer: given or refused, when, and the version of the wording the person saw. */
export interface Consent {
  granted: boolean;
  at: string;
  wordingVersion: string;
}

export const CONSENT_KINDS = ['email', 'whatsapp', 'privacy'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export interface PersonDetail extends Omit<PersonSummary, 'sources'> {
  preferredName: string | null;
  town: string | null;
  languages: string[];
  pronouns: string | null;
  availability: string | null;
  howHeard: string | null;
  profileCompletedAt: string | null;
  mergedInto: string | null;
  identities: Identity[];
  presence: Presence[];
  sources: PersonSource[];
  /** The API's WhatsApp handover link or number, if the person has a phone. */
  whatsapp: string | null;
  /** The census's answers (M2): an older API leaves them out, which reads as "not answered". */
  options: PersonOption[];
  skillsOther: string | null;
  interestsOther: string | null;
  consents: Record<ConsentKind, Consent | null>;
  /** When the person's data was erased, if the API says; the record then stays only for the counts. */
  anonymisedAt: string | null;
}

export interface TimelineEvent {
  id: string;
  kind: string;
  at: string;
  actor: StaffRef | null;
  channel: 'web' | 'bot' | null;
  body: string | null;
  data: Record<string, unknown>;
  /** The day it happened, when someone said it wasn't the day it was written (PLAN M5). */
  happenedOn: string | null;
}

export interface PersonPage {
  person: PersonDetail;
  timeline: TimelineEvent[];
  tombstones: string[];
}

export interface Today {
  mine: PersonSummary[];
  unassigned: PersonSummary[];
  counts: { mine: number; unassigned: number; bandeja: number };
}

export interface PeoplePage {
  people: PersonSummary[];
  next: string | null;
}

export type Board = Partial<Record<Stage, { count: number; people: PersonSummary[] }>>;

export interface Candidate {
  personId: string;
  name: string | null;
  stage: Stage | null;
  owner: string | null;
  exact: boolean;
}

export interface BandejaItem {
  id: string;
  source: string;
  status: 'review' | 'conflict';
  name: string | null;
  province: string | null;
  town: string | null;
  reportedBy: string | null;
  createdAt: string;
  candidates: PersonSummary[];
  person: PersonSummary | null;
  conflicts: Record<string, unknown>;
}

export interface ImportRun {
  id: string;
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  /** Who ran it: a staff member, an id, or null for the scheduled sync. */
  startedBy: StaffRef | string | null;
  counts: Record<string, number>;
}

export interface Imports {
  imports: ImportRun[];
  airtable: { configured: boolean; lastRun: ImportRun | null };
}

export interface Settings {
  followUpDays: number;
  unresponsiveAttempts: number;
  unresponsiveDays: number;
  unassignedAlertHours: number;
  matchThreshold: number;
  teamPostDays: number;
  communityChats: string[];
}

export interface TelegramLinkState {
  configured: boolean;
  linked: boolean;
  botUsername: string | null;
}

// Its own, not @/data's: these parsers run in the browser too, and @/data reaches the API over node:http.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): value is string => typeof value === 'string';

/** A string, or null for null or a field the API left out; undefined (not valid) for anything else. */
const nullable = (value: unknown): string | null | undefined =>
  value === undefined || value === null ? null : str(value) ? value : undefined;

const strings = (value: unknown): string[] | undefined =>
  value === undefined || value === null
    ? []
    : Array.isArray(value) && value.every(str)
      ? value
      : undefined;

/** A list whose every item parses, or undefined. */
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

export const parseStaffRef = (value: unknown): StaffRef | undefined =>
  isRecord(value) && str(value.userId) && str(value.displayName)
    ? { userId: value.userId, displayName: value.displayName }
    : undefined;

const nullableRef = (value: unknown): StaffRef | null | undefined =>
  value === undefined || value === null ? null : parseStaffRef(value);

/** A staff member as a field may give one: their reference, their id, or nobody. */
const refOrId = (value: unknown): StaffRef | string | null | undefined =>
  value === undefined || value === null ? null : str(value) ? value : parseStaffRef(value);

const summaryFields = (value: Record<string, unknown>) => {
  // Null for someone without a name; an older API sent only `name`.
  const fullName = nullable(value.fullName === undefined ? value.name : value.fullName);
  const name = value.name === undefined ? fullName : nullable(value.name);
  const owner = nullableRef(value.owner);
  const province = nullable(value.province);
  const nextAction = nullable(value.nextAction);
  const nextActionDue = nullable(value.nextActionDue);
  const reasons = strings(value.reasons);
  const arrivedOn = nullable(value.arrivedOn);
  const summary = nullable(value.summary);
  const missing = strings(value.missing);
  // Linked to a team account (PLAN M5, step 5); an older API sent nothing.
  const team = parseStaffRef(value.team);
  const arrival =
    isRecord(value.arrival) && str(value.arrival.id) && str(value.arrival.label)
      ? { id: value.arrival.id, label: value.arrival.label }
      : null;
  if (
    !str(value.id) ||
    name === undefined ||
    fullName === undefined ||
    !isStage(value.stage) ||
    owner === undefined ||
    province === undefined ||
    nextAction === undefined ||
    nextActionDue === undefined ||
    reasons === undefined ||
    arrivedOn === undefined ||
    summary === undefined ||
    missing === undefined
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name,
    fullName,
    stage: value.stage,
    owner,
    province,
    nextAction,
    nextActionDue,
    reasons,
    inCommunity: value.inCommunity === true,
    arrivedOn,
    arrival,
    createdAt: str(value.createdAt) ? value.createdAt : '',
    summary,
    // A detail this app doesn't know yet is left out rather than shown as a key.
    missing: missing.filter(isMissingDetail),
    team: team ? { ...team, active: isRecord(value.team) && value.team.active === true } : null,
  };
};

export const parseSummary = (value: unknown): PersonSummary | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const fields = summaryFields(value);
  const sources = strings(value.sources);
  return fields && sources ? { ...fields, sources } : undefined;
};

const IDENTITY_KINDS: readonly unknown[] = ['email', 'phone', 'discord', 'airtable'];

const parseIdentity = (value: unknown): Identity | undefined =>
  isRecord(value) && str(value.id) && IDENTITY_KINDS.includes(value.kind) && str(value.value)
    ? {
        id: value.id,
        kind: value.kind as Identity['kind'],
        value: value.value,
        verified: value.verified === true,
        source: str(value.source) ? value.source : '',
      }
    : undefined;

const parsePresence = (value: unknown): Presence | undefined => {
  if (!isRecord(value) || !str(value.id)) {
    return undefined;
  }
  const joinedOn = nullable(value.joinedOn);
  const leftOn = nullable(value.leftOn);
  const chat = nullable(value.chat);
  return joinedOn === undefined || leftOn === undefined || chat === undefined
    ? undefined
    : { id: value.id, joinedOn, leftOn, chat };
};

const parseSource = (value: unknown): PersonSource | undefined => {
  if (str(value)) {
    return { source: value, firstSeenAt: null, reportedBy: null };
  }
  if (!isRecord(value) || !str(value.source)) {
    return undefined;
  }
  const firstSeenAt = nullable(value.firstSeenAt);
  const reportedBy = refOrId(value.reportedBy);
  return firstSeenAt === undefined || reportedBy === undefined
    ? undefined
    : { source: value.source, firstSeenAt, reportedBy };
};

const parsePersonOption = (value: unknown): PersonOption | undefined =>
  isRecord(value) &&
  str(value.id) &&
  (value.kind === 'skill' || value.kind === 'interest') &&
  str(value.label)
    ? { id: value.id, kind: value.kind, label: value.label }
    : undefined;

const parseConsent = (value: unknown): Consent | null | undefined => {
  if (value === undefined || value === null) {
    return null;
  }
  return isRecord(value) && typeof value.granted === 'boolean' && str(value.at)
    ? {
        granted: value.granted,
        at: value.at,
        wordingVersion: str(value.wordingVersion) ? value.wordingVersion : '',
      }
    : undefined;
};

/** The latest consent of each kind, or null for one never asked; undefined for an answer that isn't one. */
export const parseConsents = (value: unknown): Record<ConsentKind, Consent | null> | undefined => {
  const source = isRecord(value) ? value : {};
  if (value !== undefined && value !== null && !isRecord(value)) {
    return undefined;
  }
  const email = parseConsent(source.email);
  const whatsapp = parseConsent(source.whatsapp);
  const privacy = parseConsent(source.privacy);
  return email === undefined || whatsapp === undefined || privacy === undefined
    ? undefined
    : { email, whatsapp, privacy };
};

export const parseDetail = (value: unknown): PersonDetail | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const fields = summaryFields(value);
  const preferredName = nullable(value.preferredName);
  const town = nullable(value.town);
  const languages = strings(value.languages);
  const pronouns = nullable(value.pronouns);
  const availability = nullable(value.availability);
  const howHeard = nullable(value.howHeard);
  const profileCompletedAt = nullable(value.profileCompletedAt);
  const mergedInto = nullable(value.mergedInto);
  const identities = value.identities === undefined ? [] : every(value.identities, parseIdentity);
  const presence = value.presence === undefined ? [] : every(value.presence, parsePresence);
  const sources = value.sources === undefined ? [] : every(value.sources, parseSource);
  const whatsapp = nullable(value.whatsapp);
  const options = value.options === undefined ? [] : every(value.options, parsePersonOption);
  const skillsOther = nullable(value.skillsOther);
  const interestsOther = nullable(value.interestsOther);
  const consents = parseConsents(value.consents);
  const anonymisedAt = nullable(value.anonymisedAt);
  if (
    options === undefined ||
    skillsOther === undefined ||
    interestsOther === undefined ||
    consents === undefined ||
    anonymisedAt === undefined
  ) {
    return undefined;
  }
  if (
    !fields ||
    preferredName === undefined ||
    town === undefined ||
    languages === undefined ||
    pronouns === undefined ||
    availability === undefined ||
    howHeard === undefined ||
    profileCompletedAt === undefined ||
    mergedInto === undefined ||
    identities === undefined ||
    presence === undefined ||
    sources === undefined ||
    whatsapp === undefined
  ) {
    return undefined;
  }
  return {
    ...fields,
    preferredName,
    town,
    languages,
    pronouns,
    availability,
    howHeard,
    profileCompletedAt,
    mergedInto,
    identities,
    presence,
    sources,
    whatsapp,
    options,
    skillsOther,
    interestsOther,
    consents,
    anonymisedAt,
  };
};

export const parseEvent = (value: unknown): TimelineEvent | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.kind) || !str(value.at)) {
    return undefined;
  }
  const actor = nullableRef(value.actor);
  const body = nullable(value.body);
  const happenedOn = nullable(value.happenedOn);
  if (actor === undefined || body === undefined || happenedOn === undefined) {
    return undefined;
  }
  return {
    id: value.id,
    kind: value.kind,
    at: value.at,
    actor,
    channel: value.channel === 'web' || value.channel === 'bot' ? value.channel : null,
    body,
    data: isRecord(value.data) ? value.data : {},
    happenedOn,
  };
};

/** `GET /api/arrival-channels`'s body: the list, in its order. */
export const parseArrivalChannels = (body: unknown): ArrivalChannel[] | undefined =>
  isRecord(body)
    ? every(body.channels, (value) =>
        isRecord(value) &&
        str(value.id) &&
        str(value.label) &&
        typeof value.active === 'boolean' &&
        typeof value.position === 'number'
          ? {
              id: value.id,
              key: str(value.key) ? value.key : null,
              label: value.label,
              active: value.active,
              position: value.position,
            }
          : undefined,
      )
    : undefined;

const isPurpose = (value: unknown): value is MessagePurpose =>
  (MESSAGE_PURPOSES as readonly unknown[]).includes(value);

/** `GET /api/message-templates`'s body: every message, by purpose, those in use first. */
export const parseMessageTemplates = (body: unknown): MessageTemplate[] | undefined =>
  isRecord(body)
    ? every(body.templates, (value) => {
        if (
          !isRecord(value) ||
          !str(value.id) ||
          !isPurpose(value.purpose) ||
          !str(value.title) ||
          !str(value.body) ||
          typeof value.active !== 'boolean' ||
          typeof value.version !== 'number' ||
          !str(value.updatedAt)
        ) {
          return undefined;
        }
        const bodyNameless = nullable(value.bodyNameless);
        const updatedBy = value.updatedBy === null ? null : parseStaffRef(value.updatedBy);
        return bodyNameless === undefined || updatedBy === undefined
          ? undefined
          : {
              id: value.id,
              purpose: value.purpose,
              title: value.title,
              body: value.body,
              bodyNameless,
              active: value.active,
              version: value.version,
              updatedAt: value.updatedAt,
              updatedBy,
            };
      })
    : undefined;

/** `GET /api/people/:id`'s body. */
export const parsePersonPage = (body: unknown): PersonPage | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const person = parseDetail(body.person);
  const timeline = body.timeline === undefined ? [] : every(body.timeline, parseEvent);
  const tombstones = strings(body.tombstones);
  return person && timeline && tombstones ? { person, timeline, tombstones } : undefined;
};

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** `GET /api/today`'s body. */
export const parseToday = (body: unknown): Today | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const mine = every(body.mine, parseSummary);
  const unassigned = every(body.unassigned, parseSummary);
  const counts = isRecord(body.counts) ? body.counts : {};
  return mine && unassigned
    ? {
        mine,
        unassigned,
        counts: {
          mine: isRecord(body.counts) ? count(counts.mine) : mine.length,
          unassigned: isRecord(body.counts) ? count(counts.unassigned) : unassigned.length,
          bandeja: count(counts.bandeja),
        },
      }
    : undefined;
};

/** `GET /api/people`'s body. */
export const parsePeople = (body: unknown): PeoplePage | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const people = every(body.people, parseSummary);
  const next = nullable(body.next);
  return people && next !== undefined ? { people, next } : undefined;
};

/** `GET /api/board`'s body. */
export const parseBoard = (body: unknown): Board | undefined => {
  if (!isRecord(body) || !isRecord(body.stages)) {
    return undefined;
  }
  const board: Board = {};
  for (const [stage, column] of Object.entries(body.stages)) {
    if (!isStage(stage) || !isRecord(column)) {
      return undefined;
    }
    const people = every(column.people, parseSummary);
    if (!people) {
      return undefined;
    }
    board[stage] = {
      count: typeof column.count === 'number' ? column.count : people.length,
      people,
    };
  }
  return board;
};

const ownerName = (value: unknown): string | null =>
  str(value) ? value : (parseStaffRef(value)?.displayName ?? null);

const parseCandidate = (value: unknown): Candidate | undefined =>
  isRecord(value) && str(value.personId) && (str(value.name) || value.name === null)
    ? {
        personId: value.personId,
        name: value.name,
        stage: isStage(value.stage) ? value.stage : null,
        owner: ownerName(value.owner),
        exact: value.exact === true,
      }
    : undefined;

/** `GET /api/candidates`'s body. */
export const parseCandidates = (body: unknown): Candidate[] | undefined =>
  isRecord(body) ? every(body.candidates, parseCandidate) : undefined;

const parseBandejaItem = (value: unknown): BandejaItem | undefined => {
  if (
    !isRecord(value) ||
    !str(value.id) ||
    (value.status !== 'review' && value.status !== 'conflict')
  ) {
    return undefined;
  }
  const name = nullable(value.name);
  const province = nullable(value.province);
  const town = nullable(value.town);
  const candidates = value.candidates === undefined ? [] : every(value.candidates, parseSummary);
  const person =
    value.person === undefined || value.person === null ? null : parseSummary(value.person);
  if (
    name === undefined ||
    province === undefined ||
    town === undefined ||
    candidates === undefined ||
    person === undefined
  ) {
    return undefined;
  }
  return {
    id: value.id,
    source: str(value.source) ? value.source : '',
    status: value.status,
    name,
    province,
    town,
    reportedBy: ownerName(value.reportedBy),
    createdAt: str(value.createdAt) ? value.createdAt : '',
    candidates,
    person,
    conflicts: isRecord(value.conflicts) ? value.conflicts : {},
  };
};

/** `GET /api/bandeja`'s body. */
export const parseBandeja = (body: unknown): BandejaItem[] | undefined =>
  isRecord(body) ? every(body.items, parseBandejaItem) : undefined;

/** A run's counts: the numbers only (an import's id, say, is no count). */
export const countsOf = (value: unknown): Record<string, number> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, number] =>
            typeof entry[1] === 'number' && Number.isFinite(entry[1]),
        ),
      )
    : {};

export const parseImportRun = (value: unknown): ImportRun | undefined => {
  if (!isRecord(value) || !str(value.id) || !str(value.startedAt)) {
    return undefined;
  }
  const finishedAt = nullable(value.finishedAt);
  const startedBy = refOrId(value.startedBy);
  return finishedAt === undefined || startedBy === undefined
    ? undefined
    : {
        id: value.id,
        kind: str(value.kind) ? value.kind : '',
        startedAt: value.startedAt,
        finishedAt,
        startedBy,
        counts: countsOf(value.counts),
      };
};

/** `GET /api/imports`'s body. */
export const parseImports = (body: unknown): Imports | undefined => {
  if (!isRecord(body)) {
    return undefined;
  }
  const imports = every(body.imports, parseImportRun);
  const airtable = isRecord(body.airtable) ? body.airtable : {};
  const lastRun =
    airtable.lastRun === undefined || airtable.lastRun === null
      ? null
      : parseImportRun(airtable.lastRun);
  return imports && lastRun !== undefined
    ? { imports, airtable: { configured: airtable.configured === true, lastRun } }
    : undefined;
};

const SETTINGS_NUMBERS = [
  'followUpDays',
  'unresponsiveAttempts',
  'unresponsiveDays',
  'unassignedAlertHours',
  'matchThreshold',
  'teamPostDays',
] as const;

/** `GET /api/settings`'s body: the settings themselves, or wrapped in `settings`. */
export const parseSettings = (body: unknown): Settings | undefined => {
  const value = isRecord(body) && isRecord(body.settings) ? body.settings : body;
  if (!isRecord(value)) {
    return undefined;
  }
  const numbers: Partial<Record<(typeof SETTINGS_NUMBERS)[number], number>> = {};
  for (const key of SETTINGS_NUMBERS) {
    const raw = value[key];
    const number = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      return undefined;
    }
    numbers[key] = number;
  }
  const chats = strings(value.communityChats);
  return chats
    ? {
        followUpDays: numbers.followUpDays ?? 0,
        unresponsiveAttempts: numbers.unresponsiveAttempts ?? 0,
        unresponsiveDays: numbers.unresponsiveDays ?? 0,
        unassignedAlertHours: numbers.unassignedAlertHours ?? 0,
        matchThreshold: numbers.matchThreshold ?? 0,
        teamPostDays: numbers.teamPostDays ?? 0,
        communityChats: chats,
      }
    : undefined;
};

/** `GET /api/telegram/link`'s body. */
export const parseTelegramLink = (body: unknown): TelegramLinkState | undefined =>
  isRecord(body) && typeof body.configured === 'boolean'
    ? {
        configured: body.configured,
        linked: body.linked === true,
        botUsername: str(body.botUsername) ? body.botUsername : null,
      }
    : undefined;
