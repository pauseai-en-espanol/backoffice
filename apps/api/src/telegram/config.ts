/** What sending through the bot needs: the API, and the daily digest's job (ADR-0004). */
export interface TelegramSendConfig {
  /** The bot's token from BotFather. Part of every Bot API address, so never logged. */
  botToken: string;
  /** The bot's @username, without the @, for the "Conectar Telegram" deep links. */
  botUsername: string;
  /** The onboarding team's group (D11): optional; without it, nothing is posted to a group. */
  teamChatId: number | undefined;
  /** The Bot API's address: Telegram's, or a stand-in in the tests. */
  apiUrl: string;
}

/** And what the webhook needs besides: the secret Telegram sends back with every update. */
export interface TelegramConfig extends TelegramSendConfig {
  webhookSecret: string;
}

const TOKEN = /^\d{5,15}:[\w-]{30,64}$/u;
const USERNAME = /^[A-Za-z]\w{3,31}$/u;
/** What Telegram takes as a webhook's secret_token, 1 to 256 of these; we ask for 32 at least. */
const WEBHOOK_SECRET = /^[\w-]{32,256}$/u;

const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const readApiUrl = (value: string | undefined): string => {
  if (!value) {
    return 'https://api.telegram.org';
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TELEGRAM_API_URL must be a URL such as https://api.telegram.org');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error('TELEGRAM_API_URL must be https (http only on a loopback host)');
  }
  return url.origin;
};

const readTeamChat = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const id = Number(value);
  if (!/^-?\d{1,20}$/u.test(value) || !Number.isSafeInteger(id) || id === 0) {
    throw new Error('TELEGRAM_TEAM_CHAT_ID must be a chat id, such as -1001234567890');
  }
  return id;
};

/**
 * Sending through the bot: its token and username both, or neither. Errors never echo the token. Undefined without
 * either.
 */
export const readTelegramSend = (env: NodeJS.ProcessEnv): TelegramSendConfig | undefined => {
  const botToken = env.TELEGRAM_BOT_TOKEN || undefined;
  const botUsername = env.TELEGRAM_BOT_USERNAME || undefined;
  if (!botToken && !botUsername) {
    return undefined;
  }
  if (!botToken || !botUsername) {
    throw new Error(
      `The bot is half configured: ${botToken ? 'TELEGRAM_BOT_USERNAME' : 'TELEGRAM_BOT_TOKEN'} not set`,
    );
  }
  if (!TOKEN.test(botToken)) {
    throw new Error("TELEGRAM_BOT_TOKEN doesn't look like a token from BotFather");
  }
  const username = botUsername.replace(/^@/u, '');
  if (!USERNAME.test(username)) {
    throw new Error("TELEGRAM_BOT_USERNAME doesn't look like a bot's username");
  }
  return {
    botToken,
    botUsername: username,
    teamChatId: readTeamChat(env.TELEGRAM_TEAM_CHAT_ID || undefined),
    apiUrl: readApiUrl(env.TELEGRAM_API_URL || undefined),
  };
};

/** The bot as the API runs it: token, username and webhook secret, all or none. Errors never echo a secret. */
export const readTelegram = (env: NodeJS.ProcessEnv): TelegramConfig | undefined => {
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET || undefined;
  const send = readTelegramSend(env);
  if (!send && !webhookSecret) {
    return undefined;
  }
  if (!send || !webhookSecret) {
    throw new Error(
      `The bot is half configured: ${send ? 'TELEGRAM_WEBHOOK_SECRET' : 'TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME'} not set`,
    );
  }
  if (!WEBHOOK_SECRET.test(webhookSecret)) {
    throw new Error(
      'TELEGRAM_WEBHOOK_SECRET must be 32 to 256 letters, digits, dashes or underscores',
    );
  }
  return { ...send, webhookSecret };
};
