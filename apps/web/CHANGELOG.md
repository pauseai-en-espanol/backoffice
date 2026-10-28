# @backoffice/web

## 0.15.8

### Patch Changes

- 9ef388b: Dependencies bump
- Updated dependencies [9ef388b]
  - @backoffice/domain@0.5.5
  - @backoffice/i18n@0.15.5
  - @backoffice/observability@0.1.1

## 0.15.7

### Patch Changes

- aef254d: Fields sit side by side only where their form has room (PLAN R91): on a person's page, Registrar's "Por dónde",
  "Cómo fue" and "Cuándo fue", and the next step's text and date, no longer run into each other or out of their card
  on a laptop; they stack until the form is 38rem wide. A box never grows past its field.
- 5382ae5: A person's page is two columns from the top (PLAN R90): the name heads the wider one and Seguimiento follows it, with
  no gap under the name; "Me lo quedo" and Escribirle head the narrower one, lined up with the cards under them. A
  phone's order is the same.

## 0.15.6

### Patch Changes

- ca66f3f: A person's stage is changed under their name (PLAN R89): "Cambiar la etapa" beside the stage's pill, its form showing
  "Etapa", so a phone's first screen has claiming, WhatsApp and the stage, whole, whatever the system font. Seguimiento
  keeps the owner and the next step.

## 0.15.5

### Patch Changes

- 9dd814f: A form sent before the page comes alive never puts what was typed in its address (PLAN R88): every form the page
  sends is a POST, so pressing Entrar or Intro before React has hydrated it sends a body, which Next answers with the
  page again, not `/entrar?email=…&password=…` in the browser's history and the access logs; the same for a person's
  details, the Airtable link and a census answer.
- 3ec8eec: Pages that list countries hydrate again, and Añadir keeps what is typed before the page comes alive (PLAN R86, R87):
  countries' names are the app's own, in Spanish order, not the platform's, which differ between Node and each browser
  ("RAE de Hong Kong (China)" and "Hong Kong"), so React no longer throws away and redraws Añadir or the census form,
  emptying what had been typed; and a name, phone, email or Discord typed in Añadir before React has hydrated it is sent
  with the person, not left out.
- 28347af: Where people live, everywhere it's shown (PLAN R81 to R84): the team group's post says "Dónde vive: Baviera, Alemania"
  instead of "Provincia"; the bot's `/search` and `/left` find a phone by 6 or more of its digits, however written, as
  Personas does; Latin America's and the United States' regions are offered as lists in the place pickers and suggested
  in the census form ("cdmx", "Nueva York" find theirs); and the Panel's "Dónde viven" counts people by country, Spain,
  Latin America and the rest of the world, each country leading to its people in Personas.
- a3222cc: The search's shortcut is each system's own (PLAN R85): ⌘K on a Mac, an iPhone or an iPad, Ctrl K elsewhere, and the
  header and the dialog's help say that one. On a Mac, Ctrl K is left to text fields again (it deletes to the end of the
  line), and Ctrl Shift K to the browser; the button tells assistive technology its shortcut (`aria-keyshortcuts`).
- Updated dependencies [3ec8eec]
- Updated dependencies [28347af]
- Updated dependencies [a3222cc]
  - @backoffice/domain@0.5.4
  - @backoffice/i18n@0.15.4

## 0.15.4

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

## 0.15.3

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

## 0.15.2

### Patch Changes

- 1d230ad: Node.js 26.12.1 (images on node:26.12.1-alpine), the October 21 security release.

## 0.15.1

### Patch Changes

- cd098d5: Hoy's "Me lo quedo" buttons are named "Me lo quedo: {name}" for screen readers, no longer "Me quedo a {name}": the
  name holds the words shown (WCAG 2.5.3, Label in Name), which axe-core 4.14 checks.
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

## 0.15.0

### Minor Changes

- a4a1e91: Contacto takes a phone, an email or a Discord username in one field and tells which from what is typed, with no
  "Tipo" to choose; each detail is one line with its icon and "Quitar" at the end. Fields side by side keep their boxes
  in line however long their labels, and "(opcional)" moved into the hints, so labels stay on one line.
- 32a393d: The visual system reaches every screen (PLAN R65–R68): a person's page shows their stage and next step under the
  name, and its edits are small buttons with an icon; the Panel draws a bar to scale per stage; Hoy shows two figures
  and the Bandeja's count as a chip; the menu and Personas' stage counters carry icons; Contactos folds its filters and
  shows each contact's relationship as a coloured pill and its tier as a tag; the Bandeja marks "igual" in green and
  "distinto" in amber; Ajustes adds an option from a field with its button beside it.
- d2e6e54: A visual system for the staff app (PLAN R61, R62): each stage a pill in its own colour with its icon and word,
  status chips and quiet tags, Lucide icons beside their words. A person's card says each fact once: "Sin asignar"
  where the owner goes, the next step in a strip of its own (red once late, amber when today or missing), what is
  missing last as dashed chips. Hoy lays its people out as a grid, Personas as rows lined up under their columns (a
  card on a phone), and the Onboarding Pipeline's columns take their stage's pill and colour.

### Patch Changes

- a42a927: Statuses ("Posible duplicado", "Activa", "Revocada"…) carry an icon like the rest of the visual system, and Contactos'
  "Nuevo contacto" has room above the search.
- Updated dependencies [a4a1e91]
- Updated dependencies [a42a927]
- Updated dependencies [32a393d]
- Updated dependencies [d2e6e54]
  - @backoffice/domain@0.5.0
  - @backoffice/i18n@0.15.0

## 0.14.1

### Patch Changes

- 4e92c54: A contact attempt may be a video call: "Videollamada" in "Por dónde", after "Teléfono".
- Updated dependencies [4e92c54]
  - @backoffice/domain@0.4.1
  - @backoffice/i18n@0.14.1

## 0.14.0

### Minor Changes

- 7956029: The Bandeja compares a possible duplicate with each candidate, row by row, phones and emails included but for a
  census answer's, with "igual" where they agree; "¿Es otra persona? Búscala" attaches it to whoever is found, not only
  to its candidates (a census answer, still only to its own) (PLAN R60).

### Patch Changes

- Updated dependencies [7956029]
  - @backoffice/i18n@0.14.0

## 0.13.0

### Minor Changes

- 2b540cc: Personas counts what it finds, in all and in each stage, each stage's counter being its filter; the rest of the
  filters are folded under "Más filtros", and those on are listed, each with a link that takes it off (PLAN R59). The
  Onboarding Pipeline folds its filters the same way. `GET /api/people` returns the counts with its first page.

### Patch Changes

- a642282: A person's page no longer offers "Me lo quedo" for someone in Baja or Descartado, which it could never do: their
  owner is set with "Cambiar de responsable".
- Updated dependencies [2b540cc]
  - @backoffice/i18n@0.13.0

## 0.12.0

### Minor Changes

- f9ff6ef: One sign-up day and one way in (PLAN R58, D17): "Llegó el" is "Fecha de alta" and "Llegó por" is "Canal de alta"
  everywhere, and "Entró por" leaves the person's page, the cards, the filters and the Panel, which counts sign-ups by
  channel alone. Whoever had no channel takes it from where they came in (Global's form, or WhatsApp through the bot).
  A person's sign-up is edited in its own card, "Alta y comunidad", which never repeats the day. Importar and
  `pnpm whatsapp:csv` call the group's columns "Entrada al grupo" and "Salida del grupo".

### Patch Changes

- Updated dependencies [f9ff6ef]
  - @backoffice/i18n@0.12.0

## 0.11.0

### Minor Changes

- 47fb5d4: A person's page is read first and edited in place (PLAN R57): who they are with "Me lo quedo" and WhatsApp; stage,
  owner and next step each changed where they are shown; one box for an attempt or a note above the history, whose
  latest ten are in view; contact, profile, community and census in cards edited in place; merging, the team account
  and their data under "Más acciones".

### Patch Changes

- Updated dependencies [47fb5d4]
  - @backoffice/i18n@0.11.0

## 0.10.0

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

## 0.9.1

### Patch Changes

- 6e224b4: Sharing a private contact or organisation, or merging it into the team's contact, offers "Compartir también mis
  notas" (unticked to start): ticked, what was written while it was private goes to the team too.
- Updated dependencies [6e224b4]
  - @backoffice/i18n@0.9.1

## 0.9.0

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

## 0.8.0

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
  - @backoffice/i18n@0.8.0

## 0.7.0

### Minor Changes

- a88d283: Censo lists everyone waiting, 50 at a time ("Ver las siguientes"), with a search by name, phone, email or Discord and
  the count of everyone waiting: it used to stop at the 200 oldest, so with more the newest never showed. On a computer
  the sidebar is tighter, so an admin's whole menu, Ajustes and Salir included, fits a 1280×720 screen.

### Patch Changes

- Updated dependencies [a88d283]
  - @backoffice/i18n@0.7.0

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

### Patch Changes

- Updated dependencies [01e38c3]
- Updated dependencies [d00c2c0]
- Updated dependencies [a5a8778]
  - @backoffice/domain@0.3.0
  - @backoffice/i18n@0.6.0

## 0.5.1

### Patch Changes

- c101fca: The API's image no longer carries Next.js, Playwright and Vitest, which better-auth's optional peers brought in from
  the workspace: 892 MB to 435 MB (175 MB to 87 MB compressed), so each release uploads half as much. The other images
  are rebuilt only because the shared lockfile changed; nothing in them changes.

## 0.5.0

### Minor Changes

- fb626ac: The team group hears of arrivals within a window admins set in Ajustes, a week by default: someone who arrived before
  it, or on a day nobody knows, is a member entered after the fact and isn't announced. The instant post (the bot,
  Añadir) now obeys it as the sweep did.

### Patch Changes

- Updated dependencies [fb626ac]
  - @backoffice/i18n@0.5.0

## 0.4.0

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

## 0.3.0

### Minor Changes

- b7ef3dc: The menu is in groups by role, each list named by its group: Onboarding, Relaciones externas and Equipo, then Ajustes
  and Salir. On a computer it is a sidebar that stays in view; on a phone the same groups open under "Menú". Censo is
  listed only while the census form is configured (PLAN M5).
- 27cd280: A person's page leads with what is done most, which is what a phone shows first when the bot's "Abrir" opens it:
  "Me lo quedo" by the owner line, then quick actions (WhatsApp, the stage and the owner), the next step, and a contact
  attempt or a note behind their buttons; contact moves next to the profile, with adding another phone or email folded.
  Hoy lists the ten oldest unassigned, then "Ver los N sin asignar", to Personas filtered to them (PLAN M5).

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
- cce1869: The app and the bot say "onboarding" where they said "acogida" (the role, the digest, the settings, the WhatsApp
  message, the census form's thanks and its draft privacy notice), and the board by stage is the "Onboarding Pipeline",
  at `/pipeline` instead of `/embudo` (D14).

### Patch Changes

- a363d6a: The tab icon is the chapter's mark (PauseAI en Español, with its ñ tilde), copied unchanged from the brand's logos,
  instead of a stand-in.
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

- 1c5bd11: Arrivals without a name (PLAN R37): most bot reports carry only a phone number, so the bot saves a phone or an email
  alone in one step, without asking for a name, and quick-add needs a phone or an email but not a name. Such a person
  shows as "Sin nombre" in the bot, the team group and the staff app, is greeted without a name in WhatsApp, and gets a
  name from a later report, the census, a merge or their page; a name, once known, is never emptied.
- e38e0f2: M4 Panel: people by stage, arrivals per week by source, how long arrivals waited for a first contact attempt, and who
  has waited more than 48 hours with nobody on them.
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

- d978ed8: With network policies on, the web and forms pods may connect only to the API (each on the port it calls), DNS and
  error tracking (`networkPolicy.errorTracking`), and the API's forms port moves to 3003, clear of the forms app's own
  3002 in development.
- Updated dependencies [5879bda]
- Updated dependencies [6c25821]
- Updated dependencies [9b8add8]
- Updated dependencies [613d8ea]
- Updated dependencies [a3e2c8f]
- Updated dependencies [1c5bd11]
- Updated dependencies [a4b91d0]
- Updated dependencies [8b141b4]
- Updated dependencies [e38e0f2]
- Updated dependencies [e38e0f2]
- Updated dependencies [e38e0f2]
- Updated dependencies [f4a9480]
- Updated dependencies [5cf2102]
- Updated dependencies [970da1b]
- Updated dependencies [7bbad20]
- Updated dependencies [54b233e]
  - @backoffice/domain@0.1.0
  - @backoffice/i18n@0.1.0
  - @backoffice/observability@0.1.0
