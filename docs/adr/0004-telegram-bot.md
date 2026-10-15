# ADR-0004: Arrivals and leaves through a Telegram bot

- **Status:** Accepted for D1 and D11 (Dani, 2026-10-15: "a telegram bot where people with the information can feed
  in the event should be enough"; "not needed as long as I can trigger the pipeline"). D12 is pending Dani:
  Claude's recommendation (accept) is what gets built unless Dani objects.
- **Date:** 2026-10-15
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G1, G2, §5; [ADR-0002](0002-authorization-and-data-protection.md) §3, §4;
  [onboarding spec §5.2](../spec/onboarding.md#52-the-telegram-bot-m1), [§8](../spec/onboarding.md#8-notifications);
  [personal data §6](../spec/personal-data.md#6-telegram-carries-some-personal-data); aisafety-newsroom `SPEC.md`
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
- aisafety-newsroom already runs a Telegram bot on the same cluster: a webhook route in its Fastify API, a small
  hand-written Bot API client, and unlinked users ignored without a reply.

## Options considered

1. **How community arrivals and leaves reach the system (D1).**
   - (a) Meta's Groups API: can't read an existing community.
   - (b) An unofficial client (Baileys) on a dedicated admin number: against WhatsApp's terms, a ban risk, and a
     session that can read every chat.
   - (c) Importing chat exports: manual, late, and full of everyone's messages.
   - (d) **People who see a join or a leave report it to a Telegram bot**, in a few seconds, from their phone.
2. **Updates.** (a) Long polling from a worker. (b) **A webhook** on the staff host, as aisafety-newsroom.
3. **Client.** (a) A bot framework. (b) **A small hand-written Bot API client**, as aisafety-newsroom: a few
   methods, no framework's dependencies.
4. **The team group (D11).** (a) Required. (b) **Optional**: the bot works for one person; posting to a team group
   turns on when one is configured.
5. **Names and phone numbers through Telegram (D12).** (a) **Accept, with the bot deleting the messages after
   saving** and never repeating contact details. (b) Names only in the bot; contact details only in the web app.

Dani chose 1d (D1) and 4b (D11). 2b and 3b are Claude's, as aisafety-newsroom. 5a is recommended; Dani decides
(D12). Revisit 1 only if reports are regularly missed.

## Decision

### 1. Linking an account

- In the web app, signed in with the second factor, a staff member taps "Conectar Telegram". The app makes a
  one-time code (valid 10 minutes, stored as a hash) and opens `https://t.me/<bot>?start=<code>`.
- The bot receives `/start <code>` and links that Telegram user ID to the staff member (`auth.telegram_links`).
- Messages from Telegram users who aren't linked are ignored without a reply, as in aisafety-newsroom.
- An account is unlinked from the web app, by an admin, or automatically when the staff member is deactivated or
  their password or second factor is reset.

### 2. What the bot does

The commands (`/alta`, `/baja`, `/mios`, `/libres`, `/buscar`, `/sincronizar`, `/ayuda`) and their replies are in
the [onboarding spec §5.2](../spec/onboarding.md#52-the-telegram-bot-m1). They work in a private chat with the bot;
replies are in Spanish.

- A message that isn't a command but contains a phone number or email is taken as a draft `/alta`, and is only
  saved after confirmation.
- **Contact details don't stay in the chat.** After an `/alta` is saved, the bot deletes the reporter's messages
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
- **What the database allows through the bot** (as `private.needs_a_person` does for tokens in aiontheballot
  ADR-0008): reporting an arrival (intake record), reporting a leave (presence), claiming a person for oneself, and
  the reads the bot's commands need. Everything else is refused when `app.channel = 'bot'`, whatever the member's
  roles: no edits to profiles, no stage changes beyond claiming, no exports, no erasure. A new table is closed to
  the bot until listed on purpose ([ADR-0002 §4](0002-authorization-and-data-protection.md#4-row-level-security-by-module-and-channel)).
- **What the bot shows** is names, stages, owners and reasons, never contact details.

### 5. Notifications

- **Team group (optional, D11):** the bot posts each new arrival, from any source, to the onboarding team's
  Telegram group: name, source, province if known, and the buttons "Me lo quedo" and "Abrir". When someone claims
  it, the message is edited to show who (`private.telegram_posts`). **No contact details** are posted in the group.
  Only linked staff can press the buttons; anyone else gets "No autorizado".
- **Daily digest** at 09:00 Europe/Madrid, by Telegram to each linked onboarder with something pending (by email to
  those without Telegram). Its content is in the [onboarding spec §8](../spec/onboarding.md#8-notifications).

### 6. Secrets

The bot token and the webhook secret are sealed in gitops, rotatable by a runbook (as aisafety-newsroom), and
never logged.

### 7. Before M1

Create the bot with BotFather and keep its token for the gitops secret ([PLAN, this week](../PLAN.md#this-week)).
Agree the reporting rule with the community's admins: whoever approves or sees a join or a leave reports it.

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
