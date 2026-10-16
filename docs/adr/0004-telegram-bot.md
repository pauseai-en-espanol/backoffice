# ADR-0004: Arrivals and leaves through a Telegram bot

- **Status:** Accepted for D1 and D11 (Dani, 2026-10-15: "a telegram bot where people with the information can feed
  in the event should be enough"; "not needed as long as I can trigger the pipeline"), and for D12 (Dani,
  2026-10-16: accept, as built).
- **Date:** 2026-10-15
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G1, G2, §5; [ADR-0002](0002-authorization-and-data-protection.md) §3, §4;
  [onboarding spec §5.2](../spec/onboarding.md#52-the-telegram-bot-m1), [§8](../spec/onboarding.md#8-notifications);
  [personal data §6](../spec/personal-data.md#6-telegram-carries-some-personal-data)
  (R-CAP-1, R-CAP-2)

## Context

- People join and leave the WhatsApp community through any of its tens of chats. Only the community's admins see
  it happen, and the onboarding team, who must act on it, sees nothing (BRIEF §1).
- **Meta's official WhatsApp Groups API** only manages groups the business itself created, capped at 8
  participants, so it can't read an existing community
  ([Periskope](https://periskope.app/blog/whatsapp-groups-api-requirements-eligibility-limits),
  [Unipile](https://www.unipile.com/whatsapp-group-api/); checked 2026-10-15).
- **Unofficial clients** (Baileys) could, from a dedicated number made admin, but break WhatsApp's terms, risk that
  number being banned, and hold a session that can read every chat.
- **The Telegram Bot API** lets a bot receive updates by webhook with a `secret_token` header it checks
  ([Bot API, `setWebhook`](https://core.telegram.org/bots/api#setwebhook)), and delete incoming messages in a
  private chat within 48 hours
  ([`deleteMessage`, as mirrored by aiogram](https://docs.aiogram.dev/en/latest/api/methods/delete_message.html)).
- Another project already runs a Telegram bot on the same cluster: a webhook route in its Fastify API, a small
  hand-written Bot API client, and unlinked users ignored without a reply.

## Options considered

1. **How community arrivals and leaves reach the system (D1).**
   - (a) Meta's Groups API: can't read an existing community.
   - (b) An unofficial client (Baileys) on a dedicated admin number: against WhatsApp's terms, a ban risk, and a
     session that can read every chat.
   - (c) Importing chat exports: manual, late, and full of everyone's messages.
   - (d) **People who see a join or a leave report it to a Telegram bot**, in a few seconds, from their phone.
2. **Updates.** (a) Long polling from a worker. (b) **A webhook** on the staff host, as that bot.
3. **Client.** (a) A bot framework. (b) **A small hand-written Bot API client**, as that bot: a few
   methods, no framework's dependencies.
4. **The team group (D11).** (a) Required. (b) **Optional**: the bot works for one person; posting to a team group
   turns on when one is configured.
5. **Names and phone numbers through Telegram (D12).** (a) **Accept, with the bot deleting the messages after
   saving** and never repeating contact details. (b) Names only in the bot; contact details only in the web app.

Dani chose 1d (D1) and 4b (D11). 2b and 3b are Claude's, as that bot. Dani chose 5a
(D12). Revisit 1 only if reports are regularly missed.

## Decision

### 1. Linking an account

- In the web app, signed in with the second factor, a staff member taps "Conectar Telegram". The app makes a
  one-time code (valid 10 minutes, stored as a hash) and opens `https://t.me/<bot>?start=<code>`.
- **The bot is the onboarding team's alone** (D13, Dani, 2026-10-16: "only people from onboarding should be able to
  interact with the bot"; an admin without the onboarding role neither). Only active staff with the onboarding role
  see "Conectar Telegram" and get a code; the database holds it whatever the app does: a code or a link for anyone
  else is refused (`needs_onboarding`), and the bot's functions answer the onboarding role alone.
- The bot receives `/start <code>` and links that Telegram user ID to the staff member (`auth.telegram_links`).
- Messages from Telegram users who aren't linked are ignored without a reply, as by that bot.
- An account is unlinked from the web app, by an admin, or automatically when the staff member loses the onboarding
  role or is deactivated (in the database, `unlinks_telegram`, which also drops their unused codes), or their
  password or second factor is reset.

### 2. What the bot does

The commands (`/joined`, `/left`, `/mine`, `/unassigned`, `/search`, `/sync`, `/help`, `/cancel`, each also by its
Spanish name: `/alta`, `/baja`, `/mios`, `/libres`, `/buscar`, `/sincronizar`, `/ayuda`, `/cancelar`; PLAN R38) and
their replies are in the [onboarding spec §5.2](../spec/onboarding.md#52-the-telegram-bot-m1). They work in a
private chat with the bot; replies are in Spanish, and name a command by both names, English first: "/joined
(/alta)". The API sets Telegram's command menu on every start (`setMyCommands`): the Spanish names by default, so
Catalan, Galician or Basque Telegram sees them too, and the English ones for people whose Telegram is in English
(`language_code: en`), described in Spanish in both.

- A message that isn't a command but contains a phone number or email is taken as a draft `/joined`, and is only
  saved after confirmation.
- **Contact details don't stay in the chat.** After a `/joined` is saved, the bot deletes the reporter's messages
  that contained the phone or email (the Bot API allows it in a private chat within 48 hours). Its own replies
  never repeat contact details.
- The state of a conversation in progress lives in the database (`private.telegram_dialogs`) and expires after an
  hour.

### 3. Webhook

- `/telegram/webhook` on the staff host. The API registers it with a `secret_token` and refuses (`401`) any
  request whose `X-Telegram-Bot-Api-Secret-Token` doesn't match, compared in constant time.
- Each `update_id` is processed once (`private.telegram_updates`), so redeliveries are harmless.
- Bodies are size-limited, and never logged.
- Fastify routes in `apps/api`, a small hand-written Bot API client, no bot framework.

### 4. Who it acts as, and what the database allows

- An update from a linked Telegram user runs through `withActor` as that staff member, with `app.channel = 'bot'`.
  It counts as second-factor level, because the link was made from a session that had the second factor, and
  holding the Telegram account is the factor after that.
- **What the database allows through the bot** (as an earlier project's `private.needs_a_person` does for its
  tokens): reporting an arrival (intake record), reporting a leave (presence), claiming a person for oneself, and
  the reads the bot's commands need. Everything else is refused when `app.channel = 'bot'`, whatever the member's
  roles: no edits to profiles, no stage changes beyond claiming, no exports, no erasure. A new table is closed to
  the bot until listed on purpose ([ADR-0002 §4](0002-authorization-and-data-protection.md#4-row-level-security-by-module-and-channel)).
- **What the bot shows** is names, stages, owners and reasons, never contact details. Most reports carry only a
  phone number: the person is saved without a name and shown as "Sin nombre" until staff name them (PLAN R37).

### 5. Notifications

- **Team group (optional, D11):** the bot posts each new arrival, from any source, to the onboarding team's
  Telegram group: name, source, province if known, and the buttons "Me lo quedo" and "Abrir". When someone claims
  it, the message is edited to show who (`private.telegram_posts`). **No contact details** are posted in the group.
  Only linked staff can press the buttons; anyone else gets "No autorizado".
- **Daily digest** at 09:00 Europe/Madrid, by Telegram to each linked onboarder with something pending (by email to
  those without Telegram). Its content is in the [onboarding spec §8](../spec/onboarding.md#8-notifications).

### 6. Secrets

The bot token and the webhook secret are sealed in gitops, rotatable by a runbook, and
never logged.

### 7. Before M1

Create the bot with BotFather and keep its token for the gitops secret ([PLAN, this week](../PLAN.md#this-week)).
Agree the reporting rule with the community's admins: whoever approves or sees a join or a leave reports it.

### 8. As built (M1)

- **Linking:** `POST /api/telegram/link` makes a code of 32 random bytes (base64url), kept only as its SHA-256 in
  `auth.telegram_link_codes` for ten minutes; `/start <code>` uses it once and writes `auth.telegram_links` (one
  Telegram account per staff member, and the other way round). Deactivating a staff member, a password reset and the
  owner's reset of an authenticator delete the link. A code belongs to the signed-in session that made it and goes
  when that session ends (each of those ends them, as does signing out), and the database links only an account with
  its second factor, so no code kept from before a reset links the bot after it. Spent codes go with the daily
  session clean-up.
- **The webhook** answers only on the staff host, and is registered by the API on every start (same address and
  secret, so a restart changes nothing); `node dist/telegram-webhook.js` registers it by hand
  ([rotating the bot's token](../runbooks/rotating-the-bot-token.md)). An update is recorded before it is handled, and
  acknowledged with 200 even when handling it failed, which is reported (by its kind, never with what anyone wrote)
  and told to the person.
- **Who it listens to:** unlinked accounts and deactivated staff get no answer; staff without the onboarding role,
  admins included, can't be linked (D13), and one linked from before is told they may not. Every call runs as the
  linked staff member through the bot channel, and reaches people only through `private.bot_people`,
  `bot_candidates`, `bot_summary`, `submit_intake`, `claim_person` and `report_leave`.
- **Contact details:** a `/joined` is saved only after the reporter confirms; its external id is
  `tg:<chat>:<first message>`, so a repeated confirmation saves once. Then every message of the conversation that
  held a phone or email is deleted, and the bot says whether it could. A `/left` or `/search` by phone deletes its
  message too. So does a conversation that ends without saving (`/cancel`, "Cancelar", "No", or another command),
  and one that expires: the API forgets expired conversations every ten minutes and deletes their messages, within
  Telegram's 48 hours (security review, 2026-10-16).
- **`/sync`** runs at most ten times an hour per person, as the staff app's button, and one sync at a time: a request
  while one runs gets its result instead of reading Global's view again.
- **Text from outside links nowhere:** names and provinces come from forms, Airtable and CSVs, and Telegram makes
  links of addresses, domains, emails, @handles and /commands even in plain text. The bot posts them with look-alike
  characters for the dot, the @, `://` and a leading slash (`unlinked` in `replies.ts`), so a sign-up can't put a
  link in the team group.
- **The team group:** posts are claimed by inserting their row first (`private.telegram_posts`, message id empty
  until sent), so two senders never post one arrival twice. Arrivals the bot or the staff app made are posted at
  once; the API sweeps the last 48 hours' arrivals every five minutes for the rest (the hourly Airtable sync, CSV
  imports), through `private.team_card` and `private.team_unposted`, the two functions that run without an actor
  ([ADR-0002 §4](0002-authorization-and-data-protection.md#4-row-level-security-by-module-and-channel)). Only
  someone who arrived in the last two days ("Llegó el", PLAN M5) is an arrival: a member entered after the fact, or
  an old Global sign-up a sync brings with its date, is not posted.
- **The digest** reads who gets one as the auth role, and each digest as that staff member through the bot's
  functions, so it holds exactly what their own `/mine` would; it goes by Telegram if they linked it, else by mail.

## Consequences

- **Easier:** no WhatsApp integration to keep alive or get banned; reporting takes seconds from a phone; the team
  hears about every arrival from any source in one place.
- **Harder:** coverage depends on people reporting. Requiring approval to join the community, where it allows it,
  routes every arrival through an admin who can report it.
- **Risks accepted:** a stolen Telegram account of a linked member can report arrivals and leaves, claim people,
  and see the names and stages that member's bot commands return, until the link is removed. Every action is in
  the audit log with the `bot` channel, so it is visible. Names and phone numbers typed into the bot pass through
  Telegram's servers until the bot deletes them (D12).
- **Revisit:** reading WhatsApp only if reports are regularly missed.
