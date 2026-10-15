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
   shared link works meanwhile ([ADR-0005](adr/0005-airtable-intake.md)), so nothing waits on this.

## Specs, written just in time

Each spec is reviewed by Dani before the milestone that builds it starts:

| Spec                                   | Ready before                    | Status                                     |
| -------------------------------------- | ------------------------------- | ------------------------------------------ |
| [Data model](spec/data-model.md)       | M0 (its M0 tables), then M1, M3 | M0 tables drafted; awaits review           |
| [Onboarding](spec/onboarding.md)       | M1                              | Drafted from the specification             |
| [Personal data](spec/personal-data.md) | M2                              | Drafted; D9, D12 and the notice are Dani's |
| [Outreach](spec/outreach.md)           | M3                              | Drafted from the specification             |

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
  workflow to Harbor.
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
- **Views:** Hoy, Sin asignar, Embudo, Personas (CSV export for admins, audited), Persona with its quick actions,
  Añadir rápido, Bandeja, Importar, Ajustes → Telegram.
- **Matching and merge** ([onboarding §6](spec/onboarding.md#6-matching-and-merging)).
- **Intake:** the Airtable sync as `ingest` (hourly CronJob and on demand), if the spike works; the CSV import
  either way.
- **The Telegram bot** ([ADR-0004](adr/0004-telegram-bot.md)): linking, the webhook, the commands, deleting
  messages with contact details, the bot channel's limits in RLS.
- **Notifications:** the team group (optional, D11), the daily digest (Telegram, email fallback).
- **Jobs:** the Airtable sync, the daily digest, the dialog clean-up.
- **E2E:** linking Telegram, `/alta` through a fake Bot API, claim from the team group, quick-add, CSV import, log
  attempt, merge.

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
- **An MCP server with member tokens**, if D10 says so.
- **Retention automation** (D9), as the daily retention job.

## Decided

| ID      | Decision                                                                                                                              | By               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **D1**  | WhatsApp joins and leaves are reported to a Telegram bot by whoever sees them. No WhatsApp integration for now                        | Dani, 2026-10-15 |
| **D2**  | Airtable is read through Global's shared view link, kept as configuration (a sealed secret) ([ADR-0005](adr/0005-airtable-intake.md)) | Dani, 2026-10-15 |
| **D3**  | No mailbox is read: the Airtable view carries the same data as the notification emails                                                | Dani, 2026-10-15 |
| **D4**  | The staff UI is on `gateway-public` with mandatory two-factor (no VPN)                                                                | Dani, 2026-10-15 |
| **D11** | The bot must work for one person. The team group is optional: on when a group is configured                                           | Dani, 2026-10-15 |
| —       | Backups are handled in gitops, separately from this plan                                                                              | Dani, 2026-10-15 |
| —       | Legal and privacy calls (D9, D12, the privacy notice) are Dani's, for the association                                                 | Dani, 2026-10-15 |

## Open decisions

Each has a recommendation. Unless Dani objects, the recommendation is what gets built.

| ID      | Decision                                   | Options                                                                       | Recommendation                                                                                                                                       |
| ------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D5**  | Tenancy                                    | Single organisation, or tenant-ready from day one                             | **Single.** Another chapter runs its own instance, on its own Postgres server ([R13](#decisions-to-review-taken-by-claude-while-dani-was-away))      |
| **D6**  | UI language                                | Spanish only, or English source with mandatory Spanish                        | **Spanish only**, through message files (use-intl, as next-intl) so a locale can be added later                                                      |
| **D7**  | Access granularity                         | Module roles, or "a volunteer sees only their own people"                     | **Module roles** for v1; revisit when the team grows past about 8                                                                                    |
| **D8**  | Outreach sending                           | A person sends (handover), or the app sends through Mailu per explicit click  | **A person sends**, as the outreach repo already does                                                                                                |
| **D9**  | Retention                                  | Anonymisation periods per stage                                               | 12 months after leaving or last contact, for `left`, `unresponsive` and `discarded`; Dani to confirm                                                 |
| **D10** | LLM tools (MCP)                            | None; read-only member tokens; tokens that also draft                         | Decide at M4. If yes, as aiontheballot ADR-0008: a person's token, drafts only, and personal data to Anthropic only with the association's agreement |
| **D12** | Telegram as a channel for names and phones | Accept, with the bot deleting messages after saving; or names only in the bot | **Accept**, as designed in [ADR-0004](adr/0004-telegram-bot.md); Dani to confirm                                                                     |

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
  §8); what changed without personal data (aiontheballot). **Chose aiontheballot's rule:** columns commented
  `personal data` are never copied into `audit_log`, and an update to one is logged with the column's name only.
  Erasure never has to rewrite the log, and an admin reading the log doesn't see members' data. A catalog test
  keeps the list honest.
- **R3. Staff identity.** Options: a staff id of its own; the Better Auth user id. **Chose the Better Auth user
  id** as `app.staff`'s key, with roles in `app.staff_roles`. An invitation carries a set of roles; accepting it
  creates the staff row.
- **R4. The first admin.** Options: a sign-up open until the first account; a seeded account; the owner's command.
  **Chose the owner's command**, as aiontheballot (A1): `create-account` in an API pod prints a one-hour
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
  ("He olvidado mi contraseña"), as aiontheballot: only for accounts with a second factor (so the mailbox alone
  gets nothing), one link per 15 minutes per account.
- **R8. No licence file yet.** Whether the repository is public, and under which licence, is Dani's call
  (aiontheballot is AGPL-3.0-or-later). Nothing is published meanwhile.
- **R9. Local Postgres on port 5434**, container `backoffice-postgres` (aiontheballot uses 5432,
  aisafety-newsroom 5433), so all three run side by side.
- **R10. Nothing pushed.** Commits stay local on `main`, and gitops changes on a local branch in the gitops repo,
  until Dani says so: pushing `main` starts the release workflow, which pushes images to Harbor, and pushing gitops
  deploys.
- **R11. Hosts.** The staff host `backoffice.pauseai.es` stays the default in docs and values (D4 says
  configuration); the census host is chosen in M2.
- **R12. Sessions** last 12 hours, are never refreshed, and offer no "remember me" or "trust this device", as
  aiontheballot.
- **R13. Database names are fixed in the migrations.** Options: role and database names from config; fixed.
  **Chose fixed** (`pauseai_backoffice_*`), as aiontheballot: dbmate has no variables, and building every `GRANT`
  and `POLICY` with dynamic SQL would make the security review harder. Consequence: another chapter's instance
  needs its own Postgres server, or a renaming migration (D5). The product name and hostnames still come from
  config.

- **R14. Airtable rows without Global's chapter-share permission are left out by default.** The spike found a
  `GDPR chapter share permission` checkbox in Global's view, ticked on 43 of 118 rows. Options: import every row,
  relying on Global's privacy notice (the specification's reading); import only rows with the box ticked. **Chose
  the box** while Dani decides, as the conservative option: it's a switch (`AIRTABLE_REQUIRE_CHAPTER_PERMISSION`,
  default `true`), and the skipped rows are counted in every run. Setting it to `false` imports them on the next
  run; nothing else changes.
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
  **Chose both** (defence in depth, as aiontheballot's preview token).
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
  lists. Applying it still adds them to the person.
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
- **Open from the review** (low, for later): two simultaneous generic answers with the same new email can make the
  second fail; the census link travels in the wa.me message (by design: the person sends it); the app role may insert
  a target already dated (only the importer does).

## Tracking

| Milestone | Status              | Demo note                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M0        | Built, not deployed | Sign-in with TOTP, invitations by email, the team, the audit log; Helm chart, CI and release workflows, gitops branch prepared (not pushed). Locally: `pnpm db:reset`, `pnpm build`, `pnpm test:e2e` (sign-in, invitation, access, axe). Deploying waits on Dani's steps in [deploying](runbooks/deploying.md).                                                                                                                      |
| M1        | Built, not deployed | Hoy, Personas, Persona, Embudo, Añadir rápido, Bandeja, Importar (CSV, and the Airtable sync, checked against the real view's structure), Ajustes; the Telegram bot (linking, /alta, /baja, /mios, /libres, /buscar, /sincronizar, the team group, the digest). E2E covers the web flows; the bot is covered by API tests against a fake Bot API.                                                                                    |
| M2        | Built, not deployed | The forms app at `unete.pauseai.es` (generic and personal links, honeypot and timing, consents with their wording version, the privacy notice as a draft); Censo, the person's census side, the Bandeja's census answers, the option lists in Ajustes; export and erasure. E2E covers a personal link end to end and the generic link. Deploying waits on the M2 steps in [deploying](runbooks/deploying.md) and the privacy notice. |
| M3        | Built, not deployed | Campañas (board by status, templates with a preview per contact, evidence paragraphs, targets), Contactos, Organizaciones, Siguiente (take the next target, open the letter in your own mail or WhatsApp, copy buttons, "Sí, enviada"), and the one-off import from the `outreach` repo, checked against the real campaign locally (counts only). Nothing sends. E2E covers Siguiente end to end.                                    |
| M4        | In progress         | The Panel (stages, weekly arrivals by source, time to first contact, the unassigned) is built. Retention (D9) and the MCP server (D10) wait on Dani's decisions.                                                                                                                                                                                                                                                                     |
