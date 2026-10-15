import { fill } from '@/fill';

import type { Consent } from '../types';
import type { CensusLink, CensusOption, OptionKind } from './types';

import { formatInstantDay } from '../format';

/**
 * The census's words and numbers, pure, for the server pages and their client components alike (no message
 * formatter): progress, consents, a census answer's fields, and the order of the options lists.
 */

export interface Progress {
  people: number;
  completed: number;
  /** Whole percent, rounded down, so 100 means everyone. */
  percent: number;
}

export const progressOf = ({
  people,
  completed,
}: {
  people: number;
  completed: number;
}): Progress => {
  const done = Math.min(Math.max(completed, 0), Math.max(people, 0));
  return {
    people: Math.max(people, 0),
    completed: done,
    percent: people > 0 ? Math.floor((done / people) * 100) : 0,
  };
};

/**
 * The progress as a bar of text, for the eye (the sentence beside it says the same in words): filled and empty cells
 * told apart by their shape, never their colour. Someone done always shows a cell; only everyone fills the bar.
 */
export const textBar = (percent: number, cells = 20): string => {
  const filled =
    percent >= 100
      ? cells
      : percent <= 0
        ? 0
        : Math.min(cells - 1, Math.max(1, Math.round((percent / 100) * cells)));
  return `${'█'.repeat(filled)}${'░'.repeat(cells - filled)}`;
};

export interface ConsentWords {
  /** "Sí, desde el {date} (texto {version})" */
  granted: string;
  /** "No, desde el {date} (texto {version})" */
  denied: string;
  never: string;
}

/** A consent in words: yes or no, since when, and which wording; or that nobody ever asked. */
export const consentText = (consent: Consent | null, words: ConsentWords): string =>
  consent === null
    ? words.never
    : fill(consent.granted ? words.granted : words.denied, {
        date: formatInstantDay(consent.at),
        version: consent.wordingVersion || '—',
      });

/** Where a personal link stands. */
export const linkState = (
  link: CensusLink,
  now: Date = new Date(),
): 'used' | 'expired' | 'sent' | 'new' =>
  link.usedAt !== null
    ? 'used'
    : new Date(link.expiresAt).getTime() <= now.getTime()
      ? 'expired'
      : link.sentAt !== null
        ? 'sent'
        : 'new';

export interface LinkWords {
  /** "Enlace creado el {date}" */
  created: string;
  /** "caduca el {date}" */
  expires: string;
  /** "caducó el {date}" */
  expired: string;
  /** "enviado el {date}" */
  sent: string;
  notSent: string;
  /** "usado el {date}" */
  used: string;
}

/** A personal link's life in one line: when it was made, sent, and used or until when it serves. */
export const linkText = (link: CensusLink, words: LinkWords, now: Date = new Date()): string => {
  const on = (template: string, at: string) => fill(template, { date: formatInstantDay(at) });
  const state = linkState(link, now);
  return [
    on(words.created, link.createdAt),
    link.sentAt === null ? words.notSent : on(words.sent, link.sentAt),
    link.usedAt !== null
      ? on(words.used, link.usedAt)
      : on(state === 'expired' ? words.expired : words.expires, link.expiresAt),
  ].join(' · ');
};

export interface AnswerWords {
  /** Each field's label (es.json bandeja.censusFields). */
  fields: Readonly<Record<string, string>>;
  availability: Readonly<Record<string, string>>;
  yes: string;
  no: string;
  unknownOption: string;
}

/** The fields of a census answer that the Bandeja shows, in order; never its email or phone. */
const SHOWN: readonly { key: string; aliases: readonly string[] }[] = [
  { key: 'name', aliases: ['name'] },
  { key: 'preferredName', aliases: ['preferredName', 'preferred_name'] },
  { key: 'province', aliases: ['province'] },
  { key: 'town', aliases: ['town'] },
  { key: 'languages', aliases: ['languages'] },
  { key: 'availability', aliases: ['availability'] },
  { key: 'howHeard', aliases: ['howHeard', 'how_heard'] },
  { key: 'pronouns', aliases: ['pronouns'] },
  { key: 'skills', aliases: [] },
  { key: 'skillsOther', aliases: ['skillsOther', 'skills_other'] },
  { key: 'interests', aliases: [] },
  { key: 'interestsOther', aliases: ['interestsOther', 'interests_other'] },
  { key: 'consentEmail', aliases: ['consentEmail', 'consent_email'] },
  { key: 'consentWhatsapp', aliases: ['consentWhatsapp', 'consent_whatsapp'] },
  { key: 'consentPrivacy', aliases: ['consentPrivacy', 'consent_privacy'] },
  { key: 'wordingVersion', aliases: ['wordingVersion', 'wording_version'] },
];

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : value.trim();
  }
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    return items.length === 0 ? undefined : items.join(', ');
  }
  return undefined;
};

/**
 * A census answer that waits in the Bandeja (the form's own keys, camelCase or as the database keeps them), as rows of
 * label and value in words: options by their labels, availability and consents in words, and nothing of a contact
 * detail, whatever the answer holds.
 */
export const answerRows = (
  answer: Readonly<Record<string, unknown>>,
  options: readonly CensusOption[],
  words: AnswerWords,
): { key: string; label: string; value: string }[] => {
  const chosen = Array.isArray(answer.options)
    ? answer.options.filter((id): id is string => typeof id === 'string')
    : [];
  const labelsOf = (kind: OptionKind): string | undefined => {
    const labels = chosen
      .map((id) => options.find((option) => option.id === id))
      .filter((option) => option === undefined || option.kind === kind)
      .map((option) => option?.label ?? words.unknownOption);
    const known = [...new Set(labels)];
    return known.length === 0 ? undefined : known.join(', ');
  };
  const rows: { key: string; label: string; value: string }[] = [];
  for (const { key, aliases } of SHOWN) {
    const raw = aliases.map((alias) => answer[alias]).find((value) => value !== undefined);
    let value: string | undefined;
    if (key === 'skills') {
      value = chosen.length === 0 ? undefined : labelsOf('skill');
    } else if (key === 'interests') {
      value = chosen.length === 0 ? undefined : labelsOf('interest');
    } else if (key.startsWith('consent')) {
      value = typeof raw === 'boolean' ? (raw ? words.yes : words.no) : undefined;
    } else if (key === 'availability') {
      value = typeof raw === 'string' ? (words.availability[raw] ?? raw) : undefined;
    } else {
      value = text(raw);
    }
    if (value !== undefined) {
      rows.push({ key, label: words.fields[key] ?? key, value });
    }
  }
  return rows;
};

/** A list as shown: by position, then label, inactive ones last within the same position. */
export const sortOptions = (options: readonly CensusOption[]): CensusOption[] =>
  [...options].sort(
    (a, b) =>
      a.position - b.position || a.label.localeCompare(b.label, 'es') || a.id.localeCompare(b.id),
  );

/**
 * Moving an option up or down its list: the list numbered afresh 1…n with the two swapped, and the changes that takes
 * (only the options whose position differs). Nothing for the first moving up or the last moving down.
 */
export const reorder = (
  options: readonly CensusOption[],
  id: string,
  direction: 'up' | 'down',
): { id: string; position: number }[] => {
  const list = sortOptions(options);
  const at = list.findIndex((option) => option.id === id);
  const to = direction === 'up' ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= list.length) {
    return [];
  }
  const moved = [...list];
  const [item] = moved.splice(at, 1);
  if (!item) {
    return [];
  }
  moved.splice(to, 0, item);
  return moved
    .map((option, index) => ({ id: option.id, position: index + 1, was: option.position }))
    .filter((option) => option.position !== option.was)
    .map(({ id: changed, position }) => ({ id: changed, position }));
};
