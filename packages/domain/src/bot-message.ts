import { normalizeEmail, normalizePhone } from './identities.js';

/**
 * What the Telegram bot is told (ADR-0004): a command, or a free message that may be an arrival to report. Pure, so
 * every way people write is tested here; the API decides what to ask next.
 */

export const COMMANDS = [
  'start',
  'alta',
  'baja',
  'mios',
  'libres',
  'buscar',
  'sincronizar',
  'ayuda',
  'cancelar',
] as const;
export type Command = (typeof COMMANDS)[number];

export interface ParsedCommand {
  command: Command;
  /** What follows the command, trimmed; empty when nothing does. */
  args: string;
}

/**
 * A command, as Telegram sends one: `/alta`, `/alta@NombreDelBot`, then anything. Case doesn't matter. Undefined for a
 * message that isn't one of ours.
 */
export const parseCommand = (text: string): ParsedCommand | undefined => {
  const trimmed = text.trim();
  const match = /^\/([a-z]+)(?:@\w+)?(?=\s|$)/iu.exec(trimmed);
  const name = match?.[1]?.toLowerCase();
  if (!match || !name || !(COMMANDS as readonly string[]).includes(name)) {
    return undefined;
  }
  return { command: name as Command, args: trimmed.slice(match[0].length).trim() };
};

/** An arrival as the bot read it from one message: what it found, which the reporter then confirms or completes. */
export interface ArrivalDraft {
  name?: string;
  phones: string[];
  emails: string[];
  chat?: string;
  note?: string;
  /** Whether the message held a phone number or an email: then it is deleted once the arrival is saved. */
  hadContactDetails: boolean;
}

const EMAIL_IN_TEXT = /[^\s@<>"(),;:]+@[^\s@<>"(),;:.]+(?:\.[^\s@<>"(),;:.]+)+/gu;
// A run of digits as people write a phone number: an optional `+` or `00`, then digits with spaces, dots, dashes or
// brackets between them, on one line.
const PHONE_IN_TEXT = /(?:\+|\b00)?\(?\d[\d \t().-]{6,18}\d/gu;
const LABELLED = /^(chat|grupo|comunidad|nota|note|comentario) ?[:=-](.*)$/iu;
// A name: letters (any script), spaces, hyphens, apostrophes and dots, one to six words.
const NAME = /^\p{L}[\p{L}\p{M}'’.-]*(?: \p{L}[\p{L}\p{M}'’.-]*){0,5}$/u;

const unique = (values: string[]): string[] => [...new Set(values)];

/**
 * Reads an arrival from free text, the way people report one: a name, a phone number or an email, maybe the chat they
 * joined and a note, on one line or several, with `chat:` and `nota:` labels or without. The first line that is only a
 * name is the name; labelled lines are the chat and the note; anything else left over is the note. Numbers that
 * aren't valid phone numbers stay in the note.
 */
export const parseArrival = (text: string): ArrivalDraft => {
  const emails: string[] = [];
  const phones: string[] = [];
  let rest = text.replace(EMAIL_IN_TEXT, (found) => {
    const email = normalizeEmail(found);
    if (email) {
      emails.push(email);
      return ' ';
    }
    return found;
  });
  rest = rest.replace(PHONE_IN_TEXT, (found) => {
    const phone = normalizePhone(found);
    if (phone) {
      phones.push(phone);
      return ' ';
    }
    return found;
  });

  let name: string | undefined;
  let chat: string | undefined;
  const notes: string[] = [];
  for (const raw of rest.split(/\n+/u)) {
    const line = raw
      .replaceAll(/\s+/gu, ' ')
      .trim()
      .replace(/^[,;.\s]+|[,;\s]+$/gu, '');
    if (line === '') {
      continue;
    }
    const labelled = LABELLED.exec(line);
    if (labelled) {
      const value = (labelled[2] ?? '').trim();
      if (value !== '') {
        if (/^(?:chat|grupo|comunidad)$/iu.test(labelled[1] ?? '')) {
          chat = value;
        } else {
          notes.push(value);
        }
      }
      continue;
    }
    if (name === undefined) {
      // "Ana García, del grupo de Madrid": the name is what comes before the first comma or full stop.
      const [head = '', ...tail] = line.split(/[,;]|\.\s/u);
      const candidate = head.trim();
      if (NAME.test(candidate) && candidate.length <= 80) {
        name = candidate;
        const remainder = tail.join(',').trim();
        if (remainder !== '') {
          notes.push(remainder);
        }
        continue;
      }
    }
    notes.push(line);
  }
  const note = notes.join('. ').trim();
  return {
    ...(name === undefined ? {} : { name }),
    phones: unique(phones),
    emails: unique(emails),
    ...(chat === undefined ? {} : { chat }),
    ...(note === '' ? {} : { note }),
    hadContactDetails: phones.length > 0 || emails.length > 0,
  };
};

/** Whether a free message looks like an arrival to report: it holds a phone number or an email. */
export const looksLikeArrival = (text: string): boolean => parseArrival(text).hadContactDetails;
