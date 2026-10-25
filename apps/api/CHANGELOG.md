# @backoffice/api

## 0.11.8

### Patch Changes

- c2b2e62: nodemailer 10.1.4: its address parser no longer turns a crafted name or comment into a recipient
  (GHSA-8c8m-p3m8-cjg8, GHSA-m943-m63m-w62w, GHSA-85x2-q946-cp5h)

## 0.11.7

### Patch Changes

- 28347af: Where people live, everywhere it's shown (PLAN R81 to R84): the team group's post says "Dónde vive: Baviera, Alemania"
  instead of "Provincia"; the bot's `/search` and `/left` find a phone by 6 or more of its digits, however written, as
  Personas does; Latin America's and the United States' regions are offered as lists in the place pickers and suggested
  in the census form ("cdmx", "Nueva York" find theirs); and the Panel's "Dónde viven" counts people by country, Spain,
  Latin America and the rest of the world, each country leading to its people in Personas.
- Updated dependencies [3ec8eec]
- Updated dependencies [28347af]
- Updated dependencies [a3222cc]
  - @backoffice/domain@0.5.4
  - @backoffice/i18n@0.15.4
  - @backoffice/db@0.5.2

## 0.11.6

### Patch Changes

- 279ee41: The Bandeja says what's going on (PLAN R78): the menu counts it on every page; each item says why it waits and what
  each answer does; a conflict sits beside its record row by row ("igual", "distinto"), contact details, place and
  dates included, with what using it would change; and a phone, email or Discord already someone else's names whose.
  A record Global's view sends again attaches only what Global changed, so a value corrected by hand isn't proposed back,
  and what differs is kept; the conflicts already waiting with nothing to show are said again or settled.
- 8df7a29: A person's page has "Escribirle": the message from Mensajes to write to them with (one's own, then the team's),
  sent by "Abrir WhatsApp", "Abrir el correo" (the mail app opens with it written) or "Copiar el mensaje" for Discord,
  Telegram or anything else, its text under "Ver el mensaje". "¿Lo has enviado?" logs the attempt on that channel,
  asking where a copied one went. A census link in Censo offers the same three ways (PLAN R77).
- 8df7a29: In Mensajes, the version for someone without a name is optional: left empty, the message goes out with {nombre}
  taken out ("Hola, {nombre}:" reads "Hola:"), as the editor shows. Messages may be up to 10,000 characters (PLAN R76).
- c60e632: Hoy keeps what one just did at hand (PLAN R79): "Mis personas" lists everyone one holds still in onboarding, what
  needs something first and then by their step's day, and "Recientes" the last people one did anything with in the past
  two weeks, newest first.
- 3298b5e: Añadir rápido says whose place it is: "Dónde vive" is a labelled group whose country, province and town sit side by
  side while they fit, no longer squeezed into each other, and "Añadir de dónde es" opens a second group for where
  they're from (PLAN R75).
- d463294: A search from anywhere (PLAN R80): Ctrl K (⌘K on a Mac), or "Buscar" in the header, opens a dialog that finds as it's
  typed: people by name, phone, email or Discord, best first, with their stage and place; contacts and organisations for
  outreach staff; what can be done and the sections. Empty, it offers the people one last worked with.
- Updated dependencies [279ee41]
- Updated dependencies [8df7a29]
- Updated dependencies [8df7a29]
- Updated dependencies [c60e632]
- Updated dependencies [3298b5e]
- Updated dependencies [d463294]
  - @backoffice/i18n@0.15.3
  - @backoffice/domain@0.5.3
  - @backoffice/db@0.5.2

## 0.11.5

### Patch Changes

- e129c02: Each onboarder writes their own WhatsApp messages in Mensajes ("Solo tú lo ves"), which nobody else sees, admins
  neither; opening WhatsApp offers them first, under "Tuyos", then the team's, under "Del equipo". The team's messages
  are written and changed by admins only now, who pick "Quién lo usa" for a new one; the rest of the team sees them with
  "Es del equipo: lo cambia quien administra." A person's history names someone else's own message as "un mensaje
  propio de quien lo envió" (PLAN R71).
- 0886a95: Where someone lives has a country, and where they're from can be said too ("De dónde es": a country and a province
  or region), for Spain's community, Spaniards abroad, Latin America's and Latin Americans abroad (PLAN R74). In the
  staff app a country is picked by typing part of its name, in Spanish or English, Spain first, then Latin America,
  then the rest of the world; while it's Spain, Spain's provinces are offered the same way, by any of their names, and
  anything else typed is kept. The census form asks the same with the phone's own picker, and its privacy summary lists
  the new data. Cards say "Maite (Baviera, Alemania)", Personas filters by country, the Bandeja compares countries,
  the CSV import reads "País", "País de origen" and "De dónde es", the Airtable sync reads Global's Country, and the
  people export adds "pais". Someone living abroad isn't asked for a province. Everyone already in the backoffice whose
  province is one of Spain's, or who came from Global's view, is set as living in Spain.
- 76bca35: Personas and Censo find a phone however it was written: a foreign number without its country code ("857 756 3987" for
  +1 857 756 3987), or 6 or more of its digits, such as its end (PLAN R72). "Cuándo fue" starts on today, on a person's
  page and on Contactos' and Organizaciones' notes; left so, nothing is recorded as another day (PLAN R73).
- Updated dependencies [e129c02]
- Updated dependencies [0886a95]
- Updated dependencies [76bca35]
  - @backoffice/i18n@0.15.2
  - @backoffice/domain@0.5.2
  - @backoffice/db@0.5.2

## 0.11.4

### Patch Changes

- 1d230ad: Node.js 26.12.1 (images on node:26.12.1-alpine), the October 21 security release.

## 0.11.3

### Patch Changes

- cead178: A contact attempt may be made on Discord: "Discord" in "Por dónde", after "Telegram". In Contacto, only digits are
  read as a phone and the hint says to write a Discord username made of digits with an @ in front; adding a detail the
  person already has says which one ("Esta ficha ya tiene ese teléfono.") instead of "Ya existe algo con esos datos."
- 11e8e7d: Hoy's "Mis personas" goes most urgent first: a late step, then one for today, then whoever is still "Nuevo" (not
  contacted yet, as someone just taken), then the rest. It always links to all of mine in Personas ("Ver todas mis
  personas"), and to all of mine that need something when it shows fewer than it counts.
- ee905db: Dependencies bump: Node 26.12.0 (images on node:26.12.0-alpine) and pnpm 12.14.0.
- Updated dependencies [cd098d5]
- Updated dependencies [cead178]
- Updated dependencies [11e8e7d]
  - @backoffice/i18n@0.15.1
  - @backoffice/domain@0.5.1
  - @backoffice/db@0.5.2

## 0.11.2

### Patch Changes

- Updated dependencies [a4a1e91]
- Updated dependencies [a42a927]
- Updated dependencies [32a393d]
- Updated dependencies [d2e6e54]
  - @backoffice/domain@0.5.0
  - @backoffice/i18n@0.15.0
  - @backoffice/db@0.5.2

## 0.11.1

### Patch Changes

- 4e92c54: A contact attempt may be a video call: "Videollamada" in "Por dónde", after "Teléfono".
- Updated dependencies [4e92c54]
  - @backoffice/domain@0.4.1
  - @backoffice/i18n@0.14.1
  - @backoffice/db@0.5.2

## 0.11.0

### Minor Changes

- 7956029: The Bandeja compares a possible duplicate with each candidate, row by row, phones and emails included but for a
  census answer's, with "igual" where they agree; "¿Es otra persona? Búscala" attaches it to whoever is found, not only
  to its candidates (a census answer, still only to its own) (PLAN R60).

### Patch Changes

- Updated dependencies [7956029]
  - @backoffice/i18n@0.14.0

## 0.10.0

### Minor Changes

- 2b540cc: Personas counts what it finds, in all and in each stage, each stage's counter being its filter; the rest of the
  filters are folded under "Más filtros", and those on are listed, each with a link that takes it off (PLAN R59). The
  Onboarding Pipeline folds its filters the same way. `GET /api/people` returns the counts with its first page.

### Patch Changes

- Updated dependencies [2b540cc]
  - @backoffice/i18n@0.13.0

## 0.9.2

### Patch Changes

- f9ff6ef: One sign-up day and one way in (PLAN R58, D17): "Llegó el" is "Fecha de alta" and "Llegó por" is "Canal de alta"
  everywhere, and "Entró por" leaves the person's page, the cards, the filters and the Panel, which counts sign-ups by
  channel alone. Whoever had no channel takes it from where they came in (Global's form, or WhatsApp through the bot).
  A person's sign-up is edited in its own card, "Alta y comunidad", which never repeats the day. Importar and
  `pnpm whatsapp:csv` call the group's columns "Entrada al grupo" and "Salida del grupo".
- Updated dependencies [f9ff6ef]
  - @backoffice/i18n@0.12.0

## 0.9.1

### Patch Changes

- Updated dependencies [47fb5d4]
  - @backoffice/i18n@0.11.0

## 0.9.0

### Minor Changes

- 2829bb3: The WhatsApp group's history comes in through Importar (PLAN R56): `pnpm whatsapp:csv`, run on the laptop that holds
  the group's export, turns it and the exporter's Google Contacts into a CSV with a row per stay in the group. The CSV
  import reads "Entró el" and "Salió el" and Baja, and saves someone known only by a phone, an email or a Discord
  username; the database records each stay once, closes it when a later export says it ended, and never reopens it.
  Joins and leaves go into a person's history on their own day. People who left come in too, as Baja (D16).

### Patch Changes

- Updated dependencies [2829bb3]
  - @backoffice/i18n@0.10.0
  - @backoffice/domain@0.4.0
  - @backoffice/db@0.5.2

## 0.8.2

### Patch Changes

- Updated dependencies [c875740]
  - @backoffice/db@0.5.1

## 0.8.1

### Patch Changes

- 6e224b4: Sharing a private contact or organisation, or merging it into the team's contact, offers "Compartir también mis
  notas" (unticked to start): ticked, what was written while it was private goes to the team too.
- Updated dependencies [6e224b4]
  - @backoffice/i18n@0.9.1

## 0.8.0

### Minor Changes

- d6f6e86: Organisations have a timeline of notes, as contacts do, and a note on either may say the day the conversation it tells
  happened ("Cuándo fue"), never one to come, shown next to who wrote it and when; timelines go by that day. Each
  organisation's old notes field became its first note (PLAN M5, step 6).
- 43e95f1: Outreach contacts, organisations and notes can be kept "Solo yo": nobody else sees them, admins neither. Sharing one
  makes it the team's for good, and a contact the team already has (an email or the phone in common) is offered to
  merge into. Campaigns write to team contacts only. In Contactos, admins answer a rights request across private
  contacts too (download or erase); in Equipo, they hand a departed member's private records to someone in outreach,
  seeing how many, never what (PLAN M5, step 6).

### Patch Changes

- Updated dependencies [d6f6e86]
- Updated dependencies [43e95f1]
  - @backoffice/i18n@0.9.0
  - @backoffice/db@0.5.0

## 0.7.0

### Minor Changes

- 5006e55: Admins set Global's Airtable view link in Ajustes, and turn the sync on or off there, instead of a sealed secret in
  gitops (ADR-0005, PLAN R49). The API stores the link encrypted with the deployment's `AIRTABLE_LINK_KEY` (a key sealed
  once by `scripts/seal-airtable-key.sh`, which never reaches the database) and never shows it again: Ajustes says who
  set it and when, and how the last run went. The sync, hourly or on demand, reads it only while it's on; off, or
  without a link, it does nothing. Importar shows the sync as off until an admin turns it on. The chart's
  `airtableSync.sharedViewUrlSecret` is now `airtableSync.linkKeySecret`, and `AIRTABLE_SHARED_VIEW_URL` is no longer
  read. The forms app only changes because the repository's root did.

### Patch Changes

- Updated dependencies [5006e55]
  - @backoffice/db@0.4.0
  - @backoffice/i18n@0.8.0

## 0.6.0

### Minor Changes

- a88d283: Censo lists everyone waiting, 50 at a time ("Ver las siguientes"), with a search by name, phone, email or Discord and
  the count of everyone waiting: it used to stop at the 200 oldest, so with more the newest never showed. On a computer
  the sidebar is tighter, so an admin's whole menu, Ajustes and Salir included, fits a 1280×720 screen.

### Patch Changes

- Updated dependencies [a88d283]
  - @backoffice/i18n@0.7.0

## 0.5.1

### Patch Changes

- cfa6c82: The admins' CSV export of Personas has a "resumen" column: each person's one-line internal summary, as on their card.

## 0.5.0

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

### Patch Changes

- a3e2970: Every database connection runs without Postgres's JIT. The planner's estimate for the attention view passes
  `jit_above_cost` with a few hundred people, and compiling the plan took ~0.6 s of a ~0.65 s Hoy (and as much of the
  Onboarding Pipeline), on every load: the query itself runs in ~20 ms.
- Updated dependencies [01e38c3]
- Updated dependencies [d00c2c0]
- Updated dependencies [a3e2970]
- Updated dependencies [a5a8778]
  - @backoffice/domain@0.3.0
  - @backoffice/i18n@0.6.0
  - @backoffice/db@0.3.0

## 0.4.1

### Patch Changes

- c101fca: The API's image no longer carries Next.js, Playwright and Vitest, which better-auth's optional peers brought in from
  the workspace: 892 MB to 435 MB (175 MB to 87 MB compressed), so each release uploads half as much. The other images
  are rebuilt only because the shared lockfile changed; nothing in them changes.

## 0.4.0

### Minor Changes

- fb626ac: The team group hears of arrivals within a window admins set in Ajustes, a week by default: someone who arrived before
  it, or on a day nobody knows, is a member entered after the fact and isn't announced. The instant post (the bot,
  Añadir) now obeys it as the sweep did.

### Patch Changes

- Updated dependencies [fb626ac]
  - @backoffice/i18n@0.5.0

## 0.3.0

### Minor Changes

- e24160b: Fewer stages, and when and where from (PLAN M5, step 3): Por clasificar folds into Nuevo and En conversación into
  "En contacto"; "Llegó el" on each person (unknown allowed, never in the future), with "Sin asignar" only for arrivals of
  the last 30 days; a day for attempts, notes and stage changes that happened another day; "Llegó por", from a list
  admins edit in Ajustes (the bot says WhatsApp, Global's form itself); a Discord username as a contact detail; the old
  "Llegó por" label on sources is now "Entró por"; the Panel counts arrivals by when and where from.

### Patch Changes

- Updated dependencies [e24160b]
  - @backoffice/domain@0.2.0
  - @backoffice/i18n@0.4.0
  - @backoffice/db@0.2.0

## 0.2.1

### Patch Changes

- Updated dependencies [b7ef3dc]
- Updated dependencies [27cd280]
  - @backoffice/i18n@0.3.0

## 0.2.0

### Minor Changes

- 013c8a1: The Telegram bot is the onboarding team's alone (D13): only active staff with the onboarding role can connect it and
  use it, not an admin without that role. The database refuses a link code or a link for anyone else, and unlinks an
  account, dropping its unused codes, when it loses the role or is deactivated; the bot's functions answer the
  onboarding role alone. Ajustes offers "Conectar Telegram" only to onboarding staff and tells everyone else the bot
  is the onboarding team's.

### Patch Changes

- cce1869: The app and the bot say "onboarding" where they said "acogida" (the role, the digest, the settings, the WhatsApp
  message, the census form's thanks and its draft privacy notice), and the board by stage is the "Onboarding Pipeline",
  at `/pipeline` instead of `/embudo` (D14).
- Updated dependencies [013c8a1]
- Updated dependencies [cce1869]
  - @backoffice/i18n@0.2.0

## 0.1.2

### Patch Changes

- 1ebe0b8: The repository is public, so it names nothing of the infrastructure: the charts' examples are fictional, and the
  deploy scripts read the cluster's settings from the gitops checkout. No change in behaviour.

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
