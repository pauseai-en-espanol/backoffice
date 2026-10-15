/**
 * The few Bot API methods the bot uses (https://core.telegram.org/bots/api), by hand, as aisafety-newsroom does:
 * plain text only (no parse mode, so nothing a person typed can format a message), inline keyboards for choices.
 */

/** A button under a message: a choice the bot hears back (`data`, at most 64 bytes), or a link. */
export type InlineButton = { text: string; data: string } | { text: string; url: string };

/** Rows of buttons. */
export type Keyboard = readonly (readonly InlineButton[])[];

export interface TelegramClient {
  /** Sends a message and returns its id. */
  sendMessage(chatId: number, text: string, options?: { keyboard?: Keyboard }): Promise<number>;
  /** Changes a message's text and buttons (none, without a keyboard). Editing to the same text is no failure. */
  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options?: { keyboard?: Keyboard },
  ): Promise<void>;
  /**
   * Deletes a message: in a private chat, the bot may delete the other side's messages for 48 hours. Whether it did;
   * a message too old or already gone is `false`, not a failure.
   */
  deleteMessage(chatId: number, messageId: number): Promise<boolean>;
  /** Answers a button press, with a short notice (at most 200 characters) or none. */
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  /** Points Telegram at the webhook, with the secret it must send back, for messages and button presses only. */
  setWebhook(url: string, secretToken: string): Promise<void>;
}

/**
 * A Bot API call that failed. Its message names the method and Telegram's own description, never the address: the
 * bot's token is part of every Bot API address.
 */
export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number | undefined,
    readonly description: string,
  ) {
    super(`Telegram ${method} failed${code === undefined ? '' : ` (${code})`}: ${description}`);
    this.name = 'TelegramError';
  }
}

interface BotApiAnswer {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

const markup = (keyboard: Keyboard | undefined) => ({
  inline_keyboard: (keyboard ?? []).map((row) =>
    row.map((button) =>
      'url' in button
        ? { text: button.text, url: button.url }
        : { text: button.text, callback_data: button.data },
    ),
  ),
});

export const createTelegramClient = (
  { botToken, apiUrl = 'https://api.telegram.org' }: { botToken: string; apiUrl?: string },
  fetchImpl: typeof fetch = fetch,
): TelegramClient => {
  const call = async (method: string, body: object): Promise<unknown> => {
    let answer: BotApiAnswer;
    try {
      const response = await fetchImpl(`${apiUrl}/bot${botToken}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      answer = (await response.json()) as BotApiAnswer;
    } catch (error) {
      // fetch's own errors can carry the address, and with it the token: only their name goes on.
      throw new TelegramError(
        method,
        undefined,
        error instanceof Error ? error.name : 'request failed',
      );
    }
    if (!answer.ok) {
      throw new TelegramError(method, answer.error_code, answer.description ?? 'no description');
    }
    return answer.result;
  };

  return {
    sendMessage: async (chatId, text, options = {}) => {
      const result = (await call('sendMessage', {
        chat_id: chatId,
        text,
        link_preview_options: { is_disabled: true },
        ...(options.keyboard ? { reply_markup: markup(options.keyboard) } : {}),
      })) as { message_id: number };
      return result.message_id;
    },
    editMessageText: async (chatId, messageId, text, options = {}) => {
      try {
        await call('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text,
          link_preview_options: { is_disabled: true },
          reply_markup: markup(options.keyboard),
        });
      } catch (error) {
        if (!(
          error instanceof TelegramError && error.description.includes('message is not modified')
        )) {
          throw error;
        }
      }
    },
    deleteMessage: async (chatId, messageId) => {
      try {
        await call('deleteMessage', { chat_id: chatId, message_id: messageId });
        return true;
      } catch (error) {
        // Too old (past 48 hours), already deleted, or never there: the caller says so in words.
        if (error instanceof TelegramError && error.code === 400) {
          return false;
        }
        throw error;
      }
    },
    answerCallbackQuery: async (callbackQueryId, text) => {
      await call('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text === undefined ? {} : { text: text.slice(0, 200) }),
      });
    },
    setWebhook: async (url, secretToken) => {
      await call('setWebhook', {
        url,
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      });
    },
  };
};
