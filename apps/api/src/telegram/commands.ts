import { SPANISH_NAMES } from '@backoffice/domain/bot-message';

import type { BotCommand, TelegramClient } from './client.js';

import { commandDescription, MENU_COMMANDS } from './replies.js';

/**
 * Telegram's command menu (PLAN R38): by the English names for everyone, by the Spanish ones for people whose Telegram
 * is in Spanish; both work whichever the menu shows. What each does is in Spanish in both (D6).
 */
export const commandMenus = (): { languageCode?: string; commands: BotCommand[] }[] => [
  {
    commands: MENU_COMMANDS.map((command) => ({
      command,
      description: commandDescription(command),
    })),
  },
  {
    languageCode: 'es',
    commands: MENU_COMMANDS.map((command) => ({
      command: SPANISH_NAMES[command],
      description: commandDescription(command),
    })),
  },
];

/** Sets both menus, on every start of the API and with the owner's webhook command, so BotFather needs nothing. */
export const registerCommands = async (
  client: Pick<TelegramClient, 'setMyCommands'>,
): Promise<void> => {
  for (const menu of commandMenus()) {
    await client.setMyCommands(menu.commands, menu.languageCode);
  }
};
