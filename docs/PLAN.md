# Plan: PauseAI España backoffice

This plan covers the milestones, the decisions taken and still open, and the open questions. Scope comes from
[BRIEF.md](BRIEF.md); decisions are recorded in [adr/](adr/); details are in [spec/](spec/).

## How we work

- Claude implements in small commits, each with what was run and what it showed.
- Dani reviews and decides:
  - **Line by line:** migrations, RLS, grants and gitops changes.
  - **By demo:** the UI.
- Each milestone ends with green CI, a deploy and a short demo note, recorded in [Tracking](#tracking).
- Git history stays flat: rebases, not merges.

## This week

Before any code, and not blocked by it:

1. **Agree the rule** with the community's admins: whoever approves or sees a join or a leave reports it. Until M1
   ships, in a shared note; from M1, to the bot.
2. **If the community allows it, require approval to join**, so every arrival passes through an admin who can
   report it.
3. **Create the bot** with BotFather and keep its token for the gitops secret.
4. **When convenient, ask Global** for a read-only API token, or to protect the shared view with a password. The
   shared link works meanwhile ([ADR-0005](adr/0005-airtable-intake.md)), so nothing waits on this. An admin pastes
   the link in Ajustes (PLAN R49).

## Specs, written just in time

Each spec is reviewed by Dani before the milestone that builds it starts:

| Spec                                   | Ready before                    | Status                                            |
| -------------------------------------- | ------------------------------- | ------------------------------------------------- |
| [Data model](spec/data-model.md)       | M0 (its M0 tables), then M1, M3 | M0 tables drafted; awaits review                  |
| [Onboarding](spec/onboarding.md)       | M1                              | Drafted from the specification                    |
| [Personal data](spec/personal-data.md) | M2                              | Drafted; D9 and D12 decided; the notice is Dani's |
| [Outreach](spec/outreach.md)           | M3                              | Drafted from the specification                    |

## Milestones

The order makes **G1 and G2 usable first**, and the census (G3) follows straight after. M1 is the smallest thing
that fixes the immediate problem. Backups are Dani's, in gitops, separately from this plan.

### M0: Foundations

**Ships:**

- **Monorepo toolchain:** pnpm, Turbo, TypeScript 7, oxlint, Prettier, Vitest, Changesets, Renovate with a 3-day
  release delay, husky and lint-staged, markdownlint.
- **Local Postgres 18** through compose, with the owner and the four runtime roles as in production.
- **Migrations:**
  - the baseline: schemas, and grants closed by default;
  - the actor helpers, the channel included;
  - column conventions (`private.stamp`);
  - the audit log;
  - staff and their roles;
  - invitations;
  - Better Auth's `auth` schema, with the sessions' `aal` and the trigger refusing an aal2 session to an account
    without a second factor.
- **`packages/db`:** Kysely, `withActor`, pools, with database tests: catalog meta-tests and the RLS matrix.
- **`apps/api`** (Fastify):
  - `/healthz`;
  - Better Auth with mandatory TOTP and backup codes;
  - invitation lookup and acceptance;
  - staff and invitations admin routes, and the audit log route;
  - password recovery mail;
  - the owner's commands `create-account` and `reset-authenticator`;
  - the session clean-up job's entrypoint.
- **`apps/web`** (Next.js staff UI, in Spanish):
  - sign-in, the TOTP challenge and enrolment;
  - forgot and set password;
  - invitation acceptance;
  - a placeholder Hoy home;
  - Equipo: invite, revoke, change roles, deactivate;
  - Registro (the audit log), for admins.
- **Packages:** `packages/ui` (Panda preset), `packages/i18n` (Spanish messages), `packages/observability` (Sentry
  privacy options and the browser relay).
- **Helm umbrella chart:** the migrations Job; the API, with the session clean-up CronJob and its NetworkPolicy;
  the web app, with its HTTPRoute and NetworkPolicy.
- **CI:** lint, formatting, type check, unit tests, database tests, Helm lint, an E2E smoke; and the release
  workflow to the registry.
- **Playwright E2E smoke:** sign-in with TOTP, an invitation, axe.
- **Gitops entries** prepared, not pushed ([R10](#decisions-to-review-taken-by-claude-while-dani-was-away)).
- **Runbooks:** the first admin, and a lost authenticator.

### M1: Onboarding MVP

**Ships:**

- **First task: the Airtable spike** ([ADR-0005](adr/0005-airtable-intake.md)), run locally against the real link:
  does the view load without a full browser, does it allow a CSV download, what are its columns?
- **People:** profiles, identities, sources, community presence, stages, owners, next actions and the timeline
  ([onboarding §1–§2](spec/onboarding.md#1-concepts)); the "needs attention" rules, with thresholds in settings.
- **Settings:** thresholds and the community chats list.
- **Views:** Hoy, Sin asignar, Onboarding Pipeline, Personas (CSV export for admins, audited), Persona with its quick actions,
  Añadir rápido, Bandeja, Importar, Ajustes → Telegram.
- **Matching and merge** ([onboarding §6](spec/onboarding.md#6-matching-and-merging)).
- **Intake:** the Airtable sync as `ingest` (hourly CronJob and on demand), if the spike works; the CSV import
  either way.
- **The Telegram bot** ([ADR-0004](adr/0004-telegram-bot.md)): linking, the webhook, the commands, deleting
  messages with contact details, the bot channel's limits in RLS.
- **Notifications:** the team group (optional, D11), the daily digest (Telegram, email fallback).
- **Jobs:** the Airtable sync, the daily digest, the dialog clean-up.
- **E2E:** linking Telegram, `/joined` (`/alta`) through a fake Bot API, claim from the team group, quick-add, CSV
  import, log attempt, merge.

### M2: Census

**Ships:**

- **The public forms app** (`apps/forms`), its host and route, and the `public` role's grants.
- **The census form** with the generic link and personal links, the age check, consent and the privacy notice
  ([onboarding §7](spec/onboarding.md#7-the-census)).
- **WhatsApp handover links** ([onboarding §7.3](spec/onboarding.md#73-whatsapp-handover-links)).
- **Skills, interests and teams:** the lists edited in settings.
- **The Censo view:** progress, and the queue of personal links still to send.
- **Rights:** export a person's data (JSON) and erase a person (anonymisation), both audited
  ([personal data §8](spec/personal-data.md#8-notice-and-rights)). Placed here by Claude: the specification gave
  them no milestone, and the census is when most personal data arrives.
- **E2E:** a census submission.

### M3: Outreach

**Ships:**

- Organisations, contacts, campaigns, templates and anchors, targets ([outreach spec](spec/outreach.md)).
- The Siguiente queue and the handover (`mailto:`, copy buttons, `wa.me`).
- The views: Campañas, Contactos, Organizaciones, Plantillas.
- The one-off import from the `outreach` repo.

### M4: Tools and insight

**Ships:**

- **Funnel metrics:** the Panel (counts by stage, arrivals per week by source, time to first contact, unassigned
  for more than 48 hours).
- ~~**An MCP server with member tokens**~~ Not now (D10).
- ~~**Retention automation**~~ Not built: D9 decided no automatic erasure.

### M5: After first use

What Dani found using the deployed backoffice (2026-10-16), in the order he agreed:

1. **The phone:** a person's page opens with its quick actions (Me lo quedo, Abrir WhatsApp, the stage), then the
   next step, contact, profile and history, with adding a phone or email behind a button; Hoy shows the ten oldest
   unassigned, then "Ver los N sin asignar".
2. **The menu in groups by role:** Onboarding, Outreach, Equipo, then Ajustes and Salir; a sidebar on a computer,
   the same groups in "Menú" on a phone; Censo hidden while the census form is off.
3. **Fewer stages, and dates in the past:** Por clasificar folds into Nuevo, and Contactando and En conversación
   into "En contacto" (whether they replied is on each contact attempt); "Llegó el" on each person (never in the
   future), with "Sin asignar" only for arrivals of the last 30 days; an optional date on attempts, notes and stage
   changes for when it happened, next to when it was recorded and by whom, which stays as it is. Also **"Llegó
   por"**, where someone came from (Dani: "Email, Whatsapp, Discord for now"; Discord brings several a month), next
   to the existing source, which stays as how they were entered: a list admins edit in Ajustes (WhatsApp, Email,
   Discord, Formulario de PauseAI Global, Otro to start), no free text so the Panel can count it; the bot's /alta
   assumes WhatsApp, Global's form fills its own, Añadir asks, a CSV may bring a column, existing people stay empty;
   the Panel counts arrivals by it. And a **Discord username** as a contact detail next to phone and email, for
   duplicates and for reaching them (nothing messages anyone on its own). "Llegó el" may be unknown ("No se sabe";
   Dani, 2026-10-16): never "Sin asignar", left out of the Panel's weeks and waits (a line counts them), filterable;
   Añadir offers today and lets it be emptied; a CSV's "Llegó el" column (dd/mm/yyyy or yyyy-mm-dd) retrofills older
   members with their stage. The team group hears only of arrivals within a window admins set in Ajustes, a week by
   default (Dani, 2026-10-16: "maybe make it configurable and by default a week?"; migration `150400`), by the
   instant post and the sweep alike. **Done:** four migrations, `20261016150000` to `150300`: the Discord kind; the list
   (`app.arrival_channels`); the dates, "Llegó por" and Discord on people, events and intakes; and the stage fold, a
   type swap that moves Por clasificar to Nuevo (their "Llegó el" stays unknown) and En conversación to En contacto,
   with a history line each. Existing people's "Llegó el" is the day they were added. The old "Llegó por" label on
   sources is now "Entró por". Mutation list `arrivals`.
4. **Cards that say who someone is:** the name with the province, a one-line internal summary (staff only, never
   to Telegram), and what's missing in plain words ("Falta: correo · qué quiere hacer"). **Done:** migration
   `20261016170000` (`people.summary`; erasure clears it, a merge keeps it); every card (Hoy, Personas, the
   Onboarding Pipeline, the Bandeja, Censo) and the person's page; "Resumen interno" in the profile editor (R43, R44).
   Mutation list `cards`.
5. **Staff linked to their person:** an admin links an account to its person (suggested by a shared email); the
   person shows an "Equipo" badge and Personas filters by it; the link grants nothing, and the person outlives a
   deactivated account. **Done:** migration `20261016170100` (`staff.person_id`, unique; only someone still there;
   `private.staff_person_suggestions`, ADR-0002); "Cuenta del equipo" on the person's page and "Su ficha" on Equipo;
   "Del equipo" in the filters (R45, R46). When a team member joined is their person's "Llegó el" (step 3), which
   the profile edits, so nothing more records it (Dani asked, 2026-10-16). Mutation list `staff-person`.
6. **Private contacts and organisations:** "Solo yo" or "Equipo" on each contact, organisation and note; admins
   don't see others' private records in the app (rights requests still cover them); an admin chooses who inherits
   them when someone leaves; a private contact neither blocks nor reveals a team one, and sharing offers a merge;
   campaigns target shared contacts only. Organisations get the same timeline of dated notes as contacts (today
   they have one notes field), and notes on both take an optional date for when the conversation happened (as in
   step 3), so extracts from past conversations can be kept, privately or for the team (Dani, 2026-10-16). The legal
   basis doesn't hold it up: notes are the same processing in any tool (Dani, 2026-10-17: "go with step 6"); the
   assessment and the notice's paragraph are drafted for Dani apart. **Done:** migrations `20261017120000`
   (`app.organisation_notes`, a note's `happened_on`; the notes field became each organisation's first note, R50) and
   `120100` (`private_to` on contacts, organisations, contact events and organisation notes; the policies, the
   triggers and five definer functions, ADR-0002); the "Quién lo ve" choice, mark and filter, sharing and its merge
   offer in Contactos and Organizaciones, the rights request in Contactos, the inheritance in Equipo (R51 to R55).
   Mutation lists `organisation-notes` and `private-records`.
7. **Mensajes: the WhatsApp messages newcomers receive, written by the team, not in code** (D15; Dani, 2026-10-16:
   "it should be a template that we craft somewhere (not code)"). A page in the Onboarding group where the onboarding
   team writes the welcome (a person's "Abrir WhatsApp") and the census link's message (Censo), several per purpose,
   each with a title, picked when WhatsApp is opened. Placeholders `{nombre}`, `{yo}` and the census link's
   `{enlace}`, which it must carry; anything else is said as it's typed and refused by the database. A version for
   someone without a name when `{nombre}` is used, drafted from the message; a preview with an example person; every
   change a new version, and the contact attempt (and the census link) naming the message and version that went out,
   which the history shows by title. Retired, never deleted. The code keeps a neutral message for a purpose with none
   in use, which no longer says "onboarding". The texts themselves come from Dani's Google Doc, entered in the page.
   Choices in R39 to R42. **Done:** migrations `20261016160000` to `160200` (the table; attempts and census links
   naming their message); mutation list `message-templates`.

## Decided

| ID      | Decision                                                                                                                                                             | By               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **D1**  | WhatsApp joins and leaves are reported to a Telegram bot by whoever sees them. No WhatsApp integration for now                                                       | Dani, 2026-10-15 |
| **D2**  | Airtable is read through Global's shared view link, kept as configuration (a sealed secret) ([ADR-0005](adr/0005-airtable-intake.md))                                | Dani, 2026-10-15 |
| **D3**  | No mailbox is read: the Airtable view carries the same data as the notification emails                                                                               | Dani, 2026-10-15 |
| **D4**  | The staff UI is on the public gateway with mandatory two-factor (no VPN)                                                                                             | Dani, 2026-10-15 |
| **D9**  | Retention: no automatic erasure. A person's data stays until an admin erases it (`private.anonymise_person`)                                                         | Dani, 2026-10-16 |
| **D10** | No MCP server for now. Revisit once the association agrees to send personal data to an LLM provider                                                                  | Dani, 2026-10-16 |
| **D11** | The bot must work for one person. The team group is optional: on when a group is configured                                                                          | Dani, 2026-10-15 |
| **D12** | Names and phone numbers may go through the Telegram bot, which deletes the messages once saved (ADR-0004)                                                            | Dani, 2026-10-16 |
| **D13** | The Telegram bot is the onboarding team's alone: only staff with the onboarding role link and use it, not an admin without it; losing the role unlinks (ADR-0004)    | Dani, 2026-10-16 |
| **D14** | The staff app and the bot say "onboarding", not "acogida"; the board by stage is the "Onboarding Pipeline", at `/pipeline`                                           | Dani, 2026-10-16 |
| **D15** | The WhatsApp messages newcomers receive are written by the team in the staff app (Mensajes), not in code; the code keeps a neutral fallback (PLAN M5)                | Dani, 2026-10-16 |
| **D16** | The WhatsApp group's history comes in with those who left, as Baja, to keep who was in the community and when (R56)                                                  | Dani, 2026-10-18 |
| **D17** | One sign-up day, "Fecha de alta", whatever the way in; one way in, "Canal de alta", which "Entró por" and "Llegó por" merge into (R58)                               | Dani, 2026-10-18 |
| **D18** | Each onboarder writes their own messages in Mensajes, which only they see and are offered first; the team's are written by admins (R71)                              | Dani, 2026-10-21 |
| **D19** | The community is Spain's, Spaniards abroad, Latin America's and Latin Americans abroad; a person has a country where they live, and may say where they're from (R74) | Dani, 2026-10-22 |
| —       | Backups are handled in gitops, separately from this plan                                                                                                             | Dani, 2026-10-15 |
| —       | Legal and privacy calls (D9, D12, the privacy notice) are Dani's, for the association                                                                                | Dani, 2026-10-15 |

## Open decisions

Each has a recommendation. Unless Dani objects, the recommendation is what gets built.

| ID     | Decision           | Options                                                                                | Recommendation                                                                                                                                  |
| ------ | ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **D5** | Tenancy            | Single organisation, or tenant-ready from day one                                      | **Single.** Another chapter runs its own instance, on its own Postgres server ([R13](#decisions-to-review-taken-by-claude-while-dani-was-away)) |
| **D6** | UI language        | Spanish only, or English source with mandatory Spanish                                 | **Spanish only**, through message files (use-intl, as next-intl) so a locale can be added later                                                 |
| **D7** | Access granularity | Module roles, or "a volunteer sees only their own people"                              | **Module roles** for v1; revisit when the team grows past about 8                                                                               |
| **D8** | Outreach sending   | A person sends (handover), or the app sends through the mail server per explicit click | **A person sends**, as the outreach repo already does                                                                                           |

## Open questions

Nothing blocks M0. These get answered along the way:

1. ~~**The shared view (M1's first spike)**~~ Answered 2026-10-15: it loads without a browser, allows a CSV
   download, and its columns are in [ADR-0005](adr/0005-airtable-intake.md#decision). One question remains for
   Dani: R14 below.
2. **The census's lists:** skills and areas to help in, filled in by an admin in settings before the census goes
   out ([onboarding §7.2](spec/onboarding.md#72-the-form-m2)).
3. **Community chats** for the bot's chat picker: optional; a free-text chat name works too.

Unless told otherwise, `welcomed` means "first conversation done and pointed to a team or a first task".

## Decisions to review (taken by Claude while Dani was away)

Each entry lists the options, the choice and why. The rule was the most conservative option: stricter security,
less scope, closest to the specification. Revert any of them by saying so; a database one with a forward migration.

- **R1. Names.** Options: names derived from config; fixed names. **Chose:** packages `@backoffice/*` (a working
  name; the product name and hosts come from config); database `pauseai_backoffice`; roles
  `pauseai_backoffice_owner`, `_app`, `_auth`, `_ingest` and `_public`. All five roles are created now, locally
  and in gitops, so later milestones need no gitops role change; M0's migrations grant only to `_app` and `_auth`.
- **R2. The audit log keeps no personal data.** Options: each write's row before and after (the specification's
  §8); what changed without personal data (an earlier project's). **Chose the earlier project's rule:** columns commented
  `personal data` are never copied into `audit_log`, and an update to one is logged with the column's name only.
  Erasure never has to rewrite the log, and an admin reading the log doesn't see members' data. A catalog test
  keeps the list honest.
- **R3. Staff identity.** Options: a staff id of its own; the Better Auth user id. **Chose the Better Auth user
  id** as `app.staff`'s key, with roles in `app.staff_roles`. An invitation carries a set of roles; accepting it
  creates the staff row.
- **R4. The first admin.** Options: a sign-up open until the first account; a seeded account; the owner's command.
  **Chose the owner's command**, as the earlier project: `create-account` in an API pod prints a one-hour
  set-password link and the owner SQL that makes the account an admin once it has enrolled TOTP. A lost
  authenticator: the owner's `reset-authenticator` command. Nothing is open to the internet before an admin exists.
- **R5. The bot channel is closed by default, in RLS.** Options: limit the bot in the API only; in the database
  too. **Chose the database too:** `private.staff_can(VARIADIC roles)` admits aal2, active staff on the web
  channel; `private.bot_can(VARIADIC roles)` the bot channel. A policy open to the bot names both on purpose, and a
  catalog test lists every such policy. A `SECURITY DEFINER` function checks the channel itself. No channel set:
  every policy denies.
- **R6. Passkeys later.** The specification allowed them from M0 as an extra. **Chose to defer them** until after
  M1: scope first, and TOTP is already mandatory.
- **R7. Password recovery in M0.** Options: only the owner's command; email recovery. **Chose email recovery**
  ("He olvidado mi contraseña"), as the earlier project: only for accounts with a second factor (so the mailbox alone
  gets nothing), one link per 15 minutes per account.
- **R8. No licence file yet.** The repository is public (2026-10-16); under which licence is Dani's call.
- **R9. Local Postgres on port 5434**, container `backoffice-postgres`, so it runs beside other projects' local
  databases on 5432 and 5433.
- **R10. Nothing pushed.** Commits stay local on `main`, and gitops changes on a local branch in the gitops repo,
  until Dani says so: pushing `main` starts the release workflow, which pushes images to the registry, and pushing gitops
  deploys.
- **R11. Hosts.** The staff host `backoffice.pauseai.es` stays the default in docs and values (D4 says
  configuration); the census host is chosen in M2.
- **R12. Sessions** last 12 hours, are never refreshed, and offer no "remember me" or "trust this device", as
  the earlier project.
- **R13. Database names are fixed in the migrations.** Options: role and database names from config; fixed.
  **Chose fixed** (`pauseai_backoffice_*`), as the earlier project: dbmate has no variables, and building every `GRANT`
  and `POLICY` with dynamic SQL would make the security review harder. Consequence: another chapter's instance
  needs its own Postgres server, or a renaming migration (D5). The product name and hostnames still come from
  config.

- **R14. Airtable rows without Global's chapter-share permission.** The spike found a
  `GDPR chapter share permission` checkbox in Global's view, ticked on 43 of 118 rows. Options: import every row,
  relying on Global's privacy notice (the specification's reading); import only rows with the box ticked. Claude
  chose the box while Dani decided. **Decided by Dani (2026-10-16): every row**, since the view is what Global shares
  with the chapter. The switch stays (`AIRTABLE_REQUIRE_CHAPTER_PERMISSION`, now default `false`); `true` would leave
  the unticked rows out and count them.
- **R15. Joins and leaves write their own timeline events** (a trigger on community presence), so staff write only
  notes and contact attempts by hand, and every source records a join the same way.
- **R16. The bot reaches people only through definer functions,** never a table policy: RLS can't hide columns, and
  the bot must never see contact details (ADR-0004). So `BOT_POLICIES` stays empty, and the functions check the
  channel themselves (ADR-0002 §4).
- **R17. A CSV dry run is the real import in a rolled-back transaction,** so its counts are exactly what applying
  would do, with no second implementation to drift.
- **R18. The admin's CSV export defuses formula-looking cells** (a leading `=`, `+`, `-` or `@` gets a `'`), so an
  exported name can't run as a formula in a spreadsheet.
- **R19. The team group's posts are read without an actor.** The bot posts every arrival to the team group,
  including those of the hourly Airtable sync, which has no person behind it. Options: post only arrivals someone
  reported; read the posts' facts without an actor, narrowly. **Chose the narrow read:** `private.team_card` returns
  only what a post shows (name, province, sources, stage, owner, never contact details), only for arrivals of the
  last 48 hours or people already posted; `private.team_unposted` returns ids. Both are in the catalog allowlists and
  ADR-0002 §4.
- **R20. The forms app reaches the API inside the cluster only, with a shared secret.** The gateway sends nothing of
  the forms host to the API; the API's census routes also want `X-Backoffice-Forms-Token` (compared in constant time),
  so a gateway route added by mistake still reaches nothing. Options: network isolation alone; plus the secret.
  **Chose both** (defence in depth, as the earlier project's preview token). Since the security review of 2026-10-16 the
  census routes have their own API port, the only one the forms app's pods may reach.
- **R21. A filled honeypot is answered as a success and dropped**, so a bot learns nothing; an answer sent less than
  3 seconds after the form loaded is refused in words (a person can send it again).
- **R22. Through the generic link, a census answer that matches someone never applies itself** (anyone can type
  anyone's number): it waits in the Bandeja, applied or dropped by a person. Consents included: nobody can give or
  withdraw someone else's consent with their phone number.
- **R23. An erased person keeps their row, as "Persona anonimizada"**, for the counts by stage, and leaves every work
  queue (Hoy, the unassigned, the census queue, the bot). Their consents stay as proof of what was agreed, no longer
  naming anyone.
- **R24. The Bandeja shows a census answer without its email and phone.** The database keeps the whole answer (to
  apply it), but the staff app only needs the rest to decide, and the staff API's rule is no contact details in
  lists. Applying it still adds them to the person. Other records' are shown since R60, to compare them.
- **R25. Outreach contacts get erasure too** (`private.anonymise_contact`, admins): their name, addresses, phone,
  notes and timeline words go; the organisation, the campaign row and its status stay for the counts; they are held
  for good, so no queue offers them again. Outreach contacts are mostly public, professional details, but they can
  still object (GDPR art. 21).
- **R26. Nothing in the app is made ready or sent to while a contact needs review or is held**, in the database
  (`private.target_rules`), not only in the renderer; a target imported as already sent is history and is allowed.
- **R27. Template versions count every change to the subject or body**, and a sent target records the version it was
  written from, so a reply can be traced to the letter that went.
- **R28. Imported outreach contacts:** the repo recorded no reason per contact, so the reason is the campaign's list
  ("Del listado de la campaña «…»"); one without a `source` comes in to review rather than with an invented one;
  organisations come in as kind `other`, for staff to set; the tracking sheet's `owner` names go into the target's
  notes, since they aren't accounts.
- **R29. Siguiente offers my targets and nobody's**, in send order, in one campaign or every active one, and counts
  (doesn't offer) those blocked by review or hold. "Sí, enviado" makes an unowned target mine.
- **R30. Erasure holds against every way data comes back.** An outside review (2026-10-16) found the hourly Airtable
  sync would re-attach Global's record to an erased person. Options: delete the intake records (the next sync then
  makes a new person); keep them and skip them. **Chose to keep them with only a hash of their external id**, which a
  sync or a re-import recognises and counts as `erased`; Global's record id is no longer kept in clear. An erased
  person is frozen in the database, and erasure covers every duplicate merged into them.
- **R31. The generic census form answers "received" whatever happened** to the answer, since "created" or "review"
  told anyone who typed a phone number whether its owner was known (art. 9 data). A personal link still answers
  "updated".
- **R32. Consents keep the time the person gave them** (`given_at`), not the time staff applied a Bandeja answer,
  as proof of consent.
- **R33. A personal link is the person's latest only**: making a new one replaces the old (the way to undo one sent
  to the wrong number), and links follow a merge to the survivor.
- **R34. Siguiente's targets are taken before they're written to** ("Me lo quedo"), so two volunteers never send the
  same letter; "Sí, enviado" is recorded only by whoever holds the target. Options: a lease that expires; an explicit
  claim. **Chose the claim**, as onboarding's "Me lo quedo": owners show in the campaign and can be changed there.
- **R35. Once someone wrote to a target, that stays**: it never goes back to the queue, nor out of the campaign.
- **R36. Erasure reaches the team group too**: the bot deletes its posts about the person, or, past Telegram's
  48 hours, blanks them to "Persona anonimizada", and forgets them.
- **R37. Arrivals may have no name.** Most bot reports carry only a phone number (Dani, 2026-10-16). Options: ask
  for a name before saving; save without one. **Chose to save without one**: the bot asks for a name only when there
  is neither a name nor a contact, and quick-add needs a phone or an email, not a name. Such a person shows as "Sin
  nombre" everywhere (the bot, the team group, the staff app) until a later report, the census, a merge or staff
  name them; a name, once known, is never emptied, and a nameless person is never matched on name. Airtable and the
  census still always carry a name; the CSV import may not since R56.
- **R38. The bot's commands in English, with Spanish names that work the same** (Dani, 2026-10-16: "i would prefer
  the commands in english or better yet both spanish and english"). `/joined` (`/alta`), `/left` (`/baja`), `/mine`
  (`/mios`), `/unassigned` (`/libres`), `/search` (`/buscar`), `/sync` (`/sincronizar`), `/help` (`/ayuda`),
  `/cancel` (`/cancelar`). Options for the menu: one list; one per Telegram language. **Chose one per language**: the
  API sets the menu on every start with the Spanish names by default and the English ones for people whose Telegram
  is in English, described in Spanish in both (D6); the sealing script no longer sets it. Spanish by default so that
  Catalan, Galician or Basque Telegram sees the Spanish names too (Dani, 2026-10-16). Replies name a command by both
  names, English first: "/joined (/alta)".
- **R39. Who writes the messages in Mensajes** (D15). Options: admins only; the onboarding team. **Chose onboarding
  staff and admins**, like every onboarding table (ADR-0002 §4): they are the ones who send them, and every change is
  versioned and audited. Restricting writing to admins is a forward migration on the insert and update policies.
  Since R71, admins alone write the team's, and each onboarder writes their own.
- **R40. Someone without a name** (R37). Options: take `{nombre}` out when the message goes; a second version of the
  message. **Chose a second version**, required exactly when the message uses `{nombre}` and never naming anyone: a
  sentence with the name cut out can read wrong, so the team writes (and previews) what goes out. The page drafts it
  from the message ("Hola, {nombre}:" reads "Hola:") until it's touched. Since R76 the version is optional.
- **R41. Placeholders, order and retiring.** Placeholders are Spanish words in braces, the purpose's only; any other
  brace is refused (a message can't carry a literal brace), so "{nombe}" never reaches a newcomer. A purpose's
  messages are offered in the order they were written, the first already picked; there is no reordering yet (retire
  the first to change it). A message is retired, never deleted, since the history names it.
- **R42. Recording what went out.** Options: the version at the moment "Sí, lo he enviado" is pressed; the one the
  page opened WhatsApp with. **Chose the one opened**: the contact attempt's data carries `templateId` and
  `templateVersion`, which the database checks (a version that template has had); a census link records its message
  when it's made (its URL is shown only then, inside it), and its attempt names the same. A census link message
  retired between loading Censo and pressing the button is refused (`409 stale`), never swapped for another.
- **R43. What a card says is missing** (PLAN M5, step 4; Dani, 2026-10-16: "Maite (Madrid) could help or even add
  an internal note"). Options: every empty field; what onboarding needs to welcome someone. **Chose the latter:**
  "Falta:" lists a phone, an email, the province and an area they'd like to help in (from the census's list or in
  their own words), in that order. Not the name (the card already says "Sin nombre"), nor skills or availability
  (the census asks those). Nothing for someone who left or was discarded; still for someone dormant or unresponsive,
  who may come back. The person's page shows the same line under the name; its heading stays the name alone.
- **R44. The one-line internal summary** (PLAN M5, step 4). Options: a note pinned from the timeline; a field of its
  own. **Chose a field** (`people.summary`), edited with the profile as "Resumen interno": one line, at most 200
  characters, personal data. It stays in the staff app: no bot function returns it, so it never reaches Telegram.
  The admins' CSV export of Personas includes it (first left out; Dani, 2026-10-16: "onboarding is fine"), as does a
  person's export (a rights request), and erasure clears it. A merge keeps the survivor's, else takes the
  duplicate's. Its hint asks for no health, ideology or other sensitive details, as notes do.
- **R45. Linking a team account to its person** (PLAN M5, step 5; Dani, 2026-10-16: "fine", and the team is told their
  account is linked to their record). Options: the person links themselves; an admin links. **Chose an admin**, as the
  plan says: from the person's page ("Cuenta del equipo": the accounts not linked yet, the one whose sign-in email is
  one of the person's emails first, chosen already) or from Equipo ("Posible ficha", with a "Vincular" asked about in
  place). The suggestion is an exact match of emails, computed in the database for admins alone, returning ids, never
  the email (ADR-0002). One account, one person.
- **R46. What a link does** (PLAN M5, step 5). It grants nothing (no policy reads it), and the bot never sees it.
  "Equipo" shows only while the account is active, and "Del equipo" counts only those; a deactivated account keeps
  its link, said on the person's page as "(desactivada)". Only someone still there is linked; a merge moves the link
  to the survivor and refuses two records each linked to an account (an admin unlinks one first, so a person with
  two accounts is a decision, not an accident); erasure unlinks, so the account no longer names who they were.
- **R47. Censo's queue, past 200 people** (Dani, 2026-10-17: "do it i guess"). It showed the 200 oldest waiting, so
  with more the newest never appeared. Options: newest first; pages; a search. **Chose pages and a search, oldest
  first as the spec says:** 50 at a time with "Ver las siguientes" and "Volver a las primeras" (the API's cursor, in
  the address as `desde`), a search by name, phone, email or Discord as in Personas (`buscar`), and the count of
  everyone waiting ("N personas por censar"), whatever the search. Mutation list `census-queue`.
- **R48. The sidebar on a short screen** (PLAN M5, step 2). On a computer its rows are 28px tall, not a phone's 44px
  (WCAG 2.2 AA asks 24px), with less space between groups, so an admin's menu, the longest, fits 1280×720 with
  Ajustes and Salir; the phone's menu keeps 44px for a finger. The menu's end-to-end test checks it.
- **R49. Global's Airtable link, set in the web** (Dani, 2026-10-17: "i think this should be a configuration or
  something in the web (maybe only for admins)", then "yes, change ADR-0005 accordingly"). It was a sealed secret in
  gitops, never sealed, so the sync never ran. Options: keep the secret; the link in the database. **Chose the
  database, as [ADR-0005](adr/0005-airtable-intake.md) now says:** admins paste it in Ajustes and turn the sync on or
  off there; the API stores it encrypted (AES-256-GCM) with `AIRTABLE_LINK_KEY`, a key sealed once in gitops
  (`scripts/seal-airtable-key.sh`) that never reaches Postgres; the app role may set it but never select it, so no
  answer carries it or its ciphertext; only the sync reads it, as the ingest role, while it's on; the audit log says
  who changed it, never what it was. Ajustes shows who set it and when, and how the last run went (the counts, or why
  it imported nothing, by its kind). Trade-off: any admin account can point the sync at another view; mitigated by
  mandatory two-factor sign-in, the `airtable.com` check and the audit log. Mutation list `airtable-link`.
- **R50. An organisation's old notes** (PLAN M5, step 6). Options: keep the field beside the timeline; move it into
  the timeline. **Chose to move it** (expand/contract): each organisation's notes became its first note, by nobody
  known, dated the day the organisation was last changed (the nearest to when they were written that the database
  has); the column was no longer written (its grants revoked), and once that release was live, migration `140000`
  dropped it (2026-10-17). Contacts keep their own notes field, which the edit form shows; only their timeline notes
  take a date.
- **R51. Who a private record is for** (PLAN M5, step 6). Options: a "private" flag beside the owner; its own column
  naming who sees it. **Chose `private_to`**, a staff member's id (null for the team's), on contacts, organisations,
  contact events and organisation notes, so inheriting is changing it and the relationship's owner (`owner_id`)
  stays a separate thing. The policies admit a private row to its person alone, admins included (Dani's plan: "admins
  don't see others' private records in the app").
- **R52. Only from private to the team** (PLAN M5, step 6). Options: let a record go back and forth; one way only.
  **Chose one way**: a team record never becomes private (409 `shared`), so nothing the team has seen disappears
  from it, and a note made "Equipo" on a private record can't exist: what is written on a private record is as
  private as it. Sharing keeps what was written while private private (the timeline says it was shared, `shared`)
  unless whoever shares ticks **"Compartir también mis notas"** (Dani, 2026-10-17: "i want this option"; unticked
  to start), which takes the record's history while private along, its notes and events, as it's shared or merged.
  The database does it at that moment only (`private.share_history`, a trigger, when the API sets
  `app.share_history` for the transaction), so a private note written later on a team record stays private.
  Mutation list `private-records`.
- **R53. The merge on sharing** (PLAN M5, step 6). Options: offer it on any likely match; only on a shared email or
  phone. **Chose a shared email or phone** (exact, as identities match), offered on the private contact's page with
  "Fusionar con …"; the team contact keeps its details and takes the ones it lacks (name, greeting, role, email,
  phone, website, territory, scope, sector; the private one's addresses join its extra ones), the private timeline
  moves over, still private unless "Compartir también mis notas" is ticked (R52), and the private contact is deleted
  (audited). Sharing without merging is always there.
  Organisations are shared without a merge offer.
- **R54. Rights requests** (PLAN M5, step 6). Options: let admins see every private record; a lookup for rights
  requests alone. **Chose the lookup**: in Contactos, admins find contacts by an exact email, phone or name, private
  ones too (marked "Privado de alguien del equipo", not whose), and download (recorded as an export) or erase them
  from there; they still can't open a private contact's page. Organisations and their notes are not looked up: an
  organisation isn't a person, and a note mentioning one is found through the person's contact.
- **R55. Inheriting a departed member's records** (PLAN M5, step 6). Options: on deactivation, at once; any time
  after. **Chose any time after**: Equipo shows a deactivated member's private records by how many, and an admin
  hands them to someone active in outreach, or an admin, who then sees them as their own. Until then nobody sees
  them; reactivating the account gives them back to their person.
- **R56. The WhatsApp group's history** (Dani, 2026-10-18: "join and leaves should be supported"; D16). Options: an
  Importar page that takes the export; a command on the exporter's laptop that turns it into Importar's CSV. **Chose
  the command** (`pnpm whatsapp:csv`, [runbook](runbooks/importing-the-whatsapp-history.md)): the chat's messages
  never leave the laptop, only who was in the group and between which days, and the export's names get their numbers
  from the exporter's Google Contacts there; it prints counts only and refuses to read or write inside the repository.
  Not a WhatsApp integration (D1): a one-off export, read once. A CSV row is one stay ("Entró el", "Salió el"), so
  someone who came back is a row per stay, one person by their phone; the database records a stay once, closes the
  open one when a later export says it ended, and never reopens it from an older one. Days, not times (Dani: "Days";
  the bot and the web report a day), and joins and leaves go into the history on their own day. The CSV import may
  save someone with only a phone, an email or a Discord username, as the bot does (R37; Dani: "that is fine"), and
  start them as Baja; current members come in as Nuevo, moved to Activo by hand (Dani: "yes"). Migration
  `20261018100000`; mutation list `community-stays`.
- **R57. A person's page, read first and edited in place** (Dani, 2026-10-18: "too many fields, too many forms in
  the same page, forms that are not inline compared to the view, right bar dramatically taller than the center").
  Options: trim the forms where they are; rearrange the page. **Chose to rearrange it**: the heading says who they
  are, with "Me lo quedo" and WhatsApp beside it; the wider column holds where they are (stage, owner and next step,
  each a value with "Cambiar…" that turns into its form in that very place, focus going in and coming back), one box
  for an attempt or a note (an attempt unless a note is chosen; both keep what was typed), and the history, its
  latest ten in view and the rest behind "Ver lo anterior". The narrower column holds what is known, each card
  edited in place: contact (phones written with their spaces, "Quitar" as a quiet button), the profile (only what
  is known, its editor in four groups: who they are, where they live, how they came, how they would help), the
  community, the census (its consents folded). Merging, the team account and their data, done rarely, are folded
  under "Más acciones". A phone shows the same in one column; claiming, WhatsApp and the stage stay on its first
  screen. The edit-in-place pattern is `EditInPlace` (`apps/web/src/ui`).
- **R58. One sign-up day and one way in** (D17; Dani, 2026-10-18: "llego and entro is the same thing", "it should be
  one single date", "entro por and llego por ... should be merged"). Options: keep the source as a field beside the
  channel; merge them. **Chose to merge, in what is shown**: "Llegó el" is "Fecha de alta" and "Llegó por" is "Canal de
  alta" everywhere; the source ("Entró por") leaves the person's page, the cards, the filters and the Panel (whose
  weeks are counted by channel alone, "Altas por semana"), and stays for the history ("Añadido desde …"). Whoever had
  no channel took it from their first source that says one: Global's form, its own; the bot, WhatsApp (migration
  `20261018120000`). On a person's page the sign-up is edited in its own card, "Alta y comunidad", which tells the
  stays in the group only by what changed since ("Salió del grupo el …", "Volvió al grupo el …"), never repeating the
  day. In the data, a stay's start stays its own (`community_presence.joined_on`), as someone may join the group long
  after signing up, or come back; Importar calls those columns "Entrada al grupo" and "Salida del grupo". The bot's
  post to the team group still says "Fuente": the next change to it moves it to the channel.
- **R59. Personas' counters and filters** (Dani, 2026-10-18: "havin counters in /personas would be nice", "the
  filters ... could do some improvements"). The filters filled a laptop's first screen and a phone's first three,
  counted nothing and didn't say which were on. **Now**: the search alone, with its button; a counter for every stage
  anyone is in, "Todas" first, each a link that is its filter (the chosen one bordered and bold), counted with the rest
  of the filters; the others folded under "Más filtros" (a `details`, no script), which says how many are on; those on,
  under it, each a link that takes it off, and "Quitar los filtros"; "N personas" above the list. The Pipeline shares
  the form without the counters, its stage one more folded filter. The API counts on the first page only.
- **R60. A duplicate seen beside its candidates, and attached to whoever is found** (Dani, 2026-10-18: "duplicates
  currently are hard to manage because you cannot see much of one of them, and when you search by hand only the
  original shows"). The Bandeja showed what came in by its name and place only, and the candidates as cards without
  contact details; what came in isn't a person yet, so no search found it. **Now**: a table compares what came in with
  each candidate, row by row (name, phone, email, Discord, province, channel and day of sign-up, the group, stage,
  owner, summary), "igual" where they agree, in words. Phones and emails are shown, of what came in and of the
  candidates (Dani: "Yes, but not census answers"): onboarding staff see them on every person's page already, and
  the decision needs them; a census answer still shows none (R24: anyone can type anyone's number). "¿Es otra
  persona? Búscala" searches as Personas does and attaches the record to whoever is found: `resolve_intake` takes any
  live person for it (migration `20261018140000`), but a census answer still only one of its candidates. Mutation list
  `bandeja`.
- **R61. A visual system: a colour per stage, three badge shapes, icons** (Dani, 2026-10-18, on the visual review:
  "accepted go for it", then "do everything"). Every screen was black, grey and one orange; stages were the same
  black outline, and the card said one fact up to three times. The code read WCAG 1.4.1 as "never a colour of its
  own", but it forbids colour as the only cue. **Now**: each stage has a cool hue (Nuevo blue, En contacto violet,
  Bienvenida hecha teal, Activo green, Inactivo grey, Sin respuesta rose, Baja and Descartado a darker grey), in
  `packages/ui` with every ink checked at AA on its fill, the canvas and the subtle grey; warm amber and red stay
  for statuses (act, late). Three shapes, three jobs: a stage is a round filled pill with its icon and word, a
  status a square chip with its icon and words, a tag ("Equipo") a quiet outline. Icons are Lucide
  (`lucide-react`, ISC), one per meaning (`apps/web/src/ui/icons.ts`), always beside their word and hidden from
  screen readers. A card says each fact once (onboarding spec, views): "Sin asignar" where the owner goes, the next
  step in a strip of its own, red once late and amber when today or missing, so those reasons get no chip; the
  others still do. Mutation list `visual`.
- **R62. Lists: a grid on Hoy, rows on Personas** (Dani, 2026-10-18: "maybe a grid is a better fit", then the
  review's answer). Hoy is a few dozen people to act on: a grid of cards, as many columns as fit. Personas is
  hundreds, searched and compared: rows with Persona · Etapa · Responsable · Siguiente paso · Falta lined up from a
  tablet up, each a card on a phone, one DOM either way; each cell says its own name to a reader, so the columns'
  names above are decoration. The Onboarding Pipeline keeps its columns, each under its stage's pill and colour,
  with cards that leave the stage out.
- **R63. Contacto: one field, its kind read from what is typed** (the visual review, 2026-10-18; Dani: "accepted go
  for it", "do everything"). Options: keep the "Tipo" select; infer the kind. **Chose to infer it**
  (`inferIdentityKind` in domain): an @ after the first character is an email; only digits, spaces, `+`, brackets,
  dots and dashes, a phone; anything else Discord would make, a Discord username (a leading @ goes). A number too
  short is no Discord name: it's refused, as is anything none of the three, in words, before anything is sent. The
  hint says what it will be stored as ("Se guardará como correo: …"). Each detail is one row: its kind's icon (the
  kind said to screen readers), the value, and "Copiar el correo" and "Quitar" at the row's end, which go under a
  long value instead of breaking it. The add field is always there, no longer folded. The API still takes
  `{ kind, value }`. Mutation list `forms`.
- **R64. Fields side by side stay in line** (the visual review; Dani, 2026-10-18: "alignment is horrible"). A row of
  fields shared its columns but not its rows, so a label that wrapped pushed its own box below its neighbours'.
  **Now** one rule, `fieldRow` (apps/web/src/ui/styles.ts): from a tablet up the fields share their rows (CSS
  subgrid), labels in one, boxes in the next, hints in the last, so boxes stay in line whatever the labels; one
  column on a phone. Labels in such rows are kept to one line anyway: "(opcional)" moved into the hint ("Cuándo
  fue", "Para cuándo"; outreach's "Cuándo fue" too). Used by the Registrar row, the next step, and Añadir; an e2e
  test lengthens a label until it wraps and checks the boxes. Mutation list `forms`.
- **R65. A person's page says where someone is under their name** (Dani, 2026-10-18: "do everything", the visual
  review's step 4). The heading had "Fuera de la comunidad" and an amber chip floating above the panels. **Now**: the
  stage's pill and the next step's strip under the name, red once late and amber when today or missing (the card's
  strip, R61), and a chip only for the reasons it doesn't show ("Sin asignar" keeps one, as the heading has no owner);
  whether they are in the group is told under "Alta y comunidad". Each edit is a small outlined button with its icon
  (a pencil, a plus to add), never underlined words beside the value; once Etapa's or Responsable's editor opens, its
  field's label is said only to a reader, as the row already says it. "Abrir WhatsApp" stays the one orange button.
- **R66. The other screens follow** (the review's step 5). The Panel's "Por etapa": each stage in its pill and a bar in
  its colour before its number, drawn to scale (the most people, the longest; 4.5rem on a phone, 14rem from a tablet
  up), the number staying. Personas' stage counters: each stage's icon in its colour. Hoy: two figures at a glance
  (mine pending; unassigned, amber when any) and the Bandeja's count as a blue chip that leads to it. The menu: one
  icon per section beside its word, none borrowed from a card (`NAV_ICONS`). Ajustes' "Nueva opción": its button
  beside the field, as Contacto's (R63).
- **R67. Outreach takes the same pills** (the review's step 5). Contactos shows its search and folds its other eight
  filters under "Más filtros", saying how many are on, as Personas does. A contact's relationship is a pill from the
  onboarding's hues: Identificado and Cualificado blue, Contactado violet, En conversación teal, Aliado green, "Ha
  dicho que no" and "En reposo" grey, the pairs that share a colour told apart by their icon; its tier is a quiet tag
  ("Nivel A"). The contact's page and every list of contacts (an organisation's, a campaign's) show the same.
- **R68. The Bandeja marks agreement and difference** (the review's step 5). "Igual" is a green chip with a check
  where a candidate agrees with what came in; "distinto" an amber one where both say something and it differs;
  nothing where either says nothing, or on a row that only shows (the group, the owner, the summary). Mutation list
  `visual-pages` covers R65 to R68.
- **R69. Discord in "Por dónde", and Contacto's one overlap** (Dani, 2026-10-19: "i think we should also list
  discord there", "i am not sure format can 100% tell apart discord from email and phone"). A contact attempt may be
  made on Discord, after Telegram (migration `20261019100000`). R63's reading, checked: an email is never anything
  else, since neither a phone nor a Discord username has an @ after its first character; a phone and a Discord
  username overlap only in digits and dots (`612345678` is both), still read as a phone, and **now** the hint then
  says "Si es un usuario de Discord, escríbelo con @ delante" (`mayBeDiscord` in domain). What no format tells apart
  is a word that is no username of ours (a name, a Telegram or Instagram handle): it passes as Discord, and the hint
  says so before anything is sent. A detail the person already has is said as such ("Esta ficha ya tiene ese
  teléfono."), not "Ya existe algo con esos datos". Mutation lists `onboarding` and `forms`.
- **R70. Hoy's "Mis personas": most urgent first, and a way to all of mine** (Dani, 2026-10-20: "i only assigned
  someone to me (who just arrived) and I kinda expected to see it there"). Someone just taken counts ("Sin siguiente
  paso"), but the list went by the step's day, the undated last, then the oldest first: the newest, with no step, came
  last, and past the first 100 it wasn't there at all, with nothing said. Options: rename the section and link to all
  of mine; list everyone mine still in progress; order by urgency. **Chose to order by urgency, and link**: a step
  already late, then one for today, then whoever is still "Nuevo" (not contacted yet, as any attempt moves them on),
  then the rest; "Ver todas mis personas" always (Personas, `responsable=yo`), and "Ver las N que necesitan algo"
  when Hoy shows fewer than it counts. The bot's `/mine` and the digest keep their order for now. Mutation list
  `hoy`.
- **R71. Each onboarder's own messages in Mensajes** (D18; Dani, 2026-10-21: "i want members of the onboarding team to
  be able to use their own messages (and the default one still be editable by someone)"). Options for who writes the
  team's: admins only; the onboarding team, as until now (R39). For who sees one's own: the whole team, with only its
  person changing it; its person alone. For what's offered: one's own first, then the team's; one's own alone when there
  are any. **Chose admins, its person alone, and one's own first** (Dani, 2026-10-21). A message is the team's or its
  writer's own (`private_to`), for good; nobody else sees one's own, admins neither, as outreach's "Solo yo" (M5, step
  6). Mensajes lists both in the order offered, one's own marked "Solo tú lo ves"; an onboarder writes only their own
  and sees the team's with "Es del equipo: lo cambia quien administra."; an admin picks "Quién lo usa" for a new one
  ("El equipo" by default). The pickers on a person's page and in Censo group them under "Tuyos" and "Del equipo" when
  there are both. A title is unique among the team's, and among each person's own. What went out names a message its
  writer sees; someone else reading that person's history reads "con un mensaje propio de quien lo envió". Every message
  written until now stays the team's, so onboarders no longer change those. Migration `20261021100000`; mutation list
  `message-templates`.
- **R72. A phone found however it is written** (Dani, 2026-10-22: "search does not seem to be working fine", searching
  "857 756 3987" for someone saved as +1 857 756 3987). A search found a phone only when what was typed read as the same
  whole number, Spanish when it had no `+`: a foreign number written as at home, or part of one, found nobody. Options:
  assume more countries; match the digits. **Chose to match the digits too**: a query written only as a phone is
  (digits, spaces, `+`, brackets, dots, dashes), with at least 6 digits once the zeros a `00` or national prefix starts
  with are dropped, finds every stored number with those digits in it, as well as the exact match. Fewer digits would
  list too many. Personas and Censo search alike (the same filter); the bot's `/search` still matches whole numbers.
  Mutation list `onboarding`.
- **R73. "Cuándo fue" starts on today** (Dani, 2026-10-22: "by default it should pick today in the date"). Options: an
  empty field that means today, as until now; today filled in. **Chose today filled in**, for a contact attempt, a note
  and a stage change on a person's page, and for a note in Contactos and Organizaciones, alike. Left on today (or
  emptied) it is still now: nothing is recorded as another day, so the history doesn't add "ocurrió el" to every entry.
  Mutation list `person-page`.
- **R74. Where someone lives, and where they're from** (D19; Dani, 2026-10-22: "what if the person is originally from
  a place but they live elsewhere, also what about latam and even other countries, there is people from madrid in
  germany or USA"; then "spain, spaniards abroad and latam and latam abroad. I think having a fancy way to select
  countri and even provincia would be very convenient too"). Province and town were free text, with no country:
  someone in Berlin could be written down, but not found by country, and Global's `Country` was never read. Options
  for where they live: add a country; relabel only. For where they're from: not now; an optional "De dónde es".
  **Chose a country, and "De dónde es"** (Dani). A person has `country` (an ISO 3166-1 code), `province` (now
  "Provincia o región") and `town`, and `origin_country` and `origin_province`, all optional and personal data,
  carried by every intake, census answer, merge and erasure. The staff app picks a country by typing part of its name
  in Spanish or English, accents aside ("alem", "Germ", "EEUU"), Spain first, then Latin America, then the rest of the
  world (Ark UI's combobox, ADR-0003); while the country is Spain or not said, Spain's 52 provinces are offered the
  same way and by their other names ("vizc" finds Bizkaia), and anything else typed is kept (a region abroad, or how
  it was written before). The census form, phone-first, uses the phone's own picker (a select in the same order) and
  suggests the provinces. A card says "Maite (Baviera, Alemania)", the person's page "Dónde vive" and "De dónde es" as
  a line each, Personas filters by country ("Sin indicar" too), the Bandeja compares countries by name, the CSV import
  reads "País", "País de origen" and "De dónde es", the Airtable sync reads Global's `Country` (ADR-0005), and the CSV
  export adds "pais". "Falta: dónde vive" no longer asks someone abroad for a province. Everyone whose province is one
  of Spain's, as written, and everyone Global's view brought, is set as living in Spain; nobody else is guessed at.
  The phone keeps Spain as its default region. Not done then: the bot (its team post still said "Provincia"), regions
  of other countries as lists, and the Panel by country, done since (R81 to R84). Migrations `20261022100000` and
  `100100`; mutation list `places`. The census's privacy summary lists the new data: its wording version
  (`CENSUS_WORDING_VERSION`, in gitops) goes up with this release.
- **R75. Añadir rápido says whose place it is** (Dani, 2026-10-23: "there is still only one place it does not say if
  where from or where lives … and looks terrible"). The country, province and town sat in a row built for fields of one
  shape (label, input, hint on a shared grid), which squeezed the pickers into each other, under no heading. Options for
  where they're from: ask it there too, folded; always shown; only in the profile. **Chose folded** (Dani): "Dónde vive"
  is a labelled group whose fields sit side by side while they fit and stack on a phone, and "Añadir de dónde es" opens
  a second group, taking focus to its country. `POST /api/intake` takes `originCountry` and `originProvince`. Mutation
  list `places`.
- **R76. A version without a name is optional, and messages longer** (Dani, 2026-10-23: "i think the without name
  messages should not be mandatory", "the cap on the messages is too small i might want longer texts"). R40 required a
  second version of every message using `{nombre}`. Options: keep it required; optional, with `{nombre}` taken out when
  there's none; drop it. **Chose optional**: without it, someone saved without a name gets the message with `{nombre}`
  and the comma or space before it taken out ("Hola, {nombre}:" reads "Hola:"), which the editor shows as the field's
  placeholder and in the preview; a version, when written, still never names anyone. A message and its version are up to
  10,000 characters (2,000 until now). Migration `20261023100000`; mutation list `message-templates`.
- **R77. "Escribirle": a message from Mensajes, by any way** (Dani, 2026-10-23: "inside a person it is not obvious how
  to use the messages", "if i am using discord or email how can i use messages if i have them?"). A person's page
  offered only "Abrir WhatsApp", and only with a phone, the message unseen until WhatsApp opened. Options: keep
  WhatsApp, and copy the text elsewhere by hand; a block for every way. **Chose a block for every way**: "Escribirle"
  names the message (a picker, one's own then the team's, when there are several), then "Abrir WhatsApp" (with a
  number), "Abrir el correo" (with an email: the mail app opens with a subject and the message written, `mailto:`) and
  "Copiar el mensaje" (for Discord, Telegram or anything else), one line saying the onboarder sends it, and its text
  under "Ver el mensaje", with the way to Mensajes. Back on the page, "¿Lo has enviado?" logs a contact attempt on that
  channel, naming the message; a copied one is asked where it went, Discord first for someone who has it. The census
  link offers the same three ways (Censo). Some mail apps cut a very long `mailto:` link: copying always works.
- **R78. The Bandeja says what's going on** (Dani, 2026-10-23: "depending on where i am bandeja sounds counter or it
  does not, also bandeja is very weird … i do not understand what to do or what the issue is … there is no comparison
  and no anchor to understand or make the call (for example contact details or geography or dates)"). Three things were
  wrong. The menu counted it only on Hoy and the Bandeja, the only pages that asked; now the frame asks (`GET
/api/bandeja/count`) wherever the page doesn't. A record a source sent again, changed, waited as "Datos que no
  coinciden" without its differences ever being kept, so nothing was shown and "Usar lo que ha llegado" had nothing to
  use; now only what the source changed is attached again (a value corrected by hand isn't proposed back at every sync,
  which R74's country would have done to every Airtable record), what differs is kept, and those already waiting were
  said again or, with nothing differing, settled (migration `20261023110000`). And a conflict showed the person's card
  and two buttons: now every item says in a sentence why it waits and what each answer does, a conflict sits beside its
  record row by row ("igual", "distinto": name, phones, emails, Discord, place, sign-up, stay, stage), contact details
  included but beside a census answer (R24), with what using it would change; a phone, email or Discord already someone
  else's names whose, with a link, and how to merge them. Rows empty on every side are left out. Mutation lists
  `onboarding` and `message-templates`.
- **R79. Hoy keeps what one just did at hand** (Dani, 2026-10-23: "in hoy i still do not see people i just did something
  that section is a bit weird"). "Mis personas" listed only those needing something now: someone given a step for next
  week, or just contacted, left it. Options: everyone mine in progress, and a "Recientes" row; needs-something and
  "Recientes"; everyone mine alone. **Chose everyone mine and "Recientes"** (Dani): "Mis personas" lists everyone one
  holds still in onboarding (Nuevo, En contacto, Bienvenida hecha) or needing something, what needs something first in
  R70's order, then the rest by their step's day; "Recientes", above it, the last people one did anything with in the
  past two weeks (a note, an attempt, a stage, taking them), whoever holds them, newest first, each a link beside their
  stage. The figure still counts those needing something. The bot's `/mine` and the digest are unchanged. Mutation list
  `hoy`.
- **R80. A search from anywhere** (Dani, 2026-10-23: "i would like a fancy combination that opens a fancy search
  everywhere, searching for people is not usable right now"). Searching meant going to Personas, typing, pressing Buscar
  and reading a list in the order people were added, fuzzy matches among the rest. Options for what it finds: people,
  sections and actions (and contacts and organisations for outreach staff); people alone. **Chose people, sections and
  actions** (Dani): Ctrl K (⌘K on a Mac), or "Buscar" in the header, opens a dialog on any page that finds as it's
  typed: people by name, phone, email or Discord as Personas does, best first (a contact detail that is theirs, the name
  itself, a word of it starting so, the name containing it, then names only like it, by how alike), with their stage and
  place; for outreach staff, contacts and organisations; then what can be done ("Añadir una persona", "Nuevo contacto")
  and the sections, by name. Nothing typed, the people one last worked with (R79). The arrows move, Enter opens, Escape
  closes and puts focus back (Ark UI's dialog, ADR-0003; a listbox the input drives). `GET /api/search?q`. Mutation list
  `hoy`.
- **R81. The team group's post says where someone lives** (Dani, 2026-10-24: "do these", R74's "Not done"). It said
  "Provincia: …", and nothing of the country R74 added: someone in Bavaria read as a Spanish province. Options: the
  place as a line, as a card says it; the country on a line of its own. **Chose the line**: "Dónde vive: Baviera,
  Alemania", Spain going without saying ("Dónde vive: Sevilla"), the country alone when that's all that's known, no
  line when nothing is. `private.team_card` returns the country's code too, and nothing more (no town, no place of
  origin; ADR-0002 §4, ADR-0004). Migration `20261024100000`; mutation list `bot-commands`.
- **R82. The bot's search finds a phone by part of its digits** (Dani, 2026-10-24, as R81). `/search` (`/buscar`) and
  `/left` (`/baja`) matched a phone only whole and only as Spain's or with its country code: "857 756 3987", or the end
  of a number, read as a name and found nobody. Options: Personas' rule (R72); the whole number only. **Chose
  Personas' rule**: six digits or more, however written, match a stored phone with them in it; fewer are read as a
  name. A message with them is deleted, as one with a whole number is. `private.bot_people` takes the digits (checked
  there too: six or more, digits only) and still returns only names, stages, owners and reasons (ADR-0002 §4).
  Migration `20261024100100`; mutation list `bot-commands`.
- **R83. Other countries' regions are offered as lists** (Dani, 2026-10-24, as R81). Only Spain's provinces were;
  anywhere else the region was free text, so the same state was written several ways and couldn't be filtered by.
  Options for which countries: Latin America's and the United States' (where the community lives, and where much of
  it lives abroad, D19); every country's (a dataset of thousands of names to keep). **Chose Latin America's and the
  United States'**: the first level of ISO 3166-2 for each (Puerto Rico has none), as each is called there ("São
  Paulo", "New York"), found by any part of any name and by other ways of writing some ("cdmx", "CABA", "Nueva York",
  "Cuzco"). The staff app's picker offers the country's while it is picked, the census form suggests them, and
  anything else typed is still kept, as before. Nothing is stored differently: a region is text. Mutation list
  `places`.
- **R84. The Panel says where people live** (Dani, 2026-10-24, as R81). "Dónde viven" counts people by the country
  they live in, as the community is (D19): Spain, then Latin America and the rest of the world, each under its name
  and total, the most people first, and "Sin indicar" last; each country links to Personas filtered by it, which finds
  the same people (merged and erased ones left out). A table with bars to scale, as "Por etapa" (R66).
  `GET /api/panel` adds `countries`. Mutation list `places`.
- **R85. The search's shortcut is each system's own** (Dani, 2026-10-24: "search ctrl + k (but in mac it is not
  ctrl, right?)"). Both Ctrl K and ⌘K opened it everywhere, and the header said "Ctrl K" on a Mac too, where the page
  then took Ctrl K from every text field (macOS deletes to the end of the line with it). **Chose each system's own**:
  ⌘K on a Mac, an iPhone or an iPad (by the browser's user agent), Ctrl K elsewhere, neither with Shift or Alt (Ctrl
  Shift K is a browser's console); the header and the dialog's help say that one, and the button tells assistive
  technology (`aria-keyshortcuts`). The server renders Ctrl K, and an Apple browser switches it once hydrated.
  Mutation list `hoy`.
- **R86. Añadir keeps what is typed before the page comes alive** (found 2026-10-24, CI red after R84). A name typed
  in Añadir before React had hydrated the page (a slow phone; CI typing right away) stayed in its field and was left
  out of the person added, who came out "Sin nombre": React keeps a field's text when it hydrates, not its state.
  **Chose to take it up**: once alive, the form starts its name, phone, email and Discord from what the fields hold.
  The place fields (Ark UI's) aren't taken up: they are seldom first, and a choice from their lists needs the page
  alive. E2E holds the page's scripts back, types, then lets them load. Mutation list `onboarding`.
- **R87. Countries' names are the app's own** (found with R86). They came from the platform (`Intl`), whose names
  differ between Node and each browser ("RAE de Hong Kong (China)" on the server, "Hong Kong" in Chromium), so a page
  listing them as it loads (Añadir, the census form) was drawn otherwise in the browser than on the server: React
  threw the server's away and drew it again, emptying what had been typed (since R74).
  **Chose a table**: the 249 names in Spanish, CLDR 48's with the shorter ones browsers say for Hong Kong, Macao,
  Palestine and the Falklands, written in Spanish order, not sorted at runtime (as R83's regions). English names, only
  for finding a country as typed, still come from `Intl`. E2E now fails any test whose pages fail to hydrate, as it
  does for a Content Security Policy violation. Mutation list `places`.
- **R88. A form sent before the page comes alive never puts what was typed in its address** (found 2026-10-24, with
  R86: E2E signed in before `/entrar` had hydrated, and landed on `/entrar?email=…&password=…`). The forms the page
  sends had no method, so the browser sent one itself as a GET: a password, a person's details or the Airtable link in
  the address, the history and the access logs. **Chose POST for every one of them** (43 forms, the census form's
  too), which Next answers with the page again, to send once it's alive; searches and filters stay GET. A test fails
  any form without a method; E2E signs in too early and checks, and waits for a page to be alive before typing after
  a full load (`e2e/alive.ts`), as the sign-in test now does. ADR-0002 §8. Mutation list `form-method`.
- **Open from the review** (low): the census link travels in the wa.me message (by design: the person sends it).
  Fixed since: two generic answers with the same new email or phone at once (the second now waits and goes to the
  Bandeja), and the app role inserting a target already dated (only an admin, the importer, adds history).

## Tracking

| Milestone | Status                                          | Demo note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0        | Deployed                                        | Sign-in with TOTP, invitations by email, the team, the audit log; Helm chart, CI and release workflows, gitops branch prepared (not pushed). Locally: `pnpm db:reset`, `pnpm build`, `pnpm test:e2e` (sign-in, invitation, access, axe). Deploying waits on Dani's steps in [deploying](runbooks/deploying.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| M1        | Deployed; the Airtable sync on since 2026-10-17 | Hoy, Personas, Persona, Onboarding Pipeline, Añadir rápido, Bandeja, Importar (CSV, and the Airtable sync, checked against the real view's structure), Ajustes; the Telegram bot (linking, /joined, /left, /mine, /unassigned, /search, /sync, each also by its Spanish name, the team group, the digest). E2E covers the web flows; the bot is covered by API tests against a fake Bot API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| M2        | Deployed, the form not public                   | The forms app at `unete.pauseai.es` (generic and personal links, honeypot and timing, consents with their wording version, the privacy notice as a draft); Censo, the person's census side, the Bandeja's census answers, the option lists in Ajustes; export and erasure. E2E covers a personal link end to end and the generic link. Deploying waits on the M2 steps in [deploying](runbooks/deploying.md) and the privacy notice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| M3        | Deployed                                        | Campañas (board by status, templates with a preview per contact, evidence paragraphs, targets), Contactos, Organizaciones, Siguiente (take the next target, open the letter in your own mail or WhatsApp, copy buttons, "Sí, enviada"), and the one-off import from the `outreach` repo, checked against the real campaign locally (counts only). Nothing sends. E2E covers Siguiente end to end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| M4        | Deployed                                        | The Panel (people by stage, weekly arrivals by source, time to first contact, the unassigned for more than 48 hours). No retention job (D9) and no MCP server for now (D10). E2E covers the Panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| M5        | Deployed                                        | Done (2026-10-17), all seven steps live: on a phone, a person's page opens with its quick actions; the menu in groups by role; "Llegó el" and "Llegó por", the stages folded; cards that say who someone is and what's missing; a team account linked to its person ("Equipo"); keep a contact "Solo yo", see that nobody else on the team sees it, then share it, notes and all if ticked, into the team's contact that is the same person, and date an organisation's note when it happened; write a welcome in Mensajes, open a person's WhatsApp with it, and see it named in their history. Since: Censo pages and searches its queue (R47), the sidebar fits a laptop (R48), and admins set Global's Airtable link in Ajustes (R49), syncing hourly; the WhatsApp group's history comes in through Importar, a stay per row (R56); each onboarder writes their own messages in Mensajes, offered before the team's, which admins write (R71). E2E covers it, on a phone too. |
