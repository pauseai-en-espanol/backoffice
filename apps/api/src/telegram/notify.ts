import type { TelegramClient } from './client.js';
import type { BotStore } from './store.js';

import { teamPost, teamPostErased } from './replies.js';

/**
 * The team group (D11; ADR-0004, notifications): each arrival is posted there with its name, sources and province,
 * and "Me lo quedo" and "Abrir"; once someone takes it, the post shows who. Never a contact detail.
 */
export interface Notifier {
  /** Someone arrived: post them, unless they were already. */
  arrival(personId: string): Promise<void>;
  /** Someone was taken: show who on their posts. */
  claimed(personId: string): Promise<void>;
  /** Someone was erased (and their merged duplicates): their posts go, or, too old to delete, are blanked. */
  erased(personIds: readonly string[]): Promise<void>;
}

/** Without a team group, nobody is told: the bot works for one person (D11). */
export const noopNotifier: Notifier = {
  arrival: async () => undefined,
  claimed: async () => undefined,
  erased: async () => undefined,
};

export interface TeamNotifier extends Notifier {
  /**
   * Posts every arrival of the last 48 hours not posted yet, from any source: the hourly Airtable sync and CSV
   * imports, which have no bot behind them, included. The API runs it every few minutes. How many it posted.
   */
  sweep(): Promise<number>;
}

export const createTeamNotifier = ({
  store,
  client,
  chatId,
  staffOrigin,
  onError = () => undefined,
}: {
  store: BotStore;
  client: TelegramClient;
  chatId: number;
  staffOrigin: string;
  onError?: (error: unknown) => void;
}): TeamNotifier => {
  const post = async (personId: string): Promise<boolean> => {
    // The row is the claim to post: whoever inserts it posts, so two senders never post one arrival twice.
    if (!(await store.reservePost(personId, chatId))) {
      return false;
    }
    try {
      const card = await store.teamCard(personId);
      if (!card) {
        await store.releasePost(personId, chatId);
        return false;
      }
      const { text, keyboard } = teamPost(staffOrigin, card);
      const messageId = await client.sendMessage(chatId, text, { keyboard });
      await store.recordPost(personId, chatId, messageId);
      return true;
    } catch (error) {
      // Released, so the next sweep tries again.
      await store.releasePost(personId, chatId).catch(() => undefined);
      throw error;
    }
  };

  return {
    arrival: async (personId) => {
      await post(personId);
    },
    claimed: async (personId) => {
      const card = await store.teamCard(personId);
      if (!card) {
        return;
      }
      const { text, keyboard } = teamPost(staffOrigin, card);
      for (const posted of await store.posts(personId)) {
        await client.editMessageText(posted.chatId, posted.messageId, text, { keyboard });
      }
    },
    erased: async (personIds) => {
      for (const personId of personIds) {
        for (const posted of await store.posts(personId)) {
          // Telegram lets a bot delete its messages for 48 hours; after that, the post is blanked instead.
          if (!(await client.deleteMessage(posted.chatId, posted.messageId))) {
            await client.editMessageText(posted.chatId, posted.messageId, teamPostErased());
          }
        }
      }
      await store.forgetPosts(personIds);
    },
    sweep: async () => {
      let posted = 0;
      for (const personId of await store.teamUnposted(chatId)) {
        try {
          posted += (await post(personId)) ? 1 : 0;
        } catch (error) {
          onError(error);
          // Telegram refusing one post (the bot removed from the group, say) would refuse the rest too.
          break;
        }
      }
      return posted;
    },
  };
};
