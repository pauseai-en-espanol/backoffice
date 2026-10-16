import { describe, expect, it } from 'vitest';

import type { Keyboard, TelegramClient } from './client.js';
import type { Dialog } from './dialogs.js';
import type { Notifier } from './notify.js';
import type { Arrival, BotAccess, BotStore, Candidate, PersonLine, Submitted } from './store.js';
import type { TelegramUpdate } from './updates.js';

import { createRateLimiter } from '../rate-limit.js';
import { type BotDeps, forgetExpiredDialogs, handleUpdate } from './bot.js';

/** Fictional people and contact details only. */
const PHONE = '+34600111222';
const PHONE_AS_TYPED = '600 111 222';
const EMAIL = 'nueva.persona@ejemplo.test';
const USER = '0190f8c4-0000-7000-8000-000000000103';
const OUTREACH_USER = '0190f8c4-0000-7000-8000-000000000104';
const ANA = '0190f8c4-0000-7000-8000-0000000003a1';
const NEW_PERSON = '0190f8c4-0000-7000-8000-0000000003b1';
const TG = 111;
const TG_OUTREACH = 222;
const TG_STRANGER = 333;
const ORIGIN = 'https://backoffice.example.test';

const ana: PersonLine = {
  personId: ANA,
  name: 'Ana Ejemplo',
  stage: 'new',
  ownerName: null,
  reasons: ['unassigned'],
};

interface Sent {
  chatId: number;
  text: string;
  keyboard?: Keyboard | undefined;
  messageId: number;
}

/** A Bot API stand-in that records every call. */
const fakeClient = () => {
  let next = 1000;
  const sent: Sent[] = [];
  const edited: Sent[] = [];
  const deleted: { chatId: number; messageId: number }[] = [];
  const answered: { id: string; text?: string | undefined }[] = [];
  const client: TelegramClient = {
    sendMessage: async (chatId, text, options = {}) => {
      next += 1;
      sent.push({ chatId, text, keyboard: options.keyboard, messageId: next });
      return next;
    },
    editMessageText: async (chatId, messageId, text, options = {}) => {
      edited.push({ chatId, text, keyboard: options.keyboard, messageId });
    },
    deleteMessage: async (chatId, messageId) => {
      deleted.push({ chatId, messageId });
      return true;
    },
    answerCallbackQuery: async (id, text) => {
      answered.push({ id, text });
    },
    setWebhook: async () => undefined,
    setMyCommands: async () => undefined,
  };
  return { client, sent, edited, deleted, answered };
};

/** A store in memory: one onboarder and one outreach member linked, Ana in the database. */
const fakeStore = (candidates: Candidate[] = []) => {
  const dialogs = new Map<number, Dialog>();
  /** Conversations past their hour, as the store hands them over once. */
  const expired: Dialog[] = [];
  const submitted: { externalId: string; arrival: Arrival; decision: unknown }[] = [];
  const claimed: string[] = [];
  const left: string[] = [];
  const codes = new Map([['codigo-de-ejemplo-de-cuarenta-y-tres-caracteres'.slice(0, 43), USER]]);
  const store: BotStore = {
    linkedUser: async (id) => (id === TG ? USER : id === TG_OUTREACH ? OUTREACH_USER : undefined),
    redeemCode: async (code) => {
      const user = codes.get(code);
      codes.delete(code);
      return user;
    },
    access: async (userId): Promise<BotAccess> =>
      userId === USER ? 'onboarding' : userId === OUTREACH_USER ? 'staff' : 'none',
    candidates: async () => candidates,
    submit: async (_userId, externalId, arrival, decision): Promise<Submitted> => {
      submitted.push({ externalId, arrival, decision });
      return decision.kind === 'attach'
        ? { intakeId: 'i', status: 'attached', personId: decision.target }
        : { intakeId: 'i', status: 'created', personId: NEW_PERSON };
    },
    people: async (_userId, scope, query = {}) => {
      if (scope === 'person') {
        return query.text === ANA
          ? [ana]
          : [{ ...ana, personId: NEW_PERSON, name: 'Nueva Persona' }];
      }
      if (scope === 'search') {
        return query.phones?.includes(PHONE) || /ana/iu.test(query.text ?? '') ? [ana] : [];
      }
      return [ana];
    },
    claim: async (_userId, personId) => {
      if (claimed.includes(personId)) {
        return false;
      }
      claimed.push(personId);
      return true;
    },
    leave: async (_userId, personId) => {
      left.push(personId);
      return true;
    },
    summary: async () => ({ unassigned: 1, arrivedYesterday: 0 }),
    claimUpdate: async () => true,
    dialog: async (id) => dialogs.get(id),
    saveDialog: async (id, _userId, dialog) => {
      dialogs.set(id, structuredClone(dialog));
    },
    endDialog: async (id) => {
      const ended = dialogs.get(id);
      dialogs.delete(id);
      return ended;
    },
    takeExpiredDialogs: async () => expired.splice(0),
    teamCard: async () => undefined,
    teamUnposted: async () => [],
    reservePost: async () => true,
    recordPost: async () => undefined,
    releasePost: async () => undefined,
    forgetPosts: async () => undefined,
    posts: async () => [],
  };
  return { store, dialogs, expired, submitted, claimed, left };
};

const setup = (candidates: Candidate[] = [], extra: Partial<BotDeps> = {}) => {
  const telegram = fakeClient();
  const data = fakeStore(candidates);
  const told = { arrivals: [] as string[], claims: [] as string[] };
  const notifier: Notifier = {
    arrival: async (id) => void told.arrivals.push(id),
    claimed: async (id) => void told.claims.push(id),
    erased: async () => undefined,
  };
  const errors: unknown[] = [];
  const deps: BotDeps = {
    store: data.store,
    client: telegram.client,
    staffOrigin: ORIGIN,
    notifier,
    onError: (error) => errors.push(error),
    ...extra,
  };
  let updateId = 0;
  let messageId = 0;
  const say = async (text: string, from = TG) => {
    updateId += 1;
    messageId += 1;
    await handleUpdate(
      {
        update_id: updateId,
        message: {
          message_id: messageId,
          chat: { id: from, type: 'private' },
          from: { id: from },
          text,
        },
      },
      deps,
    );
    return messageId;
  };
  const press = async (
    data: string,
    from = TG,
    chat = { id: from, type: 'private' },
    message = 9999,
  ) => {
    updateId += 1;
    const update: TelegramUpdate = {
      update_id: updateId,
      callback_query: {
        id: `q${updateId}`,
        from: { id: from },
        message: { message_id: message, chat },
        data,
      },
    };
    await handleUpdate(update, deps);
  };
  /** Every text the bot showed: messages, edits and button labels. */
  const everything = (): string =>
    [...telegram.sent, ...telegram.edited]
      .flatMap((m) => [m.text, ...(m.keyboard ?? []).flat().map((b) => b.text)])
      .join('\n');
  return { ...telegram, ...data, deps, told, errors, say, press, everything };
};

const buttons = (message: Sent | undefined) => (message?.keyboard ?? []).flat();

describe('who the bot listens to', () => {
  it('ignores unlinked accounts without a word, and tells staff without onboarding they may not', async () => {
    const bot = setup();
    await bot.say('/help', TG_STRANGER);
    await bot.say(`Ana ${PHONE_AS_TYPED}`, TG_STRANGER);
    expect(bot.sent).toEqual([]);
    await bot.say('/mine', TG_OUTREACH);
    expect(bot.sent.at(-1)?.text).toMatch(/no tiene permiso de onboarding/u);
  });

  it('links with a valid code, refuses a spent one, and ignores anything else', async () => {
    const bot = setup();
    const code = 'codigo-de-ejemplo-de-cuarenta-y-tres-caracteres'.slice(0, 43);
    await bot.say(`/start ${code}`, TG_STRANGER);
    expect(bot.sent.at(-1)?.text).toMatch(/conectada/u);
    await bot.say(`/start ${code}`, TG_STRANGER);
    expect(bot.sent.at(-1)?.text).toMatch(/ya no vale/u);
    const before = bot.sent.length;
    await bot.say('/start hola', TG_STRANGER);
    expect(bot.sent).toHaveLength(before);
  });

  it('answers a button press from someone not linked with "No autorizado"', async () => {
    const bot = setup();
    await bot.press(`claim:${ANA}`, TG_STRANGER, { id: -100, type: 'supergroup' });
    expect(bot.answered.at(-1)?.text).toBe('No autorizado');
    expect(bot.claimed).toEqual([]);
  });
});

describe('/joined (/alta)', () => {
  it('reads one message, confirms, saves, says so without contact details, and deletes the message', async () => {
    const bot = setup();
    const id = await bot.say(
      `/joined Nueva Persona ${PHONE_AS_TYPED}, ${EMAIL}\nchat: Chat de ejemplo`,
    );
    const question = bot.sent.at(-1);
    expect(question?.text).toBe(
      '¿Doy de alta a Nueva Persona (con teléfono y correo), del chat Chat de ejemplo?',
    );
    expect(buttons(question).map((b) => b.text)).toEqual(['Guardar', 'Cancelar']);
    await bot.press('alta:new');
    expect(bot.submitted).toEqual([
      {
        externalId: `tg:${TG}:${id}`,
        arrival: expect.objectContaining({
          name: 'Nueva Persona',
          phones: [PHONE],
          emails: [EMAIL],
          chat: 'Chat de ejemplo',
        }),
        decision: { kind: 'new' },
      },
    ]);
    expect(bot.edited.at(-1)?.text).toContain(
      'Hecho: Nueva Persona ya está en el sistema (Nuevo, sin asignar).',
    );
    expect(bot.edited.at(-1)?.text).toContain(`${ORIGIN}/personas/${NEW_PERSON}`);
    expect(bot.deleted).toEqual([{ chatId: TG, messageId: id }]);
    expect(bot.sent.at(-1)?.text).toMatch(/He borrado/u);
    expect(bot.told.arrivals).toEqual([NEW_PERSON]);
    expect(bot.dialogs.size).toBe(0);
  });

  it('asks for what is missing, then offers the person it might be', async () => {
    const bot = setup([
      { personId: ANA, name: 'Ana Ejemplo', stage: 'new', ownerName: null, exact: false },
    ]);
    await bot.say('/alta');
    expect(bot.sent.at(-1)?.text).toMatch(/Quién ha entrado/u);
    await bot.say('Ana Ejemplo');
    expect(bot.sent.at(-1)?.text).toMatch(/teléfono o su correo/u);
    await bot.say('no lo sé');
    expect(bot.sent.at(-1)?.text).toMatch(/No reconozco/u);
    const contact = await bot.say(PHONE_AS_TYPED);
    const offer = bot.sent.at(-1);
    expect(offer?.text).toMatch(/se parece a alguien/u);
    expect(buttons(offer).map((b) => b.text)).toEqual([
      'Es Ana Ejemplo · Nuevo · sin asignar',
      'Es otra persona',
      'Cancelar',
    ]);
    await bot.press(`alta:attach:${ANA}`);
    expect(bot.submitted.at(-1)?.decision).toEqual({ kind: 'attach', target: ANA });
    expect(bot.edited.at(-1)?.text).toMatch(/lo he añadido a la ficha de Ana Ejemplo/u);
    expect(bot.deleted).toEqual([{ chatId: TG, messageId: contact }]);
    expect(bot.told.arrivals).toEqual([]);
  });

  it('takes a phone sent with no command as a draft, saved only once confirmed', async () => {
    const bot = setup();
    await bot.say(`Ha entrado Lucía, ${PHONE_AS_TYPED}`);
    expect(bot.submitted).toEqual([]);
    expect(bot.sent.at(-1)?.text).toMatch(/Doy de alta/u);
    await bot.press('alta:cancel');
    expect(bot.submitted).toEqual([]);
    expect(bot.edited.at(-1)?.text).toBe('Hecho, lo dejamos.');
    await bot.press('alta:new');
    expect(bot.answered.at(-1)?.text).toMatch(/caducado/u);
  });

  it('saves a phone with no name in one step, never asking for the name (PLAN R37)', async () => {
    const bot = setup();
    const id = await bot.say(PHONE_AS_TYPED);
    expect(bot.sent.at(-1)?.text).toBe('¿Doy de alta a alguien sin nombre (con teléfono)?');
    await bot.press('alta:new');
    expect(bot.submitted).toEqual([
      {
        externalId: `tg:${TG}:${id}`,
        arrival: expect.not.objectContaining({ name: expect.anything() }),
        decision: { kind: 'new' },
      },
    ]);
    expect(bot.submitted[0]?.arrival.phones).toEqual([PHONE]);
    expect(bot.edited.at(-1)?.text).toContain(
      'Hecho: ya está en el sistema, sin nombre por ahora (Nuevo, sin asignar).',
    );
    expect(bot.deleted).toEqual([{ chatId: TG, messageId: id }]);
    expect(bot.told.arrivals).toEqual([NEW_PERSON]);
    const command = setup();
    await command.say(`/joined ${EMAIL}`);
    expect(command.sent.at(-1)?.text).toBe('¿Doy de alta a alguien sin nombre (con correo)?');
  });

  it('offers who already holds the phone, someone without a name shown as «Sin nombre»', async () => {
    const bot = setup([{ personId: ANA, name: null, stage: 'new', ownerName: null, exact: true }]);
    await bot.say(`/alta ${PHONE_AS_TYPED}`);
    const offer = bot.sent.at(-1);
    expect(offer?.text).toBe(
      'Ya hay alguien con ese teléfono o correo. ¿Es alguna de estas personas?',
    );
    expect(buttons(offer).map((b) => b.text)[0]).toBe('Es Sin nombre · Nuevo · sin asignar');
  });

  it('lets the reporter go on without contact details', async () => {
    const bot = setup();
    await bot.say('/alta Bruno Ejemplo');
    await bot.press('alta:nocontact');
    expect(bot.sent.at(-1)?.text).toBe('¿Doy de alta a Bruno Ejemplo (sin contacto)?');
  });
});

describe('/left (/baja)', () => {
  it('searches by phone, offers buttons, confirms and records the leave', async () => {
    const bot = setup();
    const id = await bot.say(`/left ${PHONE_AS_TYPED}`);
    expect(buttons(bot.sent.at(-1)).map((b) => b.text)).toEqual([
      'Ana Ejemplo · Nuevo',
      'Cancelar',
    ]);
    await bot.press(`baja:pick:${ANA}`);
    expect(bot.edited.at(-1)?.text).toBe('¿Ana Ejemplo ha salido de la comunidad?');
    await bot.press(`baja:yes:${ANA}`);
    expect(bot.left).toEqual([ANA]);
    expect(bot.edited.at(-1)?.text).toBe('Anotado: Ana Ejemplo ha salido de la comunidad.');
    expect(bot.deleted).toEqual([{ chatId: TG, messageId: id }]);
  });

  it('asks who, and says so when nobody matches', async () => {
    const bot = setup();
    await bot.say('/baja');
    expect(bot.sent.at(-1)?.text).toMatch(/Quién ha salido/u);
    await bot.say('Zoe');
    expect(bot.sent.at(-1)?.text).toMatch(/No encuentro/u);
    await bot.say('Ana');
    expect(bot.sent.at(-1)?.text).toMatch(/Quién de estas personas/u);
  });
});

describe('lists', () => {
  it('lists my people with their reasons and links, and the unassigned with a button each', async () => {
    const bot = setup();
    await bot.say('/mine');
    expect(bot.sent.at(-1)?.text).toBe(
      `Tus personas que necesitan algo (1):\n• Ana Ejemplo: Sin asignar\n  ${ORIGIN}/personas/${ANA}`,
    );
    await bot.say('/libres');
    expect(buttons(bot.sent.at(-1))).toEqual([
      { text: 'Me lo quedo: Ana Ejemplo', data: `claim:${ANA}` },
    ]);
    await bot.press(`claim:${ANA}`);
    expect(bot.claimed).toEqual([ANA]);
    expect(bot.answered.at(-1)?.text).toBe('Ahora te encargas tú de Ana Ejemplo.');
    expect(bot.told.claims).toEqual([ANA]);
    await bot.press(`claim:${ANA}`);
    expect(bot.answered.at(-1)?.text).toBe('Ya se encarga otra persona.');
  });

  it('searches, says the sync is not configured, and explains itself', async () => {
    const bot = setup();
    await bot.say('/search ana');
    expect(bot.sent.at(-1)?.text).toContain('• Ana Ejemplo: Nuevo, sin asignar');
    await bot.say('/sync');
    expect(bot.sent.at(-1)?.text).toMatch(/no está configurada/u);
    await bot.say('/help');
    const help = bot.sent.at(-1)?.text ?? '';
    expect(help).toContain('/joined (/alta) — Alguien ha entrado en la comunidad');
    expect(help).toContain('/search (/buscar) — Buscar a alguien por nombre o teléfono');
    expect(help).toContain('/cancel (/cancelar) — Dejar lo que estábamos haciendo');
    await bot.say('/search');
    expect(bot.sent.at(-1)?.text).toBe(
      'Escribe /search (/buscar) seguido de un nombre o un teléfono.',
    );
    await bot.say('hola');
    expect(bot.sent.at(-1)?.text).toBe(
      'No te he entendido. Escribe /help (/ayuda) para ver qué puedo hacer.',
    );
  });
});

describe('both names (PLAN R38)', () => {
  it.each([
    ['joined', 'alta'],
    ['left', 'baja'],
    ['mine', 'mios'],
    ['unassigned', 'libres'],
    ['search', 'buscar'],
    ['sync', 'sincronizar'],
    ['help', 'ayuda'],
    ['cancel', 'cancelar'],
  ])('answers /%s and /%s the same', async (english, spanish) => {
    const [inEnglish, inSpanish] = [setup(), setup()];
    await inEnglish.say(`/${english}`);
    await inSpanish.say(`/${spanish}`);
    expect(inEnglish.sent.length).toBeGreaterThan(0);
    expect(inSpanish.sent).toEqual(inEnglish.sent);
  });
});

describe('a conversation that ends without saving (security review)', () => {
  it('deletes the messages that held contact details: cancelled, dropped, or replaced', async () => {
    const bot = setup();
    const cancelled = await bot.say(`/joined ${PHONE_AS_TYPED}`);
    await bot.say('/cancel');
    expect(bot.deleted).toEqual([{ chatId: TG, messageId: cancelled }]);

    const dropped = await bot.say(`/alta ${EMAIL}`);
    await bot.press('alta:cancel');
    expect(bot.deleted.at(-1)).toEqual({ chatId: TG, messageId: dropped });

    const replaced = await bot.say(`/joined ${PHONE_AS_TYPED}`);
    await bot.say('/left Ana');
    expect(bot.deleted.at(-1)).toEqual({ chatId: TG, messageId: replaced });
    await bot.press('baja:no');

    const declined = await bot.say(`/left ${PHONE_AS_TYPED}`);
    await bot.press(`baja:pick:${ANA}`);
    await bot.press('baja:no');
    expect(bot.deleted.at(-1)).toEqual({ chatId: TG, messageId: declined });
    expect(bot.left).toEqual([]);
    expect(bot.submitted).toEqual([]);
  });

  it('deletes them once the conversation expires, too', async () => {
    const bot = setup();
    bot.expired.push({
      kind: 'baja',
      chatId: TG,
      step: 'search',
      contactMessages: [41, 42],
    });
    expect(await forgetExpiredDialogs(bot.deps)).toBe(1);
    expect(bot.deleted).toEqual([
      { chatId: TG, messageId: 41 },
      { chatId: TG, messageId: 42 },
    ]);
    expect(await forgetExpiredDialogs(bot.deps)).toBe(0);
  });
});

describe('/sync (/sincronizar)', () => {
  it('runs a few times an hour per person, as the staff app’s button (security review)', async () => {
    let runs = 0;
    const bot = setup([], {
      sync: async () => {
        runs += 1;
        return { created: 0, attached: 0, review: 0 };
      },
      allowSync: createRateLimiter({ limit: 2, windowMs: 60 * 60_000 }),
    });
    await bot.say('/sync');
    await bot.say('/sincronizar');
    expect(bot.sent.at(-1)?.text).toMatch(/^Sincronizado/u);
    await bot.say('/sync');
    expect(runs).toBe(2);
    expect(bot.sent.at(-1)?.text).toMatch(/muchas veces/u);
  });
});

describe('contact details', () => {
  it('never appear in anything the bot says, whatever it was told', async () => {
    const bot = setup([
      { personId: ANA, name: 'Ana Ejemplo', stage: 'new', ownerName: null, exact: true },
    ]);
    await bot.say(`/joined Nueva Persona ${PHONE_AS_TYPED} ${EMAIL}`);
    await bot.press('alta:new');
    await bot.say(`${EMAIL}`);
    await bot.press('alta:cancel');
    await bot.say(`/search ${PHONE_AS_TYPED}`);
    await bot.say(`/baja ${EMAIL}`);
    await bot.say('/alta');
    await bot.say(`Otra Persona`);
    await bot.say(`${PHONE_AS_TYPED}`);
    const said = bot.everything();
    expect(said.length).toBeGreaterThan(200);
    for (const secret of [PHONE, PHONE_AS_TYPED, '600111222', EMAIL]) {
      expect(said).not.toContain(secret);
    }
    expect(bot.errors).toEqual([]);
  });
});
