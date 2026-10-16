import type { AttentionReason, Stage } from '@backoffice/domain/stages';

import { getTranslator } from '@backoffice/i18n/messages';

import type { Keyboard } from './client.js';
import type { Arrival, Candidate, PersonLine, TeamCard } from './store.js';

/**
 * What the bot says (ADR-0004), in Spanish, from packages/i18n. Every text here is built from names, stages, owners,
 * reasons and counts, never from a phone number or an email: the bot never repeats contact details (bot.spec.ts checks
 * every reply).
 */
const t = getTranslator();

export const BUTTON_DATA = {
  altaNew: 'alta:new',
  altaCancel: 'alta:cancel',
  altaNoContact: 'alta:nocontact',
  altaAttach: (personId: string) => `alta:attach:${personId}`,
  bajaPick: (personId: string) => `baja:pick:${personId}`,
  bajaYes: (personId: string) => `baja:yes:${personId}`,
  bajaNo: 'baja:no',
  claim: (personId: string) => `claim:${personId}`,
} as const;

export const personLink = (staffOrigin: string, personId: string): string =>
  `${staffOrigin}/personas/${personId}`;

export const stageLabel = (stage: Stage): string => t(`stages.${stage}`);

export const reasonsLabel = (reasons: readonly AttentionReason[]): string =>
  reasons.map((reason) => t(`attention.${reason}`)).join(', ');

const ownerLabel = (ownerName: string | null): string => ownerName ?? t('bot.unassigned');

/** A person's name as the bot says it: "Sin nombre" for someone saved with only a phone or an email (PLAN R37). */
export const nameOf = (name: string | null | undefined): string =>
  name?.trim() || t('people.noName');

/** The arrival in a few words: its name, whether it has a phone or an email (never which), the chat. */
export const arrivalWho = (arrival: Arrival & { noContact?: boolean | undefined }): string => {
  const phone = arrival.phones.length > 0;
  const email = arrival.emails.length > 0;
  const contact =
    phone && email
      ? t('bot.alta.withBoth')
      : phone
        ? t('bot.alta.withPhone')
        : email
          ? t('bot.alta.withEmail')
          : t('bot.alta.withoutContact');
  return [
    `${arrival.name?.trim() || t('bot.alta.nameless')} (${contact})`,
    ...(arrival.chat ? [t('bot.alta.fromChat', { chat: arrival.chat })] : []),
  ].join(', ');
};

export const confirmArrival = (arrival: Arrival): { text: string; keyboard: Keyboard } => ({
  text: t('bot.alta.confirm', { who: arrivalWho(arrival) }),
  keyboard: [
    [
      { text: t('bot.alta.save'), data: BUTTON_DATA.altaNew },
      { text: t('bot.alta.cancel'), data: BUTTON_DATA.altaCancel },
    ],
  ],
});

export const offerCandidates = (
  arrival: Arrival,
  candidates: readonly Candidate[],
): { text: string; keyboard: Keyboard } => ({
  text: arrival.name?.trim()
    ? t('bot.alta.candidates', { who: arrivalWho(arrival) })
    : t('bot.alta.candidatesNameless'),
  keyboard: [
    ...candidates.map((candidate) => [
      {
        text: t('bot.alta.candidate', {
          name: nameOf(candidate.name),
          stage: stageLabel(candidate.stage),
          owner: ownerLabel(candidate.ownerName),
        }),
        data: BUTTON_DATA.altaAttach(candidate.personId),
      },
    ]),
    [
      { text: t('bot.alta.isNew'), data: BUTTON_DATA.altaNew },
      { text: t('bot.alta.cancel'), data: BUTTON_DATA.altaCancel },
    ],
  ],
});

export const askContact = (): { text: string; keyboard: Keyboard } => ({
  text: t('bot.alta.askContact'),
  keyboard: [[{ text: t('bot.alta.noContact'), data: BUTTON_DATA.altaNoContact }]],
});

export const mineList = (staffOrigin: string, people: readonly PersonLine[]): string =>
  people.length === 0
    ? t('bot.mine.none')
    : [
        t('bot.mine.title', { count: people.length }),
        ...people.map((person) =>
          t('bot.mine.line', {
            name: nameOf(person.name),
            reasons: reasonsLabel(person.reasons),
            link: personLink(staffOrigin, person.personId),
          }),
        ),
      ].join('\n');

export const searchList = (staffOrigin: string, people: readonly PersonLine[]): string =>
  people.length === 0
    ? t('bot.search.none')
    : [
        t('bot.search.title', { count: people.length }),
        ...people.map((person) =>
          t('bot.search.line', {
            name: nameOf(person.name),
            stage: stageLabel(person.stage),
            owner: ownerLabel(person.ownerName),
            link: personLink(staffOrigin, person.personId),
          }),
        ),
      ].join('\n');

/** The unassigned queue, a button each (at most ten: the rest in the web app). */
export const freeList = (people: readonly PersonLine[]): { text: string; keyboard?: Keyboard } =>
  people.length === 0
    ? { text: t('bot.free.none') }
    : {
        text: t('bot.free.title', { count: people.length }),
        keyboard: people.slice(0, 10).map((person) => [
          {
            text: t('bot.free.claim', { name: nameOf(person.name) }),
            data: BUTTON_DATA.claim(person.personId),
          },
        ]),
      };

export const leaveOptions = (
  people: readonly PersonLine[],
): { text: string; keyboard: Keyboard } => ({
  text: t('bot.baja.pick'),
  keyboard: [
    ...people.slice(0, 10).map((person) => [
      {
        text: t('bot.baja.option', { name: nameOf(person.name), stage: stageLabel(person.stage) }),
        data: BUTTON_DATA.bajaPick(person.personId),
      },
    ]),
    [{ text: t('bot.alta.cancel'), data: BUTTON_DATA.bajaNo }],
  ],
});

export const confirmLeave = (person: PersonLine): { text: string; keyboard: Keyboard } => ({
  text: t('bot.baja.confirm', { name: nameOf(person.name) }),
  keyboard: [
    [
      { text: t('bot.baja.yes'), data: BUTTON_DATA.bajaYes(person.personId) },
      { text: t('bot.baja.no'), data: BUTTON_DATA.bajaNo },
    ],
  ],
});

/** A post in the team group: who arrived and from where, and who took them once someone did. */
/** What a team post about someone erased becomes when it can no longer be deleted: no name, no buttons. */
export const teamPostErased = (): string => t('bot.team.erased');

export const teamPost = (
  staffOrigin: string,
  card: TeamCard,
): { text: string; keyboard: Keyboard } => ({
  text: [
    t('bot.team.arrival', {
      name: nameOf(card.name),
      sources: card.sources.map((source) => t(`sources.${source as 'manual'}`)).join(', '),
    }),
    ...(card.province ? [t('bot.team.province', { province: card.province })] : []),
    ...(card.ownerName ? [t('bot.team.claimedBy', { owner: card.ownerName })] : []),
  ].join('\n'),
  keyboard: [
    [
      ...(card.ownerName
        ? []
        : [{ text: t('bot.team.claim'), data: BUTTON_DATA.claim(card.personId) }]),
      { text: t('bot.team.open'), url: personLink(staffOrigin, card.personId) },
    ],
  ],
});

export const syncDone = (counts: Record<string, unknown>): string => {
  const count = (key: string) => (typeof counts[key] === 'number' ? counts[key] : 0);
  return counts.skipped === true
    ? t('bot.sync.running')
    : t('bot.sync.done', {
        created: count('created'),
        attached: count('attached') + count('conflict') + count('unchanged') + count('updated'),
        review: count('review'),
      });
};

export const digest = (
  staffOrigin: string,
  mine: readonly PersonLine[],
  summary: { unassigned: number; arrivedYesterday: number },
): string =>
  [
    t('bot.digest.title'),
    ...(mine.length > 0
      ? [
          '',
          t('bot.digest.mine', { count: mine.length }),
          ...mine.map((person) =>
            t('bot.digest.line', {
              name: nameOf(person.name),
              reasons: reasonsLabel(person.reasons),
            }),
          ),
        ]
      : []),
    '',
    t('bot.digest.unassigned', { count: summary.unassigned }),
    t('bot.digest.arrived', { count: summary.arrivedYesterday }),
    '',
    t('bot.digest.open', { link: staffOrigin }),
  ].join('\n');

export { t as botText };
