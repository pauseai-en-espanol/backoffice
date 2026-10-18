import { foldName, normalizePhone, spacedPhone } from '@backoffice/domain/identities';
import { realpathSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

import type { Contact, ContactBook } from './google-contacts.js';

/**
 * The WhatsApp group's history (PLAN R56): who joined and who left, and when, read from the group's export ("Export
 * chat", without media), with the numbers of the exporter's Google Contacts, into a CSV for Importar. It runs on the
 * laptop of the admin who made the export (src/whatsapp-history.ts): the chat's messages never leave it, only who was
 * in the group and between which days. Days, not times (Dani, 2026-10-18): the times only order what happened.
 */

export type DateOrder = 'dmy' | 'mdy';

export class ChatError extends Error {
  constructor(readonly reason: 'notAnExport' | 'ambiguousDates' | 'mixedDates') {
    super(reason);
  }
}

/** Something the export says happened to someone, on a day. */
export interface ChatEvent {
  kind: 'joined' | 'left' | 'wrote' | 'changedNumber';
  /** As the export names them: the contact's name on the exporting phone, or the number. */
  who: string;
  /** YYYY-MM-DD. */
  day: string;
}

export interface ParsedChat {
  events: ChatEvent[];
  dateOrder: DateOrder;
  lines: number;
  /** Joins and leaves of the exporter ("added you"), whose own name the export doesn't give. */
  aboutYou: number;
  /** System lines this doesn't know: if any is a join or a leave, it is missing. Counted, never shown. */
  unknown: number;
}

/**
 * A line's start, as Android and iOS write it, in any order of day and month: "10/17/24, 17:31 - …",
 * "17/10/2024 17:31 - …", "17.10.24, 5:31 p. m. - …" or "[17/10/24, 17:31:05] …". A line without it continues the
 * message above.
 */
const STAMP =
  /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4}),?\s\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?(?:\] | - )(.*)$/iu;

/** Direction marks WhatsApp puts around names and system lines. */
const MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

const clean = (text: string): string => text.replaceAll(MARKS, '').trim();

type Said =
  | { kind: 'joined' | 'left' | 'changedNumber'; who: string }
  | { kind: 'joinedList' | 'leftList'; list: string }
  | { kind: 'you' | 'other' };

/** The exporter, in a list of names or as the one it happened to. */
const YOU = new Set(['you', 'ti', 'tu']);

/**
 * The system lines known to say neither a join nor a leave, so the rest can be counted as unknown. Looked for before
 * any ": ", which is where a message's own words begin ("Ana: lo activó Bea" is a message).
 */
const OTHER =
  /end-to-end encrypted|cifrados de extremo a extremo|created group|created this group|creó el grupo|creó este grupo|changed the (?:group|subject)|changed this group['’]s|deleted this group['’]s|cambió el (?:asunto|nombre|icono|ícono)|cambió la (?:descripción|imagen)|eliminó el icono|disappearing messages|mensajes temporales|pinned a message|fijó un mensaje|is now an admin|now an admin|ahora es admin|no longer an admin|ya no es admin|requested to join|solicitó unirse|reset this group['’]s invite link|restableció el enlace|changed the settings|cambió los ajustes|turned (?:on|off)|activó|desactivó/iu;

/** The system lines that say someone joined or left, or that it was the exporter, in English and Spanish: whole lines. */
const SYSTEM: readonly [RegExp, (match: RegExpExecArray) => Said][] = [
  [/^you (?:joined|left|were added|were removed)\b/iu, () => ({ kind: 'you' })],
  [/^(?:te uniste|saliste|te añadieron|te eliminaron)\b/iu, () => ({ kind: 'you' })],
  [/^.+? (?:added|removed) you$/iu, () => ({ kind: 'you' })],
  [/^.+? te (?:añadió|eliminó)$/iu, () => ({ kind: 'you' })],
  [
    /^(?:.+? added|añadiste a|.+? añadió a) (.+?)\.?$/iu,
    (m) => ({ kind: 'joinedList', list: m[1] ?? '' }),
  ],
  [
    /^(?:.+? removed|eliminaste a|.+? eliminó a) (.+?)\.?$/iu,
    (m) => ({ kind: 'leftList', list: m[1] ?? '' }),
  ],
  [
    // "joined using this group's invite link", "joined using a group link." and the like.
    /^(.+) (?:joined (?:using|via) (?:(?:this|the|an|a|your) )?(?:(?:group|community)(?:['’]s)? )?(?:invite )?link|joined from the community|joined|was added|se unió(?: (?:usando|con|mediante) (?:el|un) enlace(?: de invitación)?(?: de (?:este|un|la) (?:grupo|comunidad)| del grupo)?| desde la comunidad)?)\.?$/iu,
    (m) => ({ kind: 'joined', who: m[1] ?? '' }),
  ],
  [/^(.+) (?:left|was removed|salió)\.?$/iu, (m) => ({ kind: 'left', who: m[1] ?? '' })],
  [
    /^(.+?) (?:changed their phone number to a new number\b.*|changed to .+|cambió su número de teléfono\b.*|cambió a .+)$/iu,
    (m) => ({ kind: 'changedNumber', who: m[1] ?? '' }),
  ],
];

const said = (body: string): Said | undefined => {
  if (OTHER.test(body.split(': ', 1)[0] ?? body)) {
    return { kind: 'other' };
  }
  for (const [pattern, read] of SYSTEM) {
    const match = pattern.exec(body);
    if (match) {
      const result = read(match);
      // A name never holds ": ": a line that seems to say one does is a message ("Ana: Bea left").
      const names = 'who' in result ? result.who : 'list' in result ? result.list : '';
      return names.includes(': ') ? undefined : result;
    }
  }
  return undefined;
};

/** The names in "Ana, Bea and Carla" (or "Ana, Bea y Carla"), unless the whole of it is one person's name. */
const namesIn = (list: string, isName: (name: string) => boolean): string[] =>
  isName(list)
    ? [list]
    : list
        .split(/, | and | y /u)
        .map((name) => name.trim())
        .filter((name) => name !== '');

const dayOf = (first: number, second: number, year: number, order: DateOrder): string => {
  const [day, month] = order === 'dmy' ? [first, second] : [second, first];
  const full = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(full, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ChatError('mixedDates');
  }
  return date.toISOString().slice(0, 10);
};

/**
 * Reads an export. The order of day and month comes from the dates themselves (a first number over 12 is a day, a
 * second one is), or from `dateOrder` when every date could be either. `isName` says whether a list of names is one
 * person's name after all ("Ortega y Gasset"): the contacts know.
 */
export const parseChat = (
  text: string,
  {
    dateOrder,
    isName = () => false,
  }: { dateOrder?: DateOrder; isName?: (name: string) => boolean } = {},
): ParsedChat => {
  const lines = text.split(/\r?\n/u);
  const stamped = lines.flatMap((line) => {
    const match = STAMP.exec(line);
    return match
      ? [
          {
            first: Number(match[1]),
            second: Number(match[2]),
            year: Number(match[3]),
            body: match[4] ?? '',
          },
        ]
      : [];
  });
  if (stamped.length === 0) {
    throw new ChatError('notAnExport');
  }
  // Both over 12 somewhere is no order at all: reading the days says so.
  const dayFirst = stamped.some((line) => line.first > 12);
  const monthFirst = stamped.some((line) => line.second > 12);
  const order = dayFirst ? 'dmy' : monthFirst ? 'mdy' : dateOrder;
  if (order === undefined) {
    throw new ChatError('ambiguousDates');
  }

  const events: ChatEvent[] = [];
  let aboutYou = 0;
  let unknown = 0;
  for (const line of stamped) {
    const day = dayOf(line.first, line.second, line.year, order);
    // iOS writes a system line under the group's name, after a direction mark: "Grupo: \u200eAna left".
    const ios = /^[^:]*: \u200e/u.exec(line.body);
    const body = clean(ios ? line.body.slice(ios[0].length) : line.body);
    const system = said(body);
    if (system?.kind === 'joined' || system?.kind === 'left' || system?.kind === 'changedNumber') {
      if (YOU.has(foldName(system.who))) {
        aboutYou += 1;
      } else {
        events.push({ kind: system.kind, who: system.who, day });
      }
    } else if (system?.kind === 'joinedList' || system?.kind === 'leftList') {
      for (const who of namesIn(system.list, isName)) {
        if (YOU.has(foldName(who))) {
          aboutYou += 1;
        } else {
          events.push({ kind: system.kind === 'joinedList' ? 'joined' : 'left', who, day });
        }
      }
    } else if (system?.kind === 'you') {
      aboutYou += 1;
    } else if (system === undefined && !ios && /^[^:]+:(?: |$)/u.test(body)) {
      const at = body.indexOf(':');
      const who = clean(body.slice(0, at));
      // Someone who wrote was in the group; an empty message names nobody ("Unknown: ").
      if (who !== '' && body.slice(at + 1).trim() !== '') {
        events.push({ kind: 'wrote', who, day });
      }
    } else if (system === undefined) {
      unknown += 1;
    }
  }
  return { events, dateOrder: order, lines: lines.length, aboutYou, unknown };
};

/**
 * Whether `path` is `folder` or inside it, links followed: the command reads and writes nothing inside the repository,
 * which is public and keeps no personal data (CLAUDE.md).
 */
export const isInside = (folder: string, path: string): boolean => {
  const where = relative(realpathSync(folder), realpathSync(path));
  return where === '' || (!where.startsWith('..') && !isAbsolute(where));
};

/** A stay in the group: the day it began (null: before the history starts) and the day it ended (null: still in). */
export interface Stay {
  joined: string | null;
  left: string | null;
}

export interface Participant {
  who: string;
  stays: Stay[];
  changedNumber: boolean;
}

/**
 * Each person's stays, in the order the export tells them: a join opens one, a leave closes it (or one begun before
 * the history, when none is open), and writing, or changing their number, while none is open means they were in
 * since before.
 */
export const participantsOf = (events: readonly ChatEvent[]): Participant[] => {
  const byWho = new Map<string, Participant>();
  for (const event of events) {
    const one = byWho.get(event.who) ?? { who: event.who, stays: [], changedNumber: false };
    byWho.set(event.who, one);
    const last = one.stays.at(-1);
    const open = last?.left === null ? last : undefined;
    if (event.kind === 'joined' && !open) {
      one.stays.push({ joined: event.day, left: null });
    } else if (event.kind === 'left') {
      if (open) {
        open.left = event.day;
      } else {
        one.stays.push({ joined: null, left: event.day });
      }
    } else if ((event.kind === 'wrote' || event.kind === 'changedNumber') && !open) {
      one.stays.push({ joined: null, left: null });
    }
    if (event.kind === 'changedNumber') {
      one.changedNumber = true;
    }
  }
  return [...byWho.values()];
};

/** A row for Importar, as its columns read it (onboarding spec, web and CSV). */
export interface HistoryRow {
  name: string;
  phone: string;
  email: string;
  province: string;
  arrivedOn: string;
  joinedOn: string;
  leftOn: string;
  stage: 'Nuevo' | 'Baja';
}

export type UnresolvedReason =
  'notInContacts' | 'severalContacts' | 'noPhoneOrEmail' | 'unreadableNumber' | 'changedNumber';

/** Someone to look at by hand: never in Importar's file but for a changed number, which still goes in. */
export interface Unresolved {
  who: string;
  reason: UnresolvedReason;
  firstJoined: string;
  lastLeft: string;
  stillIn: boolean;
}

/** A number as the export writes one: digits, spaces, a `+`, brackets, dots or dashes, and nothing else. */
const NUMBER = /^\+?[\d\s().-]{7,}$/u;

/**
 * The person's name in a contact's: without the bracketed bits people add ("[Madrid]", "(PauseAI ES)") nor emoji
 * (their variation selectors included). Empty if nothing is left.
 */
export const personName = (contactName: string): string =>
  contactName
    .normalize('NFC')
    .replaceAll(/\[[^\]]*\]|\([^)]*\)/gu, ' ')
    .replaceAll(/[^\p{L}\p{N}\s'’.-]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();

/** The province people write in brackets in a contact's name ("Ana Ejemplo [Madrid]"), if any. */
export const provinceIn = (contactName: string): string =>
  /\[([^\]]+)\]/u.exec(contactName)?.[1]?.trim() ?? '';

interface Found {
  contact?: Contact;
  phone?: string;
  reason?: UnresolvedReason;
}

const find = (who: string, book: ContactBook): Found => {
  if (NUMBER.test(who)) {
    const phone = normalizePhone(who);
    if (phone === undefined) {
      return { reason: 'unreadableNumber' };
    }
    const [contact, ...more] = book.byPhone(phone);
    return more.length === 0 && contact ? { contact, phone } : { phone };
  }
  const [contact, ...more] = book.byName(who);
  if (!contact) {
    return { reason: 'notInContacts' };
  }
  if (more.length > 0) {
    return { reason: 'severalContacts' };
  }
  return contact.phones.length > 0 || contact.emails.length > 0
    ? { contact, ...(contact.phones[0] ? { phone: contact.phones[0] } : {}) }
    : { reason: 'noPhoneOrEmail' };
};

/**
 * Importar's rows, a stay each, for everyone the contacts (or the export itself, by number) give a phone or an email:
 * the name without what people add to contacts, the province in brackets, "Fecha de alta" their first known join
 * (empty when the history begins with them in), "Canal de alta" WhatsApp, and Baja when their last stay has ended,
 * else Nuevo.
 * Whoever can't be found, or can't be told apart, is left for a person to resolve.
 */
export const historyRows = (
  participants: readonly Participant[],
  book: ContactBook,
): { rows: HistoryRow[]; unresolved: Unresolved[] } => {
  const rows: HistoryRow[] = [];
  const unresolved: Unresolved[] = [];
  for (const one of participants) {
    const summary = {
      who: one.who,
      firstJoined: one.stays.find((stay) => stay.joined !== null)?.joined ?? '',
      lastLeft: one.stays.filter((stay) => stay.left !== null).at(-1)?.left ?? '',
      stillIn: one.stays.at(-1)?.left === null,
    };
    const found = find(one.who, book);
    if (found.reason) {
      unresolved.push({ ...summary, reason: found.reason });
      continue;
    }
    if (one.changedNumber) {
      unresolved.push({ ...summary, reason: 'changedNumber' });
    }
    const contactName = found.contact?.names[0] ?? (NUMBER.test(one.who) ? '' : one.who);
    const email = found.contact?.emails[0] ?? '';
    for (const stay of one.stays) {
      rows.push({
        name: personName(contactName),
        phone: found.phone ? spacedPhone(found.phone) : '',
        email,
        province: provinceIn(NUMBER.test(one.who) ? contactName : one.who),
        arrivedOn: one.stays[0]?.joined ?? '',
        joinedOn: stay.joined ?? '',
        leftOn: stay.left ?? '',
        stage: one.stays.at(-1)?.left === null ? 'Nuevo' : 'Baja',
      });
    }
  }
  return { rows, unresolved };
};

/** Words for the person resolving them, in the file they open. */
const REASONS: Readonly<Record<UnresolvedReason, string>> = {
  notInContacts: 'No está en tus contactos con ese nombre',
  severalContacts: 'Varios contactos se llaman así',
  noPhoneOrEmail: 'Su contacto no tiene teléfono ni correo',
  unreadableNumber: 'El número no es válido',
  changedNumber: 'Cambió de número (ya está en el archivo de Importar): comprueba cuál es el bueno',
};

/** CSV as a spreadsheet in Spanish opens it: semicolons, every cell quoted, a byte-order mark for the accents. */
const toCsv = (rows: readonly (readonly string[])[]): string =>
  `\ufeff${rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';')).join('\n')}\n`;

/** Importar's file: its headers are the ones Importar maps by itself. */
export const importCsv = (rows: readonly HistoryRow[]): string =>
  toCsv([
    [
      'Nombre',
      'Teléfono',
      'Correo',
      'Provincia',
      'Fecha de alta',
      'Canal de alta',
      'Entrada al grupo',
      'Salida del grupo',
      'Estado',
    ],
    ...rows.map((row) => [
      row.name,
      row.phone,
      row.email,
      row.province,
      row.arrivedOn,
      'WhatsApp',
      row.joinedOn,
      row.leftOn,
      row.stage,
    ]),
  ]);

/** The file of people to resolve by hand. */
export const unresolvedCsv = (unresolved: readonly Unresolved[]): string =>
  toCsv([
    ['Nombre en WhatsApp', 'Qué pasa', 'Entrada al grupo', 'Salida del grupo', 'Sigue en el grupo'],
    ...unresolved.map((one) => [
      one.who,
      REASONS[one.reason],
      one.firstJoined,
      one.lastLeft,
      one.stillIn ? 'Sí' : 'No',
    ]),
  ]);
