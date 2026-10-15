import { describe, expect, it } from 'vitest';

import { readTelegram, readTelegramSend } from './config.js';

/** Fictional values only. */
const TOKEN = '1234567:AAEjemploDeTokenQueNoEsRealDeNingunBot';
const SECRET = 'un-secreto-de-ejemplo-de-mas-de-32-caracteres';

describe('the bot’s configuration', () => {
  it('is off with nothing set, and whole with everything set', () => {
    expect(readTelegram({})).toBeUndefined();
    expect(
      readTelegram({
        TELEGRAM_BOT_TOKEN: TOKEN,
        TELEGRAM_BOT_USERNAME: '@EjemploBot',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
        TELEGRAM_TEAM_CHAT_ID: '-1001234567890',
      }),
    ).toEqual({
      botToken: TOKEN,
      botUsername: 'EjemploBot',
      webhookSecret: SECRET,
      teamChatId: -1_001_234_567_890,
      apiUrl: 'https://api.telegram.org',
    });
  });

  it('refuses half a configuration, naming what is missing and never a secret', () => {
    expect(() =>
      readTelegram({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: 'EjemploBot' }),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET not set/u);
    expect(() => readTelegram({ TELEGRAM_WEBHOOK_SECRET: SECRET })).toThrow(/TELEGRAM_BOT_TOKEN/u);
    expect(() => readTelegramSend({ TELEGRAM_BOT_TOKEN: TOKEN })).toThrow(
      /TELEGRAM_BOT_USERNAME not set/u,
    );
    try {
      readTelegram({
        TELEGRAM_BOT_TOKEN: 'mal',
        TELEGRAM_BOT_USERNAME: 'EjemploBot',
        TELEGRAM_WEBHOOK_SECRET: SECRET,
      });
    } catch (error) {
      expect(String(error)).not.toContain('mal');
    }
  });

  it('checks the shapes: token, username, secret, team chat and API address', () => {
    const base = {
      TELEGRAM_BOT_TOKEN: TOKEN,
      TELEGRAM_BOT_USERNAME: 'EjemploBot',
      TELEGRAM_WEBHOOK_SECRET: SECRET,
    };
    expect(() => readTelegram({ ...base, TELEGRAM_BOT_TOKEN: 'no-es-un-token' })).toThrow(
      /BotFather/u,
    );
    expect(() => readTelegram({ ...base, TELEGRAM_BOT_USERNAME: 'a b' })).toThrow(/username/u);
    expect(() => readTelegram({ ...base, TELEGRAM_WEBHOOK_SECRET: 'corto' })).toThrow(/32 to 256/u);
    expect(() => readTelegram({ ...base, TELEGRAM_TEAM_CHAT_ID: 'grupo' })).toThrow(/chat id/u);
    expect(() => readTelegram({ ...base, TELEGRAM_API_URL: 'http://api.example.test' })).toThrow(
      /https/u,
    );
    expect(readTelegram({ ...base, TELEGRAM_API_URL: 'http://127.0.0.1:9000/x' })?.apiUrl).toBe(
      'http://127.0.0.1:9000',
    );
  });
});
