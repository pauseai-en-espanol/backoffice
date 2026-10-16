# @backoffice/api

## 0.1.1

### Patch Changes

- 888111c: The images go to the registry's `pauseai-es` project, with PauseAI España's other apps, as `pauseai-es/backoffice-api`,
  `-web`, `-forms` and `-migrations`; the cluster pulls them with that project's robot, in the `pauseai-es-backoffice`
  namespace.

## 0.1.0

### Minor Changes

- c0ef724: The Airtable sync imports every row of Global's view by default (PLAN R14, decided by Dani):
  `AIRTABLE_REQUIRE_CHAPTER_PERMISSION=true` still limits it to the rows with the chapter-share permission ticked.
- 866007f: M0 API: sign-in with Better Auth and mandatory TOTP, invitations, the team (roles, deactivation, password links), the
  audit log, the owner's create-account and reset-authenticator commands, and the session-cleanup job.
- 5879bda: The bot's commands in English with Spanish names that work the same (PLAN R38): `/joined` (`/alta`), `/left`
  (`/baja`), `/mine` (`/mios`), `/unassigned` (`/libres`), `/search` (`/buscar`), `/sync` (`/sincronizar`), `/help`
  (`/ayuda`), `/cancel` (`/cancelar`). The API sets Telegram's command menu on every start, by the Spanish names
  and, for English Telegram, by the English ones, described in Spanish; replies name a command by both names.
- 9b8add8: M2 census API: the forms app's routes (shared secret, rate limit, honeypot, fill time, normalised contact details),
  Censo's progress and queue, personal links with a WhatsApp message ready, marking them sent, the option lists, a
  person's census answers on their page, and the admin's export (JSON) and erasure.
- 88b04bb: The forms app's routes are served on a port of their own (`FORMS_PORT`, 3003), the only one the forms app's pods
  are admitted to: a forms pod taken over reaches neither sign-in nor the staff routes. The charts expose and use it,
  and the network policy check keeps it so.
- 1c5bd11: Arrivals without a name (PLAN R37): most bot reports carry only a phone number, so the bot saves a phone or an email
  alone in one step, without asking for a name, and quick-add needs a phone or an email but not a name. Such a person
  shows as "Sin nombre" in the bot, the team group and the staff app, is greeted without a name in WhatsApp, and gets a
  name from a later report, the census, a merge or their page; a name, once known, is never emptied.
- ba205cc: M1 onboarding API: Hoy, Personas (search, filters, cursor), Embudo, Persona (profile, identities, presence, timeline,
  WhatsApp link), quick-add with the duplicate check, the Bandeja, merging, claiming, contact attempts and notes, CSV
  import with a dry run, the Airtable sync (on demand and as an hourly job), settings, and the admin's CSV export.
- e38e0f2: M3 outreach API: organisations, contacts and campaigns with their templates, anchors and targets; each letter
  rendered and handed over (text, mailto: and wa.me links), never sent; Siguiente, the next target in send order;
  "Sí, enviado"; a contact's erasure; and the one-off import of a campaign from the outreach repo's files, dry run
  first. The Bandeja shows a census answer without its contact details, and a census list is reordered in one go.
- e38e0f2: M4 Panel: people by stage, arrivals per week by source, how long arrivals waited for a first contact attempt, and who
  has waited more than 48 hours with nobody on them.
- f4a9480: The Telegram bot (M1): linking staff accounts from the staff app, the webhook, /alta, /baja, /mios, /libres,
  /buscar, /sincronizar, /ayuda and /cancelar, contact details deleted from the chat once saved, the team group's posts
  and claims, the daily digest and the dialog clean-up jobs, and the owner's telegram-webhook command.

### Patch Changes

- 7fc7783: Errors are logged without what could quote a person (a database error's detail and where are dropped; messages,
  stacks and every log line are redacted of emails and phone numbers), and an error no route caught answers
  `{"error":"internal"}` instead of its message.
- 6c25821: The bot deletes messages with a phone or email from every conversation that ends without saving or expires, and
  `/sync` runs at most ten times an hour per person, one sync at a time.
- 1901b93: Names and provinces from outside are posted to Telegram with look-alike characters for dots, @, `://` and a leading
  slash, so a sign-up can't put a clickable link in the team group.
- 9472502: The exports (people CSV, a person's data) refuse a request another site started, so a page can't make an admin's
  browser download one or log an export in their name.
- a3e2c8f: M2 census form: the public form on its own host (generic and personal links, the token only in the address's
  fragment), which reaches the API's census routes only from its server, with the shared secret; no cookies, no
  sessions, nothing third-party; a draft privacy notice until the association publishes its own. The API chart takes
  the census settings (the public role, the shared secret, the form's origin) and lets the form's pods in.
- d7ac345: A Telegram link code belongs to the session that made it and goes when that session ends, and only an account with
  its second factor can be linked: a code kept from before a password or authenticator reset no longer links the bot.
- Updated dependencies [5879bda]
- Updated dependencies [6c25821]
- Updated dependencies [9b8add8]
- Updated dependencies [6d930b7]
- Updated dependencies [613d8ea]
- Updated dependencies [a3e2c8f]
- Updated dependencies [1c5bd11]
- Updated dependencies [a4b91d0]
- Updated dependencies [8b141b4]
- Updated dependencies [e38e0f2]
- Updated dependencies [e38e0f2]
- Updated dependencies [e38e0f2]
- Updated dependencies [a5b0903]
- Updated dependencies [f4a9480]
- Updated dependencies [5cf2102]
- Updated dependencies [970da1b]
- Updated dependencies [7bbad20]
- Updated dependencies [54b233e]
  - @backoffice/domain@0.1.0
  - @backoffice/i18n@0.1.0
  - @backoffice/db@0.1.0
  - @backoffice/observability@0.1.0
