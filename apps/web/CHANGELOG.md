# @backoffice/web

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
