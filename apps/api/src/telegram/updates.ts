import * as z from 'zod';

/** The parts of a Bot API `Update` the bot reads: messages and button presses, as the webhook asks for. */
export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  from?: { id: number; is_bot?: boolean } | undefined;
  text?: string | undefined;
}

export interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: TelegramChat } | undefined;
  data?: string | undefined;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage | undefined;
  callback_query?: TelegramCallbackQuery | undefined;
}

const chat = z.looseObject({ id: z.number().int(), type: z.string() });

/** Just enough of an update to trust its shape; anything else in it is ignored. */
export const updateSchema = z.looseObject({
  update_id: z.number().int().nonnegative(),
  message: z
    .looseObject({
      message_id: z.number().int(),
      chat,
      from: z.looseObject({ id: z.number().int(), is_bot: z.boolean().optional() }).optional(),
      text: z.string().max(4096).optional(),
    })
    .optional(),
  callback_query: z
    .looseObject({
      id: z.string().max(64),
      from: z.looseObject({ id: z.number().int() }),
      message: z.looseObject({ message_id: z.number().int(), chat }).optional(),
      data: z.string().max(64).optional(),
    })
    .optional(),
});
