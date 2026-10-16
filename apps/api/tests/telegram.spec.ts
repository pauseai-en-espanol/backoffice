import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import { endSessions } from '../src/auth/cleanup.js';
import { cleanUpDialogs } from '../src/jobs/dialog-cleanup.js';
import { sendDigests } from '../src/jobs/digest.js';
import { createTelegramClient } from '../src/telegram/client.js';
import { createBot } from '../src/telegram/setup.js';
import { createBotStore } from '../src/telegram/store.js';
import {
  browser,
  createAccount,
  limiterAddress,
  PASSWORD,
  SECRET,
  STAFF_HOST,
  STAFF_ORIGIN,
  testAddress,
  TOTP_ISSUER,
  totpCode,
} from './auth-fixtures.js';
import './db.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.`);
  }
  return value;
};

/** Fictional bot settings and people. */
const WEBHOOK_SECRET = 'un-secreto-de-webhook-de-ejemplo-de-mas-de-32';
const TEAM_CHAT = -1_009_999;
const ANA = '0190f8c4-0000-7000-8000-0000000003a1';

interface Call {
  method: string;
  body: Record<string, unknown>;
}

/** A Bot API stand-in: answers every call as Telegram would, and records it. */
const calls: Call[] = [];
let messageIds = 5000;
const fake: Server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    const method = (request.url ?? '').split('/').at(-1) ?? '';
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<
      string,
      unknown
    >;
    calls.push({ method, body });
    messageIds += 1;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        ok: true,
        result: method === 'sendMessage' ? { message_id: messageIds } : true,
      }),
    );
  });
});

const authPool = createAuthPool({
  connectionString: env('TEST_AUTH_DATABASE_URL'),
  maxConnections: 4,
});
const superuser = createAuthPool({
  connectionString: env('TEST_SUPERUSER_DATABASE_URL'),
  maxConnections: 1,
});
const appDb = createDatabase({ connectionString: env('TEST_APP_DATABASE_URL'), maxConnections: 4 });

let app: ReturnType<typeof buildApp>;
let apiUrl = '';
const errors: unknown[] = [];

/** A staff member with these roles, signed in with TOTP in a browser. */
const staffMember = async (roles: string[]) => {
  const created = await createAccount(authPool);
  const who = browser(app, testAddress());
  expect(
    (
      await who.send('POST', '/api/auth/sign-in/email', {
        email: created.email,
        password: PASSWORD,
      })
    ).statusCode,
  ).toBe(200);
  const enabled = await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD });
  const { totpURI } = enabled.json<{ totpURI: string }>();
  expect(
    (await who.send('POST', '/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) }))
      .statusCode,
  ).toBe(200);
  await superuser.query(
    'INSERT INTO app.staff (user_id, display_name) SELECT id, $2 FROM auth.users WHERE id = $1',
    [created.id, `Persona ${roles.join(' y ')}`],
  );
  for (const role of roles) {
    await superuser.query('INSERT INTO app.staff_roles (user_id, role) VALUES ($1, $2)', [
      created.id,
      role,
    ]);
  }
  return { ...created, who, address: who.address };
};

let updateId = 7_000_000 + Math.floor(Math.random() * 1_000_000);
let telegramMessageId = 100;

const webhook = (update: object, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/telegram/webhook',
    headers: {
      host: STAFF_HOST,
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
      ...headers,
    },
    payload: JSON.stringify(update),
  });

/** A message from a Telegram user, in their private chat with the bot. */
const message = async (from: number, text: string) => {
  updateId += 1;
  telegramMessageId += 1;
  const response = await webhook({
    update_id: updateId,
    message: {
      message_id: telegramMessageId,
      chat: { id: from, type: 'private' },
      from: { id: from },
      text,
    },
  });
  expect(response.statusCode).toBe(200);
  return telegramMessageId;
};

/** A button press, in a private chat or the team group. */
const press = async (
  from: number,
  data: string,
  chat = { id: from, type: 'private' },
  messageId = 1,
) => {
  updateId += 1;
  const response = await webhook({
    update_id: updateId,
    callback_query: {
      id: `q${updateId}`,
      from: { id: from },
      message: { message_id: messageId, chat },
      data,
    },
  });
  expect(response.statusCode).toBe(200);
};

const sentTo = (chatId: number) =>
  calls.filter((call) => call.method === 'sendMessage' && call.body.chat_id === chatId);
const lastText = (chatId: number) => sentTo(chatId).at(-1)?.body.text;
const buttonsOf = (call: Call | undefined) =>
  (
    (
      call?.body.reply_markup as
        { inline_keyboard?: { text: string; callback_data?: string }[][] } | undefined
    )?.inline_keyboard ?? []
  ).flat();

const telegramIds = {
  onboarder: 5_000_001,
  outreach: 5_000_002,
  stranger: 5_000_003,
  admin: 5_000_004,
};
let onboarder: Awaited<ReturnType<typeof staffMember>>;

beforeAll(async () => {
  await cleanUp();
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const address = fake.address();
  apiUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';
  const options = {
    pool: authPool,
    secret: SECRET,
    staffOrigin: STAFF_ORIGIN,
    totpIssuer: TOTP_ISSUER,
  };
  const bot = createBot({
    config: {
      botToken: '1234567:AAEjemploDeTokenQueNoEsRealDeNingunBot',
      botUsername: 'EjemploBot',
      webhookSecret: WEBHOOK_SECRET,
      teamChatId: TEAM_CHAT,
      apiUrl,
    },
    staffOrigin: STAFF_ORIGIN,
    app: appDb,
    auth: authPool,
    onError: (error) => errors.push(error),
  });
  app = buildApp({
    api: {
      auth: { auth: createAuth(options), staffOrigin: STAFF_ORIGIN },
      app: appDb,
      telegram: bot.linking,
      endSessions: (userId) => endSessions(authPool, userId),
      onErase: (personIds) => bot.team?.erased(personIds) ?? Promise.resolve(),
    },
    telegram: bot.webhook,
  });
  await app.ready();
  onboarder = await staffMember(['onboarding']);
});

beforeEach(() => {
  calls.length = 0;
});

/** The phones the bot is told about here: fictional, and these tests' alone. */
const PHONES = ['+34699100200', '+34699300400', '+34699500600'];
/** People these tests erase: their phones go with them, so they're cleaned up by id. */
const erasedIds: string[] = [];

/**
 * What these tests reported through the bot, as superuser past the append-only rules, before and after: a run never
 * depends on what an earlier, interrupted one left behind. The people they made go; a fixture person they attached a
 * phone to (Ana) only loses it.
 */
const cleanUp = async () => {
  await superuser.query("SET session_replication_role = 'replica'");
  const made = (
    await superuser.query<{ id: string }>(
      `SELECT DISTINCT p.id FROM app.people p JOIN app.identities i ON i.person_id = p.id
        WHERE i.value = ANY($1::text[]) AND p.full_name LIKE 'Persona Telegram %'`,
      [PHONES],
    )
  ).rows.map((row) => row.id);
  for (const table of [
    'app.person_events',
    'app.person_sources',
    'app.community_presence',
    'app.identities',
    'private.telegram_posts',
  ]) {
    await superuser.query(`DELETE FROM ${table} WHERE person_id = ANY($1::uuid[])`, [made]);
  }
  await superuser.query('DELETE FROM app.identities WHERE value = ANY($1::text[])', [PHONES]);
  await superuser.query(
    `DELETE FROM app.intake_records
      WHERE person_id = ANY($1::uuid[]) OR (source = 'telegram' AND payload -> 'phones' ?| $2::text[])`,
    [made, PHONES],
  );
  await superuser.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [made]);
  for (const table of ['app.person_events', 'app.person_sources', 'app.community_presence']) {
    await superuser.query(`DELETE FROM ${table} WHERE person_id = ANY($1::uuid[])`, [erasedIds]);
  }
  await superuser.query('DELETE FROM app.intake_records WHERE person_id = ANY($1::uuid[])', [
    erasedIds,
  ]);
  await superuser.query('DELETE FROM app.people WHERE id = ANY($1::uuid[])', [erasedIds]);
  await superuser.query("SET session_replication_role = 'origin'");
};

afterAll(async () => {
  await cleanUp();
  await authPool.query('DELETE FROM telegram_links WHERE telegram_user_id = ANY($1::bigint[])', [
    Object.values(telegramIds),
  ]);
  await authPool.query(`DELETE FROM rate_limits WHERE key LIKE $1 || '|%'`, [
    limiterAddress(onboarder.address),
  ]);
  await app.close();
  await appDb.destroy();
  await superuser.end();
  await authPool.end();
  await new Promise((resolve) => fake.close(resolve));
});

describe('the webhook', () => {
  it('refuses a request without the secret, or on another host, and acknowledges a malformed update', async () => {
    expect(
      (await webhook({ update_id: 1 }, { 'x-telegram-bot-api-secret-token': 'otro' })).statusCode,
    ).toBe(401);
    const missing = await app.inject({
      method: 'POST',
      url: '/telegram/webhook',
      headers: { host: STAFF_HOST, 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(missing.statusCode).toBe(401);
    expect((await webhook({ update_id: 1 }, { host: 'otro.example.test' })).statusCode).toBe(404);
    expect((await webhook({ nada: true })).statusCode).toBe(200);
    expect(calls).toEqual([]);
  });

  it('ignores unlinked accounts without a reply', async () => {
    await message(telegramIds.stranger, '/help');
    await message(telegramIds.stranger, 'Ana 600 123 456');
    expect(calls).toEqual([]);
  });
});

describe('linking', () => {
  it('links from the staff app with a one-time code, then the bot listens', async () => {
    expect((await onboarder.who.send('GET', '/api/telegram/link')).json()).toEqual({
      configured: true,
      linked: false,
      botUsername: 'EjemploBot',
    });
    const made = await onboarder.who.send('POST', '/api/telegram/link');
    expect(made.statusCode).toBe(201);
    const { url } = made.json<{ url: string }>();
    expect(url).toMatch(/^https:\/\/t\.me\/EjemploBot\?start=[\w-]{43}$/u);
    const code = new URL(url).searchParams.get('start') ?? '';
    // Only its hash is kept.
    const stored = await authPool.query(
      'SELECT code_hash FROM telegram_link_codes WHERE code_hash = $1',
      [code],
    );
    expect(stored.rows).toEqual([]);

    await message(telegramIds.onboarder, `/start ${code}`);
    expect(lastText(telegramIds.onboarder)).toMatch(/conectada/u);
    expect((await onboarder.who.send('GET', '/api/telegram/link')).json()).toMatchObject({
      linked: true,
    });
    // Once only: a stranger with the same code is told it's spent, and stays unlinked.
    await message(telegramIds.stranger, `/start ${code}`);
    expect(lastText(telegramIds.stranger)).toMatch(/ya no vale/u);
    // Each command by its English name and its Spanish one (PLAN R38).
    await message(telegramIds.onboarder, '/ayuda');
    expect(lastText(telegramIds.onboarder)).toContain('/joined (/alta) — ');
  });

  it('gives a code only to onboarding staff: admin or outreach alone is refused (Dani, 2026-10-16)', async () => {
    for (const roles of [['admin'], ['outreach']]) {
      const member = await staffMember(roles);
      const refused = await member.who.send('POST', '/api/telegram/link');
      expect(refused.statusCode, roles.join()).toBe(403);
      expect(refused.json()).toEqual({ error: 'onboardingOnly' });
    }
  });

  it('processes each update once', async () => {
    updateId += 1;
    const update = {
      update_id: updateId,
      message: {
        message_id: 1,
        chat: { id: telegramIds.onboarder, type: 'private' },
        from: { id: telegramIds.onboarder },
        text: '/ayuda',
      },
    };
    await webhook(update);
    await webhook(update);
    expect(sentTo(telegramIds.onboarder)).toHaveLength(1);
  });
});

describe('reporting through the bot', () => {
  it('saves an arrival, deletes the message with the phone, and posts it to the team group', async () => {
    const id = await message(telegramIds.onboarder, '/alta Persona Telegram Uno 699 100 200');
    const question = sentTo(telegramIds.onboarder).at(-1);
    expect(question?.body.text).toBe('¿Doy de alta a Persona Telegram Uno (con teléfono)?');
    await press(telegramIds.onboarder, 'alta:new', undefined, 42);
    const done = calls.find((call) => call.method === 'editMessageText');
    expect(done?.body.text).toMatch(/^Hecho: Persona Telegram Uno ya está en el sistema/u);
    expect(
      calls.filter((call) => call.method === 'deleteMessage').map((call) => call.body),
    ).toEqual([{ chat_id: telegramIds.onboarder, message_id: id }]);
    const { rows } = await superuser.query<{ id: string; full_name: string; stage: string }>(
      `SELECT p.id, p.full_name, p.stage::text FROM app.people p
         JOIN app.identities i ON i.person_id = p.id WHERE i.value = '+34699100200'`,
    );
    expect(rows).toMatchObject([{ full_name: 'Persona Telegram Uno', stage: 'new' }]);
    const events = await superuser.query(
      'SELECT DISTINCT channel FROM app.person_events WHERE person_id = $1',
      [rows[0]?.id],
    );
    expect(events.rows).toEqual([{ channel: 'bot' }]);
    const post = sentTo(TEAM_CHAT).at(-1);
    expect(post?.body.text).toBe('Nueva llegada: Persona Telegram Uno\nFuente: Bot de Telegram');
    expect(JSON.stringify(calls)).not.toMatch(/699 ?100 ?200/u);
  });

  it('offers the person it might be, and attaches to them', async () => {
    await message(telegramIds.onboarder, '/alta Ana Ejemplo Uno 699 300 400');
    const offer = sentTo(telegramIds.onboarder).at(-1);
    expect(offer?.body.text).toMatch(/se parece a alguien/u);
    const ana = buttonsOf(offer).find((button) => button.callback_data === `alta:attach:${ANA}`);
    expect(ana?.text).toMatch(/^Es Ana Ejemplo Uno · /u);
    await press(telegramIds.onboarder, `alta:attach:${ANA}`);
    const { rows } = await superuser.query(
      "SELECT person_id FROM app.identities WHERE value = '+34699300400'",
    );
    expect(rows).toEqual([{ person_id: ANA }]);
  });

  it('lets someone take a person from /libres, which the team group shows', async () => {
    await message(telegramIds.onboarder, '/libres');
    const list = sentTo(telegramIds.onboarder).at(-1);
    const button = buttonsOf(list).find((b) => b.text === 'Me lo quedo: Persona Telegram Uno');
    expect(button).toBeDefined();
    const personId = (button?.callback_data ?? '').replace('claim:', '');
    await press(telegramIds.onboarder, button?.callback_data ?? '');
    const answered = calls.find((call) => call.method === 'answerCallbackQuery');
    expect(answered?.body.text).toBe('Ahora te encargas tú de Persona Telegram Uno.');
    const { rows } = await superuser.query('SELECT owner_id FROM app.people WHERE id = $1', [
      personId,
    ]);
    expect(rows).toEqual([{ owner_id: onboarder.id }]);
    const edited = calls.find(
      (call) => call.method === 'editMessageText' && call.body.chat_id === TEAM_CHAT,
    );
    expect(edited?.body.text).toMatch(/Se encarga: Persona onboarding/u);
  });

  it('records a leave', async () => {
    await message(telegramIds.onboarder, '/baja 699 100 200');
    const options = buttonsOf(sentTo(telegramIds.onboarder).at(-1));
    const pick = options.find((b) => b.callback_data?.startsWith('baja:pick:'));
    await press(telegramIds.onboarder, pick?.callback_data ?? '');
    await press(telegramIds.onboarder, (pick?.callback_data ?? '').replace('pick', 'yes'));
    const personId = (pick?.callback_data ?? '').replace('baja:pick:', '');
    const { rows } = await superuser.query(
      'SELECT left_on IS NOT NULL AS left FROM app.community_presence WHERE person_id = $1',
      [personId],
    );
    expect(rows).toEqual([{ left: true }]);
  });
});

describe('erasure and the team group', () => {
  it('deletes the team post about someone erased, and forgets it', async () => {
    await message(telegramIds.onboarder, '/alta Persona Telegram Dos 699 500 600');
    await press(telegramIds.onboarder, 'alta:new', undefined, 43);
    const post = calls.find(
      (call) =>
        call.method === 'sendMessage' &&
        call.body.chat_id === TEAM_CHAT &&
        String(call.body.text).includes('Persona Telegram Dos'),
    );
    expect(post).toBeDefined();
    const { rows } = await superuser.query<{ person_id: string; message_id: string }>(
      `SELECT t.person_id, t.message_id::text FROM private.telegram_posts t
         JOIN app.identities i ON i.person_id = t.person_id WHERE i.value = '+34699500600'`,
    );
    const [posted] = rows;
    expect(posted).toBeDefined();
    erasedIds.push(posted?.person_id ?? '');
    const admin = await staffMember(['admin']);
    expect(
      (await admin.who.send('POST', `/api/people/${posted?.person_id}/erase`)).statusCode,
    ).toBe(204);
    await expect
      .poll(() =>
        calls.some((call) => call.method === 'deleteMessage' && call.body.chat_id === TEAM_CHAT),
      )
      .toBe(true);
    const deleted = calls.find(
      (call) => call.method === 'deleteMessage' && call.body.chat_id === TEAM_CHAT,
    );
    expect(String(deleted?.body.message_id)).toBe(posted?.message_id);
    await expect
      .poll(
        async () =>
          (
            await superuser.query('SELECT 1 FROM private.telegram_posts WHERE person_id = $1', [
              posted?.person_id,
            ])
          ).rows.length,
      )
      .toBe(0);
  });
});

describe('who may use the bot', () => {
  it('tells staff without onboarding they may not, admins included, and ignores a deactivated member', async () => {
    const outreach = await staffMember(['outreach']);
    const admin = await staffMember(['admin']);
    // Links from before the bot was the onboarding team's alone: the database refuses them now, so they're made with
    // its triggers off. The bot still refuses whoever lacks the role (Dani, 2026-10-16: admin isn't enough).
    const client = await superuser.connect();
    try {
      await client.query("SET session_replication_role = 'replica'");
      await client.query(
        'INSERT INTO telegram_links (user_id, telegram_user_id) VALUES ($1, $2), ($3, $4)',
        [outreach.id, telegramIds.outreach, admin.id, telegramIds.admin],
      );
    } finally {
      await client.query('RESET session_replication_role');
      client.release();
    }
    await message(telegramIds.admin, '/mios');
    expect(lastText(telegramIds.admin)).toMatch(/no tiene permiso de acogida/u);
    await message(telegramIds.outreach, '/mios');
    expect(lastText(telegramIds.outreach)).toMatch(/no tiene permiso de acogida/u);
    await press(telegramIds.outreach, `claim:${ANA}`, { id: TEAM_CHAT, type: 'supergroup' });
    expect(calls.at(-1)?.body.text).toBe('No autorizado');

    await superuser.query('UPDATE app.staff SET active = false WHERE user_id = $1', [outreach.id]);
    const before = calls.length;
    await message(telegramIds.outreach, '/mios');
    expect(calls).toHaveLength(before);
  });

  it('unlinks Telegram when a member is signed out everywhere (deactivation)', async () => {
    await endSessions(authPool, onboarder.id);
    const { rows } = await authPool.query('SELECT 1 FROM telegram_links WHERE user_id = $1', [
      onboarder.id,
    ]);
    expect(rows).toEqual([]);
    await message(telegramIds.onboarder, '/ayuda');
    expect(calls).toEqual([]);
  });
});

describe('the jobs', () => {
  it('sends each onboarder with something pending a digest, and nobody else', async () => {
    await authPool.query('INSERT INTO telegram_links (user_id, telegram_user_id) VALUES ($1, $2)', [
      onboarder.id,
      telegramIds.onboarder,
    ]);
    const mailed: string[] = [];
    const counts = await sendDigests({
      auth: authPool,
      store: createBotStore({ app: appDb, auth: authPool }),
      client: createTelegramClient({
        botToken: '1234567:AAEjemploDeTokenQueNoEsRealDeNingunBot',
        apiUrl,
      }),
      sendMail: async (to) => void mailed.push(to),
      staffOrigin: STAFF_ORIGIN,
      onError: (error) => errors.push(error),
    });
    expect(counts.failed).toBe(0);
    expect(counts.telegram).toBeGreaterThanOrEqual(1);
    const digest = lastText(telegramIds.onboarder);
    expect(digest).toMatch(/^Buenos días/u);
    expect(digest).toMatch(/Sin asignar: \d+\./u);
    // The fixtures' onboarding staff, unlinked, get theirs by mail; the outreach-only member gets none.
    expect(mailed.some((to) => to.startsWith('persona-'))).toBe(false);
  });

  it('deletes expired dialogs and old updates', async () => {
    await superuser.query(
      `INSERT INTO private.telegram_dialogs (telegram_user_id, user_id, state, expires_at)
       VALUES (999999, $1, '{}', now() - interval '1 minute')`,
      [onboarder.id],
    );
    const deleted = await cleanUpDialogs(appDb);
    expect(deleted.dialogs).toBeGreaterThanOrEqual(1);
    expect(errors).toEqual([]);
  });
});
