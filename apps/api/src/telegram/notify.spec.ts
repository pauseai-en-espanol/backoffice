import { describe, expect, it } from 'vitest';

import type { Keyboard, TelegramClient } from './client.js';
import type { BotStore, TeamCard } from './store.js';

import { TelegramError } from './client.js';
import { createTeamNotifier } from './notify.js';
import { headerMatches } from './webhook.js';

const CHAT = -1_001_234;
const ORIGIN = 'https://backoffice.example.test';
const PERSON = '0190f8c4-0000-7000-8000-0000000003a1';

const card: TeamCard = {
  personId: PERSON,
  name: 'Ana Ejemplo',
  province: 'Provincia de ejemplo',
  sources: ['airtable', 'telegram'],
  stage: 'new',
  ownerName: null,
};

const setup = ({ failSend = false, tooOld = false, nameless = false } = {}) => {
  const posts = new Map<string, number | null>();
  let current: TeamCard = nameless ? { ...card, name: null } : card;
  const sent: { text: string; keyboard?: Keyboard | undefined }[] = [];
  const edited: { messageId: number; text: string; keyboard?: Keyboard | undefined }[] = [];
  const deleted: number[] = [];
  const store = {
    teamCard: async () => current,
    teamUnposted: async () => [PERSON, '0190f8c4-0000-7000-8000-0000000003a2'],
    reservePost: async (personId: string) => {
      if (posts.has(personId)) {
        return false;
      }
      posts.set(personId, null);
      return true;
    },
    recordPost: async (personId: string, _chat: number, messageId: number) =>
      void posts.set(personId, messageId),
    releasePost: async (personId: string) => void posts.delete(personId),
    posts: async (personId: string) => {
      const messageId = posts.get(personId);
      return messageId ? [{ chatId: CHAT, messageId }] : [];
    },
    forgetPosts: async (personIds: readonly string[]) => {
      for (const personId of personIds) {
        posts.delete(personId);
      }
    },
  } as unknown as BotStore;
  const client = {
    sendMessage: async (_chat: number, text: string, options: { keyboard?: Keyboard } = {}) => {
      if (failSend) {
        throw new TelegramError('sendMessage', 403, 'Forbidden: bot was kicked from the group');
      }
      sent.push({ text, keyboard: options.keyboard });
      return 77;
    },
    editMessageText: async (
      _chat: number,
      messageId: number,
      text: string,
      options: { keyboard?: Keyboard } = {},
    ) => void edited.push({ messageId, text, keyboard: options.keyboard }),
    deleteMessage: async (_chat: number, messageId: number) => {
      if (tooOld) {
        return false;
      }
      deleted.push(messageId);
      return true;
    },
  } as unknown as TelegramClient;
  const errors: unknown[] = [];
  const notifier = createTeamNotifier({
    store,
    client,
    chatId: CHAT,
    staffOrigin: ORIGIN,
    onError: (e) => errors.push(e),
  });
  return {
    notifier,
    sent,
    edited,
    deleted,
    posts,
    errors,
    claim: (owner: string) => {
      current = { ...card, ownerName: owner };
    },
  };
};

describe('the team group', () => {
  it('posts an arrival once, with its name, sources and province, a claim button and a link', async () => {
    const team = setup();
    await team.notifier.arrival(PERSON);
    await team.notifier.arrival(PERSON);
    expect(team.sent).toEqual([
      {
        text: 'Nueva llegada: Ana Ejemplo\nFuente: Formulario de PauseAI Global, Bot de Telegram\nProvincia: Provincia de ejemplo',
        keyboard: [
          [
            { text: 'Me lo quedo', data: `claim:${PERSON}` },
            { text: 'Abrir', url: `${ORIGIN}/personas/${PERSON}` },
          ],
        ],
      },
    ]);
    expect(team.posts.get(PERSON)).toBe(77);
  });

  it('posts someone saved with only a phone as «Sin nombre» (PLAN R37)', async () => {
    const team = setup({ nameless: true });
    await team.notifier.arrival(PERSON);
    expect(team.sent[0]?.text).toMatch(/^Nueva llegada: Sin nombre\n/u);
  });

  it('shows who took someone, and drops the claim button', async () => {
    const team = setup();
    await team.notifier.arrival(PERSON);
    team.claim('Luis Ejemplo');
    await team.notifier.claimed(PERSON);
    expect(team.edited).toEqual([
      {
        messageId: 77,
        text: expect.stringContaining('Se encarga: Luis Ejemplo'),
        keyboard: [[{ text: 'Abrir', url: `${ORIGIN}/personas/${PERSON}` }]],
      },
    ]);
  });

  it('deletes the posts about someone erased, or blanks them once too old to delete, and forgets them', async () => {
    const fresh = setup();
    await fresh.notifier.arrival(PERSON);
    await fresh.notifier.erased([PERSON]);
    expect(fresh.deleted).toEqual([77]);
    expect(fresh.posts.size).toBe(0);
    const old = setup({ tooOld: true });
    await old.notifier.arrival(PERSON);
    await old.notifier.erased([PERSON]);
    expect(old.edited).toEqual([
      {
        messageId: 77,
        text: 'Persona anonimizada: sus datos se han borrado.',
        keyboard: undefined,
      },
    ]);
    expect(old.posts.size).toBe(0);
  });

  it('sweeps what is not posted yet, and stops at the first refusal, leaving it to try again', async () => {
    const team = setup({ failSend: true });
    expect(await team.notifier.sweep()).toBe(0);
    expect(team.errors).toHaveLength(1);
    expect(team.posts.size).toBe(0);
  });
});

describe('the webhook secret', () => {
  it('matches only the exact value, once', () => {
    expect(headerMatches('un-secreto', 'un-secreto')).toBe(true);
    expect(headerMatches('un-secreto ', 'un-secreto')).toBe(false);
    expect(headerMatches(undefined, 'un-secreto')).toBe(false);
    expect(headerMatches(['un-secreto', 'un-secreto'], 'un-secreto')).toBe(false);
  });
});
