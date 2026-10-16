import {
  type ArrivalDraft,
  looksLikeArrival,
  parseArrival,
  parseCommand,
  type ParsedCommand,
} from '@backoffice/domain/bot-message';

import type { Keyboard, TelegramClient } from './client.js';
import type { AltaDialog, BajaDialog, Dialog } from './dialogs.js';
import type { Notifier } from './notify.js';
import type { BotStore, PersonLine } from './store.js';
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from './updates.js';

import {
  askContact,
  confirmArrival,
  confirmLeave,
  freeList,
  helpText,
  leaveOptions,
  mineList,
  nameOf,
  offerCandidates,
  personLink,
  searchList,
  stageLabel,
  syncDone,
  botText as t,
} from './replies.js';

export interface BotDeps {
  store: BotStore;
  client: TelegramClient;
  /** The staff app's origin, for links to a person's page. */
  staffOrigin: string;
  /** The team group, told of arrivals and claims (D11); a no-op without one. */
  notifier: Notifier;
  /** Runs the Airtable sync now (ADR-0005), for /sync (/sincronizar); without it, the bot says it isn't configured. */
  sync?: (() => Promise<Record<string, unknown>>) | undefined;
  /** Where a failure is reported: never with what anyone wrote. */
  onError?: ((error: unknown) => void) | undefined;
}

/** Who wrote, through which chat, and how to answer them. */
interface Context {
  deps: BotDeps;
  userId: string;
  telegramUserId: number;
  chatId: number;
  messageId: number;
  say: (text: string, keyboard?: Keyboard) => Promise<number | undefined>;
}

/** A /start argument that looks like a link code: 32 random bytes, base64url. Anything else goes unanswered. */
const LINK_CODE = /^[\w-]{43}$/u;

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const report = (deps: BotDeps, error: unknown): void => {
  deps.onError?.(error);
};

const sayIn =
  (deps: BotDeps, chatId: number) =>
  async (text: string, keyboard?: Keyboard): Promise<number | undefined> => {
    try {
      return await deps.client.sendMessage(chatId, text, keyboard ? { keyboard } : {});
    } catch (error) {
      report(deps, error);
      return undefined;
    }
  };

/** What a search is told: a name, or a phone or email (normalised), never both read as a name. */
const searchQuery = (
  text: string,
): { text: string; phones: string[]; emails: string[]; contact: boolean } => {
  const parsed = parseArrival(text);
  return {
    text: parsed.hadContactDetails ? (parsed.name ?? '') : text.replaceAll(/\s+/gu, ' ').trim(),
    phones: parsed.phones,
    emails: parsed.emails,
    contact: parsed.hadContactDetails,
  };
};

/** Deletes the reporter's messages that held contact details, and says whether it could (ADR-0004). */
const deleteContactMessages = async (
  ctx: Context,
  chatId: number,
  messageIds: readonly number[],
): Promise<void> => {
  if (messageIds.length === 0) {
    return;
  }
  let all = true;
  for (const id of unique(messageIds.map(String)).map(Number)) {
    try {
      all = (await ctx.deps.client.deleteMessage(chatId, id)) && all;
    } catch (error) {
      report(ctx.deps, error);
      all = false;
    }
  }
  await ctx.say(all ? t('bot.alta.deleted') : t('bot.alta.notDeleted'));
};

// /joined (/alta) ---------------------------------------------------------------------------------------------------

/**
 * Asks for what the arrival still lacks, then offers the candidates or asks to confirm. A phone or an email is enough
 * (most reports carry only a phone, PLAN R37); a name alone gets asked for a contact, which may be "Sin contacto".
 */
const advanceAlta = async (dialog: AltaDialog, ctx: Context): Promise<void> => {
  const { store } = ctx.deps;
  const hasContact = dialog.phones.length > 0 || dialog.emails.length > 0;
  if (!dialog.name && !hasContact) {
    await store.saveDialog(ctx.telegramUserId, ctx.userId, { ...dialog, step: 'name' });
    await ctx.say(t('bot.alta.askName'));
    return;
  }
  if (!hasContact && !dialog.noContact) {
    await store.saveDialog(ctx.telegramUserId, ctx.userId, { ...dialog, step: 'contact' });
    const { text, keyboard } = askContact();
    await ctx.say(text, keyboard);
    return;
  }
  const candidates = await store.candidates(ctx.userId, dialog);
  await store.saveDialog(ctx.telegramUserId, ctx.userId, {
    ...dialog,
    step: 'confirm',
    candidates: candidates.map((candidate) => candidate.personId),
  });
  const { text, keyboard } =
    candidates.length > 0 ? offerCandidates(dialog, candidates) : confirmArrival(dialog);
  await ctx.say(text, keyboard);
};

const startAlta = async (draft: ArrivalDraft, ctx: Context): Promise<void> =>
  advanceAlta(
    {
      kind: 'alta',
      chatId: ctx.chatId,
      startedBy: ctx.messageId,
      step: 'name',
      ...(draft.name ? { name: draft.name } : {}),
      phones: draft.phones,
      emails: draft.emails,
      ...(draft.chat ? { chat: draft.chat } : {}),
      ...(draft.note ? { note: draft.note } : {}),
      contactMessages: draft.hadContactDetails ? [ctx.messageId] : [],
    },
    ctx,
  );

const continueAlta = async (dialog: AltaDialog, text: string, ctx: Context): Promise<void> => {
  const parsed = parseArrival(text);
  const next: AltaDialog = {
    ...dialog,
    phones: unique([...dialog.phones, ...parsed.phones]),
    emails: unique([...dialog.emails, ...parsed.emails]),
    contactMessages: parsed.hadContactDetails
      ? [...dialog.contactMessages, ctx.messageId]
      : dialog.contactMessages,
  };
  if (dialog.step === 'confirm') {
    await ctx.deps.store.saveDialog(ctx.telegramUserId, ctx.userId, next);
    await ctx.say(t('bot.pressButton'));
    return;
  }
  if (dialog.step === 'name') {
    // "Ana García" alone is a name; so is the first line of anything without a phone or email in it.
    const name =
      parsed.name ??
      (parsed.hadContactDetails ? undefined : text.split('\n')[0]?.trim().slice(0, 200));
    if (name) {
      next.name = name;
    }
  }
  if (dialog.step === 'contact' && !parsed.hadContactDetails) {
    await ctx.deps.store.saveDialog(ctx.telegramUserId, ctx.userId, next);
    const { keyboard } = askContact();
    await ctx.say(t('bot.alta.contactNotRecognised'), keyboard);
    return;
  }
  await advanceAlta(next, ctx);
};

/** Saves the arrival as the reporter decided, says what became of it, and deletes their contact messages. */
const saveAlta = async (
  dialog: AltaDialog,
  decision: { kind: 'new' } | { kind: 'attach'; target: string },
  ctx: Context,
  pressed: { chatId: number; messageId: number },
): Promise<void> => {
  const { store, client, staffOrigin, notifier } = ctx.deps;
  const saved = await store.submit(
    ctx.userId,
    `tg:${dialog.chatId}:${dialog.startedBy}`,
    dialog,
    decision,
  );
  await store.endDialog(ctx.telegramUserId);
  let text: string;
  if (saved.status === 'review' || !saved.personId) {
    text = t('bot.alta.review');
  } else if (saved.status === 'created') {
    const said = { stage: stageLabel('new'), link: personLink(staffOrigin, saved.personId) };
    text = dialog.name?.trim()
      ? t('bot.alta.created', { ...said, name: dialog.name })
      : t('bot.alta.createdNameless', said);
  } else {
    const [person] = await store.people(ctx.userId, 'person', { text: saved.personId });
    text = t(saved.status === 'conflict' ? 'bot.alta.conflict' : 'bot.alta.attached', {
      name: nameOf(person?.name ?? dialog.name),
      link: personLink(staffOrigin, saved.personId),
    });
  }
  try {
    await client.editMessageText(pressed.chatId, pressed.messageId, text);
  } catch (error) {
    report(ctx.deps, error);
    await ctx.say(text);
  }
  await deleteContactMessages(ctx, dialog.chatId, dialog.contactMessages);
  if (saved.status === 'created' && saved.personId) {
    await notifier.arrival(saved.personId).catch((error: unknown) => report(ctx.deps, error));
  }
};

// /left (/baja) -----------------------------------------------------------------------------------------------------

const searchLeave = async (dialog: BajaDialog, text: string, ctx: Context): Promise<void> => {
  const query = searchQuery(text);
  const next: BajaDialog = {
    ...dialog,
    contactMessages: query.contact
      ? [...dialog.contactMessages, ctx.messageId]
      : dialog.contactMessages,
  };
  const people = await ctx.deps.store.people(ctx.userId, 'search', query);
  if (people.length === 0) {
    await ctx.deps.store.saveDialog(ctx.telegramUserId, ctx.userId, { ...next, step: 'search' });
    await ctx.say(t('bot.baja.none'));
    return;
  }
  const shown = people.slice(0, 10);
  await ctx.deps.store.saveDialog(ctx.telegramUserId, ctx.userId, {
    ...next,
    step: 'pick',
    options: shown.map((person) => person.personId),
  });
  const { text: question, keyboard } = leaveOptions(shown);
  await ctx.say(question, keyboard);
};

// Commands ---------------------------------------------------------------------------------------------------------

const runCommand = async (command: ParsedCommand, ctx: Context): Promise<void> => {
  const { store, staffOrigin, sync } = ctx.deps;
  switch (command.command) {
    case 'start':
    case 'help':
      await ctx.say(helpText());
      return;
    case 'cancel': {
      const dialog = await store.dialog(ctx.telegramUserId);
      await store.endDialog(ctx.telegramUserId);
      await ctx.say(dialog ? t('bot.cancelled') : t('bot.nothingToCancel'));
      return;
    }
    case 'joined':
      await store.endDialog(ctx.telegramUserId);
      await startAlta(parseArrival(command.args), ctx);
      return;
    case 'left': {
      await store.endDialog(ctx.telegramUserId);
      const dialog: BajaDialog = {
        kind: 'baja',
        chatId: ctx.chatId,
        step: 'search',
        contactMessages: [],
      };
      if (command.args === '') {
        await store.saveDialog(ctx.telegramUserId, ctx.userId, dialog);
        await ctx.say(t('bot.baja.ask'));
        return;
      }
      await searchLeave(dialog, command.args, ctx);
      return;
    }
    case 'mine':
      await ctx.say(mineList(staffOrigin, await store.people(ctx.userId, 'mine')));
      return;
    case 'unassigned': {
      const { text, keyboard } = freeList(await store.people(ctx.userId, 'unassigned'));
      await ctx.say(text, keyboard);
      return;
    }
    case 'search': {
      if (command.args === '') {
        await ctx.say(t('bot.search.usage'));
        return;
      }
      const query = searchQuery(command.args);
      await ctx.say(searchList(staffOrigin, await store.people(ctx.userId, 'search', query)));
      if (query.contact) {
        await ctx.deps.client.deleteMessage(ctx.chatId, ctx.messageId).catch((error: unknown) => {
          report(ctx.deps, error);
          return false;
        });
      }
      return;
    }
    case 'sync': {
      if (!sync) {
        await ctx.say(t('bot.sync.notConfigured'));
        return;
      }
      let counts: Record<string, unknown>;
      try {
        counts = await sync();
      } catch (error) {
        report(ctx.deps, error);
        await ctx.say(t('bot.sync.failed'));
        return;
      }
      await ctx.say(syncDone(counts));
      return;
    }
  }
};

// Updates ----------------------------------------------------------------------------------------------------------

/** Who wrote, if they may use the bot. Unlinked and deactivated accounts get nothing, not even an answer. */
const resolve = async (
  deps: BotDeps,
  telegramUserId: number,
): Promise<{ userId: string; access: 'onboarding' | 'staff' } | undefined> => {
  const userId = await deps.store.linkedUser(telegramUserId);
  if (!userId) {
    return undefined;
  }
  const access = await deps.store.access(userId);
  return access === 'none' ? undefined : { userId, access };
};

const handleMessage = async (message: TelegramMessage, deps: BotDeps): Promise<void> => {
  // Private chats only (ADR-0004): in a group, the bot only posts arrivals and hears its buttons.
  if (message.chat.type !== 'private' || !message.from || message.from.is_bot) {
    return;
  }
  const text = message.text?.trim();
  if (!text) {
    return;
  }
  const telegramUserId = message.from.id;
  const say = sayIn(deps, message.chat.id);
  const command = parseCommand(text);
  if (command?.command === 'start' && command.args !== '') {
    const linked = await deps.store.redeemCode(command.args, telegramUserId);
    if (linked) {
      await say(t('bot.linked'));
    } else if (LINK_CODE.test(command.args)) {
      await say(t('bot.linkInvalid'));
    }
    return;
  }
  const who = await resolve(deps, telegramUserId);
  if (!who) {
    return;
  }
  if (who.access === 'staff') {
    await say(t('bot.noPermission'));
    return;
  }
  const ctx: Context = {
    deps,
    userId: who.userId,
    telegramUserId,
    chatId: message.chat.id,
    messageId: message.message_id,
    say,
  };
  if (command) {
    await runCommand(command, ctx);
    return;
  }
  const dialog: Dialog | undefined = await deps.store.dialog(telegramUserId);
  if (dialog?.kind === 'alta') {
    await continueAlta(dialog, text, ctx);
  } else if (dialog?.kind === 'baja' && dialog.step === 'search') {
    await searchLeave(dialog, text, ctx);
  } else if (dialog) {
    await say(t('bot.pressButton'));
  } else if (looksLikeArrival(text)) {
    // A phone or an email with no command: a draft /joined (/alta), saved only once confirmed.
    await startAlta(parseArrival(text), ctx);
  } else {
    await say(t('bot.notUnderstood'));
  }
};

const handleCallback = async (query: TelegramCallbackQuery, deps: BotDeps): Promise<void> => {
  const { store, client } = deps;
  const answer = async (text?: string): Promise<void> => {
    await client.answerCallbackQuery(query.id, text).catch((error: unknown) => report(deps, error));
  };
  const who = await resolve(deps, query.from.id);
  // In the team group, anyone can press: only linked onboarding staff and admins are heard (ADR-0004).
  if (!who || who.access !== 'onboarding') {
    await answer(t('bot.notAuthorised'));
    return;
  }
  const data = query.data ?? '';
  const pressed = query.message;
  const ctx: Context = {
    deps,
    userId: who.userId,
    telegramUserId: query.from.id,
    chatId: pressed?.chat.id ?? query.from.id,
    messageId: pressed?.message_id ?? 0,
    say: sayIn(deps, pressed?.chat.type === 'private' ? pressed.chat.id : query.from.id),
  };
  const claim = /^claim:([0-9a-f-]{36})$/u.exec(data);
  if (claim?.[1]) {
    const personId = claim[1];
    const done = await store.claim(who.userId, personId);
    const [person] = done ? await store.people(who.userId, 'person', { text: personId }) : [];
    await answer(
      done ? t('bot.free.claimed', { name: nameOf(person?.name) }) : t('bot.free.taken'),
    );
    if (done) {
      await deps.notifier.claimed(personId).catch((error: unknown) => report(deps, error));
    }
    return;
  }
  if (!pressed || pressed.chat.type !== 'private') {
    await answer();
    return;
  }
  const dialog = await store.dialog(query.from.id);
  const edit = async (text: string, keyboard?: Keyboard): Promise<void> => {
    try {
      await client.editMessageText(
        pressed.chat.id,
        pressed.message_id,
        text,
        keyboard ? { keyboard } : {},
      );
    } catch (error) {
      report(deps, error);
    }
  };

  if (data.startsWith('alta:')) {
    if (dialog?.kind !== 'alta') {
      await answer(t('bot.expired'));
      return;
    }
    await answer();
    if (data === 'alta:cancel') {
      await store.endDialog(query.from.id);
      await edit(t('bot.cancelled'));
      return;
    }
    if (data === 'alta:nocontact' && dialog.step === 'contact') {
      await advanceAlta({ ...dialog, noContact: true }, ctx);
      return;
    }
    if (dialog.step !== 'confirm') {
      return;
    }
    const attach = /^alta:attach:([0-9a-f-]{36})$/u.exec(data)?.[1];
    if (attach && dialog.candidates?.includes(attach)) {
      await saveAlta(dialog, { kind: 'attach', target: attach }, ctx, {
        chatId: pressed.chat.id,
        messageId: pressed.message_id,
      });
    } else if (data === 'alta:new') {
      await saveAlta(dialog, { kind: 'new' }, ctx, {
        chatId: pressed.chat.id,
        messageId: pressed.message_id,
      });
    }
    return;
  }

  if (data.startsWith('baja:')) {
    if (dialog?.kind !== 'baja') {
      await answer(t('bot.expired'));
      return;
    }
    await answer();
    if (data === 'baja:no') {
      await store.endDialog(query.from.id);
      await edit(t('bot.baja.kept'));
      return;
    }
    const [, action, personId] = /^baja:(pick|yes):([0-9a-f-]{36})$/u.exec(data) ?? [];
    if (!personId || !dialog.options?.includes(personId)) {
      return;
    }
    const [person]: PersonLine[] = await store.people(who.userId, 'person', { text: personId });
    if (!person) {
      await edit(t('bot.baja.none'));
      return;
    }
    if (action === 'pick') {
      const { text, keyboard } = confirmLeave(person);
      await edit(text, keyboard);
      return;
    }
    await store.leave(who.userId, personId);
    await store.endDialog(query.from.id);
    await edit(t('bot.baja.done', { name: nameOf(person.name) }));
    await deleteContactMessages(ctx, dialog.chatId, dialog.contactMessages);
    return;
  }
  await answer();
};

/**
 * Handles one update from the webhook (ADR-0004): a message in a private chat, or a button press. A failure is
 * reported, never with what anyone wrote, and the person is told something went wrong.
 */
export const handleUpdate = async (update: TelegramUpdate, deps: BotDeps): Promise<void> => {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query, deps);
    } else if (update.message) {
      await handleMessage(update.message, deps);
    }
  } catch (error) {
    report(deps, error);
    const chat = update.message?.chat ?? update.callback_query?.message?.chat;
    if (chat?.type === 'private') {
      await sayIn(deps, chat.id)(t('bot.unexpected'));
    }
  }
};
