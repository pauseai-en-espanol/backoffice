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

const setup = ({ failSend = false } = {}) => {
  const posts = new Map<string, number | null>();
  let current = card;
  const sent: { text: string; keyboard?: Keyboard | undefined }[] = [];
  const edited: { messageId: number; text: string; keyboard?: Keyboard | undefined }[] = [];
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
