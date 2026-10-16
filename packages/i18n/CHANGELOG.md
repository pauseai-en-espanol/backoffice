# @backoffice/i18n

## 0.8.0

### Minor Changes

- 5006e55: Admins set Global's Airtable view link in Ajustes, and turn the sync on or off there, instead of a sealed secret in
  gitops (ADR-0005, PLAN R49). The API stores the link encrypted with the deployment's `AIRTABLE_LINK_KEY` (a key sealed
  once by `scripts/seal-airtable-key.sh`, which never reaches the database) and never shows it again: Ajustes says who
  set it and when, and how the last run went. The sync, hourly or on demand, reads it only while it's on; off, or
  without a link, it does nothing. Importar shows the sync as off until an admin turns it on. The chart's
  `airtableSync.sharedViewUrlSecret` is now `airtableSync.linkKeySecret`, and `AIRTABLE_SHARED_VIEW_URL` is no longer
  read. The forms app only changes because the repository's root did.

## 0.7.0

### Minor Changes

- a88d283: Censo lists everyone waiting, 50 at a time ("Ver las siguientes"), with a search by name, phone, email or Discord and
  the count of everyone waiting: it used to stop at the 200 oldest, so with more the newest never showed. On a computer
  the sidebar is tighter, so an admin's whole menu, Ajustes and Salir included, fits a 1280×720 screen.

## 0.6.0

### Minor Changes

- 01e38c3: Cards say who someone is (PLAN M5, step 4): the name with the province ("Maite (Madrid)"), a one-line internal
  summary the team writes in the profile (never sent to Telegram), and what is missing in plain words ("Falta: correo ·
  qué quiere hacer"), on Hoy, Personas, the Onboarding Pipeline, the Bandeja, Censo and the person's page.
- d00c2c0: Mensajes: the onboarding team writes the WhatsApp messages newcomers receive (the welcome and the census link's) in
  the staff app instead of in code. Several per purpose, picked when WhatsApp is opened; `{nombre}`, `{yo}` and
  `{enlace}` as placeholders, anything else refused as it's typed and by the database; a version for someone without a
  name; a preview. Each change is a new version, and the contact attempt and the census link name the message and
  version that went out. The code's own census link message no longer says "onboarding".
- a5a8778: Team accounts linked to their person (PLAN M5, step 5): an admin links an account to its own person record, from the
  person's page or from Equipo, where the person sharing the account's email is suggested. The person shows "Equipo",
  and Personas and the Onboarding Pipeline filter by it. The link grants nothing; a deactivated account keeps it
  without the badge, a merge moves it to the survivor, and erasure removes it.

## 0.5.0

### Minor Changes

- fb626ac: The team group hears of arrivals within a window admins set in Ajustes, a week by default: someone who arrived before
  it, or on a day nobody knows, is a member entered after the fact and isn't announced. The instant post (the bot,
  Añadir) now obeys it as the sweep did.

## 0.4.0

### Minor Changes

- e24160b: Fewer stages, and when and where from (PLAN M5, step 3): Por clasificar folds into Nuevo and En conversación into
  "En contacto"; "Llegó el" on each person (unknown allowed, never in the future), with "Sin asignar" only for arrivals of
  the last 30 days; a day for attempts, notes and stage changes that happened another day; "Llegó por", from a list
  admins edit in Ajustes (the bot says WhatsApp, Global's form itself); a Discord username as a contact detail; the old
  "Llegó por" label on sources is now "Entró por"; the Panel counts arrivals by when and where from.

## 0.3.0

### Minor Changes

- b7ef3dc: The menu is in groups by role, each list named by its group: Onboarding, Relaciones externas and Equipo, then Ajustes
  and Salir. On a computer it is a sidebar that stays in view; on a phone the same groups open under "Menú". Censo is
  listed only while the census form is configured (PLAN M5).
- 27cd280: A person's page leads with what is done most, which is what a phone shows first when the bot's "Abrir" opens it:
  "Me lo quedo" by the owner line, then quick actions (WhatsApp, the stage and the owner), the next step, and a contact
  attempt or a note behind their buttons; contact moves next to the profile, with adding another phone or email folded.
  Hoy lists the ten oldest unassigned, then "Ver los N sin asignar", to Personas filtered to them (PLAN M5).

## 0.2.0

### Minor Changes

- 013c8a1: The Telegram bot is the onboarding team's alone (D13): only active staff with the onboarding role can connect it and
  use it, not an admin without that role. The database refuses a link code or a link for anyone else, and unlinks an
  account, dropping its unused codes, when it loses the role or is deactivated; the bot's functions answer the
  onboarding role alone. Ajustes offers "Conectar Telegram" only to onboarding staff and tells everyone else the bot
  is the onboarding team's.
- cce1869: The app and the bot say "onboarding" where they said "acogida" (the role, the digest, the settings, the WhatsApp
  message, the census form's thanks and its draft privacy notice), and the board by stage is the "Onboarding Pipeline",
  at `/pipeline` instead of `/embudo` (D14).

## 0.1.0

### Minor Changes

- 5879bda: The bot's commands in English with Spanish names that work the same (PLAN R38): `/joined` (`/alta`), `/left`
  (`/baja`), `/mine` (`/mios`), `/unassigned` (`/libres`), `/search` (`/buscar`), `/sync` (`/sincronizar`), `/help`
  (`/ayuda`), `/cancel` (`/cancelar`). The API sets Telegram's command menu on every start, by the Spanish names
  and, for English Telegram, by the English ones, described in Spanish; replies name a command by both names.
- 9b8add8: M2 census API: the forms app's routes (shared secret, rate limit, honeypot, fill time, normalised contact details),
  Censo's progress and queue, personal links with a WhatsApp message ready, marking them sent, the option lists, a
  person's census answers on their page, and the admin's export (JSON) and erasure.
- 613d8ea: M0 foundations: database roles, staff, invitations, audit log and Better Auth's schema; Spanish messages; error
  tracking's privacy options.
- a3e2c8f: M2 census form: the public form on its own host (generic and personal links, the token only in the address's
  fragment), which reaches the API's census routes only from its server, with the shared secret; no cookies, no
  sessions, nothing third-party; a draft privacy notice until the association publishes its own. The API chart takes
  the census settings (the public role, the shared secret, the form's origin) and lets the form's pods in.
- 1c5bd11: Arrivals without a name (PLAN R37): most bot reports carry only a phone number, so the bot saves a phone or an email
  alone in one step, without asking for a name, and quick-add needs a phone or an email but not a name. Such a person
  shows as "Sin nombre" in the bot, the team group and the staff app, is greeted without a name in WhatsApp, and gets a
  name from a later report, the census, a merge or their page; a name, once known, is never emptied.
- e38e0f2: M3 outreach API: organisations, contacts and campaigns with their templates, anchors and targets; each letter
  rendered and handed over (text, mailto: and wa.me links), never sent; Siguiente, the next target in send order;
  "Sí, enviado"; a contact's erasure; and the one-off import of a campaign from the outreach repo's files, dry run
  first. The Bandeja shows a census answer without its contact details, and a census list is reordered in one go.
- e38e0f2: M4 Panel: people by stage, arrivals per week by source, how long arrivals waited for a first contact attempt, and who
  has waited more than 48 hours with nobody on them.
- f4a9480: The Telegram bot (M1): linking staff accounts from the staff app, the webhook, /alta, /baja, /mios, /libres,
  /buscar, /sincronizar, /ayuda and /cancelar, contact details deleted from the chat once saved, the team group's posts
  and claims, the daily digest and the dialog clean-up jobs, and the owner's telegram-webhook command.
- 5cf2102: The staff web app for M0, in Spanish: sign-in with a mandatory second factor, password recovery, invitations, the
  team (invite, roles, deactivation, password links) and the audit log for admins; the shared Panda preset.
- 970da1b: M1 onboarding pages: Hoy (my people needing attention and the unassigned queue, with "Me lo quedo"), Personas (search,
  filters, "Cargar más", the admins' CSV export), a person's page (contact details, WhatsApp handover, stage and owner,
  next action, contact attempts and notes, profile, community presence, the timeline, merging), Embudo, Añadir rápido
  (with possible duplicates as you type), the Bandeja, Importar (the Airtable sync and the CSV import with its dry run),
  and Ajustes (linking Telegram, the onboarding settings). A menu on phones.
- 7bbad20: M2 staff web app: Censo (progress, the generic link from CENSUS_URL, and personal links made once and sent from the
  onboarder's own WhatsApp); a person's census answers and consents, and, for admins, exporting or erasing their data;
  census answers in the Bandeja, shown in words; and the census's lists in Ajustes, which admins edit.
- 54b233e: M3 staff web app: Siguiente (the next letter to send, read before sending, opened in the sender's own mail or copied
  part by part, then "¿La has enviado?"; nothing sends on its own); Campañas, with each campaign's targets by status in
  send order, its templates by tier, its evidence paragraphs and a preview of any contact's letter; Contactos, the
  directory with its filters, review, hold, notes and, for admins, erasure; Organizaciones; and the admins' import of a
  campaign from the outreach repo, with a dry run first.

### Patch Changes

- 6c25821: The bot deletes messages with a phone or email from every conversation that ends without saving or expires, and
  `/sync` runs at most ten times an hour per person, one sync at a time.
- a4b91d0: The draft privacy notice no longer promises erasure after 12 months: D9 decided no automatic erasure, so data stays
  until the person asks for it to be erased.
