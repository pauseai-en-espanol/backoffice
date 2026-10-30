# @backoffice/migrations

## 0.11.0

### Minor Changes

- 0b1bce8: The books' API (ADR-0006, M6 step 2): years, the chart, counterparties and projects; Ingreso, Gasto, Traspaso and
  Asiento manual, saved as drafts or posted, with amounts and days written the Spanish way (`1.234,56`, `30/10/2026`);
  Corregir; the journal, the ledger, income and expenses, the balance sheet and a project's report, each exportable as
  CSV. Closing a year and the exports want a second factor of the last 12 hours, and every export is recorded.
- 70a43ac: The books' database (ADR-0006, M6 step 1): a Tesorería role, which Equipo can grant; the chart of accounts seeded
  from the small non-profits' plan; counterparties, projects, fiscal years, journal entries and their lines, and
  receipts' rows, which tesorería writes and admins read, with nothing for the bot. Posted entries balance, never
  change, are numbered in their year without gaps and are reversed at most once; closed years refuse writes, and
  closing one posts its closing entry and the next year's opening entry.

## 0.10.0

### Minor Changes

- 19c2840: Confirming it's you again before the riskiest actions (PLAN D23). Sessions last up to a week now, so erasure, exports,
  the rights lookup, Equipo's changes, what admins change in Ajustes, the audit log and adding a passkey want a code or
  a passkey of the last 12 hours: if it is older, the page goes to "Confirma que eres tú" and comes back once confirmed.
  Five wrong codes there end the session.
- 470a216: Signing in less often (PLAN D22). A session now ends 48 hours after it was last used, and a week after sign-in at the
  latest, instead of 12 hours after sign-in whatever happened. And passkeys, optional: in Ajustes, "Llaves de acceso"
  adds one on this computer or phone (or in a password manager), and Entrar's "Usar una llave de acceso" then signs in
  with it alone, the device checking the fingerprint, face or PIN. The password and the code keep working; the owner's
  reset of a lost authenticator removes the passkeys too.

## 0.9.7

### Patch Changes

- 9ef388b: Dependencies bump

## 0.9.6

### Patch Changes

- 28347af: Where people live, everywhere it's shown (PLAN R81 to R84): the team group's post says "Dónde vive: Baviera, Alemania"
  instead of "Provincia"; the bot's `/search` and `/left` find a phone by 6 or more of its digits, however written, as
  Personas does; Latin America's and the United States' regions are offered as lists in the place pickers and suggested
  in the census form ("cdmx", "Nueva York" find theirs); and the Panel's "Dónde viven" counts people by country, Spain,
  Latin America and the rest of the world, each country leading to its people in Personas.

## 0.9.5

### Patch Changes

- 279ee41: The Bandeja says what's going on (PLAN R78): the menu counts it on every page; each item says why it waits and what
  each answer does; a conflict sits beside its record row by row ("igual", "distinto"), contact details, place and
  dates included, with what using it would change; and a phone, email or Discord already someone else's names whose.
  A record Global's view sends again attaches only what Global changed, so a value corrected by hand isn't proposed back,
  and what differs is kept; the conflicts already waiting with nothing to show are said again or settled.
- 8df7a29: In Mensajes, the version for someone without a name is optional: left empty, the message goes out with {nombre}
  taken out ("Hola, {nombre}:" reads "Hola:"), as the editor shows. Messages may be up to 10,000 characters (PLAN R76).

## 0.9.4

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

## 0.9.3

### Patch Changes

- 1d230ad: Node.js 26.12.1 (images on node:26.12.1-alpine), the October 21 security release.

## 0.9.2

### Patch Changes

- cead178: A contact attempt may be made on Discord: "Discord" in "Por dónde", after "Telegram". In Contacto, only digits are
  read as a phone and the hint says to write a Discord username made of digits with an @ in front; adding a detail the
  person already has says which one ("Esta ficha ya tiene ese teléfono.") instead of "Ya existe algo con esos datos."
- ee905db: Dependencies bump: Node 26.12.0 (images on node:26.12.0-alpine) and pnpm 12.14.0.

## 0.9.1

### Patch Changes

- 4e92c54: A contact attempt may be a video call: "Videollamada" in "Por dónde", after "Teléfono".

## 0.9.0

### Minor Changes

- 7956029: The Bandeja compares a possible duplicate with each candidate, row by row, phones and emails included but for a
  census answer's, with "igual" where they agree; "¿Es otra persona? Búscala" attaches it to whoever is found, not only
  to its candidates (a census answer, still only to its own) (PLAN R60).

## 0.8.1

### Patch Changes

- f9ff6ef: One sign-up day and one way in (PLAN R58, D17): "Llegó el" is "Fecha de alta" and "Llegó por" is "Canal de alta"
  everywhere, and "Entró por" leaves the person's page, the cards, the filters and the Panel, which counts sign-ups by
  channel alone. Whoever had no channel takes it from where they came in (Global's form, or WhatsApp through the bot).
  A person's sign-up is edited in its own card, "Alta y comunidad", which never repeats the day. Importar and
  `pnpm whatsapp:csv` call the group's columns "Entrada al grupo" and "Salida del grupo".

## 0.8.0

### Minor Changes

- 2829bb3: The WhatsApp group's history comes in through Importar (PLAN R56): `pnpm whatsapp:csv`, run on the laptop that holds
  the group's export, turns it and the exporter's Google Contacts into a CSV with a row per stay in the group. The CSV
  import reads "Entró el" and "Salió el" and Baja, and saves someone known only by a phone, an email or a Discord
  username; the database records each stay once, closes it when a later export says it ended, and never reopens it.
  Joins and leaves go into a person's history on their own day. People who left come in too, as Baja (D16).

## 0.7.2

### Patch Changes

- c875740: Organisations' old notes column is dropped: each one's notes became the first note of its timeline (PLAN R50).

## 0.7.1

### Patch Changes

- 6e224b4: Sharing a private contact or organisation, or merging it into the team's contact, offers "Compartir también mis
  notas" (unticked to start): ticked, what was written while it was private goes to the team too.

## 0.7.0

### Minor Changes

- d6f6e86: Organisations have a timeline of notes, as contacts do, and a note on either may say the day the conversation it tells
  happened ("Cuándo fue"), never one to come, shown next to who wrote it and when; timelines go by that day. Each
  organisation's old notes field became its first note (PLAN M5, step 6).
- 43e95f1: Outreach contacts, organisations and notes can be kept "Solo yo": nobody else sees them, admins neither. Sharing one
  makes it the team's for good, and a contact the team already has (an email or the phone in common) is offered to
  merge into. Campaigns write to team contacts only. In Contactos, admins answer a rights request across private
  contacts too (download or erase); in Equipo, they hand a departed member's private records to someone in outreach,
  seeing how many, never what (PLAN M5, step 6).

## 0.6.0

### Minor Changes

- 5006e55: Admins set Global's Airtable view link in Ajustes, and turn the sync on or off there, instead of a sealed secret in
  gitops (ADR-0005, PLAN R49). The API stores the link encrypted with the deployment's `AIRTABLE_LINK_KEY` (a key sealed
  once by `scripts/seal-airtable-key.sh`, which never reaches the database) and never shows it again: Ajustes says who
  set it and when, and how the last run went. The sync, hourly or on demand, reads it only while it's on; off, or
  without a link, it does nothing. Importar shows the sync as off until an admin turns it on. The chart's
  `airtableSync.sharedViewUrlSecret` is now `airtableSync.linkKeySecret`, and `AIRTABLE_SHARED_VIEW_URL` is no longer
  read. The forms app only changes because the repository's root did.

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

## 0.3.0

### Minor Changes

- e24160b: Fewer stages, and when and where from (PLAN M5, step 3): Por clasificar folds into Nuevo and En conversación into
  "En contacto"; "Llegó el" on each person (unknown allowed, never in the future), with "Sin asignar" only for arrivals of
  the last 30 days; a day for attempts, notes and stage changes that happened another day; "Llegó por", from a list
  admins edit in Ajustes (the bot says WhatsApp, Global's form itself); a Discord username as a contact detail; the old
  "Llegó por" label on sources is now "Entró por"; the Panel counts arrivals by when and where from.

## 0.2.0

### Minor Changes

- 013c8a1: The Telegram bot is the onboarding team's alone (D13): only active staff with the onboarding role can connect it and
  use it, not an admin without that role. The database refuses a link code or a link for anyone else, and unlinks an
  account, dropping its unused codes, when it loses the role or is deactivated; the bot's functions answer the
  onboarding role alone. Ajustes offers "Conectar Telegram" only to onboarding staff and tells everyone else the bot
  is the onboarding team's.

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

- 6d930b7: M2 census schema: skills and areas to help in, edited in settings; a person's options; consents as a history with the
  wording's version; personal links; the census form's two functions for the public role; census answers in the
  Bandeja; erasure by anonymisation.
- 613d8ea: M0 foundations: database roles, staff, invitations, audit log and Better Auth's schema; Spanish messages; error
  tracking's privacy options.
- 1c5bd11: Arrivals without a name (PLAN R37): most bot reports carry only a phone number, so the bot saves a phone or an email
  alone in one step, without asking for a name, and quick-add needs a phone or an email but not a name. Such a person
  shows as "Sin nombre" in the bot, the team group and the staff app, is greeted without a name in WhatsApp, and gets a
  name from a later report, the census, a merge or their page; a name, once known, is never emptied.
- 8b141b4: M1 onboarding schema: people, identities, sources, community presence and the timeline; intake records and one
  matcher for every source; the Bandeja; merging; claiming and leaves; the attention rules; the bot's narrow functions;
  the Airtable sync's one function. Domain: contact normalisation, stages, attention reasons, and reading what the bot is
  told.
- e38e0f2: M3 outreach schema: organisations, contacts (tier, relationship stage, reason and sources, or to review; hold; a
  verified treatment only), campaigns with versioned templates per tier and sourced anchors, targets with the outreach
  CLI's statuses (never made ready or sent while their contact needs review or is held), an append-only timeline, and
  a contact's erasure. The letter renderer ported from the outreach CLI: merge fields that fail rather than blank, the
  neutral greeting, the dash and filler checks, the send order, and a mailto: link.
- f4a9480: The Telegram bot (M1): linking staff accounts from the staff app, the webhook, /alta, /baja, /mios, /libres,
  /buscar, /sincronizar, /ayuda and /cancelar, contact details deleted from the chat once saved, the team group's posts
  and claims, the daily digest and the dialog clean-up jobs, and the owner's telegram-webhook command.

### Patch Changes

- 517fdba: Two generic census answers with the same new email or phone at once no longer fail: the second waits for the first
  and goes to the Bandeja.
- d7ac345: A Telegram link code belongs to the session that made it and goes when that session ends, and only an account with
  its second factor can be linked: a code kept from before a password or authenticator reset no longer links the bot.
- a5b0903: A campaign target starts in the queue: only an admin (the importer) adds one already written to, replied or met.
