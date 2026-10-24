# ADR-0002: Authorization and data protection

- **Status:** Accepted for M0 (Claude's recommendations D5 and D7, taken unless Dani objects; PLAN R1–R5, R13 to
  review)
- **Date:** 2026-10-15
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G5, §3, §5; [ADR-0001](0001-hosting-and-delivery.md),
  [ADR-0003](0003-application-stack.md), [ADR-0004](0004-telegram-bot.md); [data model](../spec/data-model.md),
  [personal data](../spec/personal-data.md)

## Context

- **What is at stake** (BRIEF §5, in priority order): members' personal data, which reveals who supports an
  AI-pause organisation; staff accounts, each of which opens it; linked Telegram accounts, the bot token and the
  webhook secret; the Airtable shared view link; outreach notes.
- **Who uses it:** a handful of volunteers with three roles (`admin`, `onboarding`, `outreach`) that combine, on a
  public host (D4), from their phones, plus a Telegram bot acting for them (ADR-0004).
- **What an earlier project already proved** ([ADR-0003](0003-application-stack.md)): least privilege enforced in
  Postgres (non-owner runtime roles, RLS, explicit grants, closed by default), the actor set per transaction by
  `withActor`, the second factor checked in the database (`app.aal`), and a narrower channel for tools
  (`private.needs_a_person`). Its tenancy
  (`tenant_id` everywhere) and editorial rules (four-eyes, immutable snapshots) don't apply here.

## Options considered

1. **Tenancy (D5).**
   - (a) Tenant-ready from day one: `tenant_id`, composite keys and tenant policies on every table, as
     the earlier project. Every table and test pays for a second chapter that may never come.
   - (b) **Single organisation.** Another chapter runs its own instance, on its own Postgres server.
2. **Access granularity (D7).**
   - (a) Per row: "a volunteer sees only the people assigned to them". Safer in principle, but onboarding is a
     shared queue: claiming, picking up someone else's person and the unassigned list all need to see more.
   - (b) **Module roles** for v1: onboarding tables need `onboarding` or `admin`, outreach tables `outreach` or
     `admin`. Revisit when the team grows past about 8.
3. **How the bot is limited.**
   - (a) In the API only: a list of routes the bot may call.
   - (b) **In the database too**, as the earlier project does for tokens: a channel setting the policies read, so
     a new table is closed to the bot until opened on purpose.
4. **What the audit log keeps.**
   - (a) Each write's row before and after, personal data included (the specification's first draft).
   - (b) **What changed, without personal data**, as the earlier project: columns commented `personal data` are never
     copied. Erasure then never has to rewrite the log, and an admin reading the log doesn't see members' data.

Recommended and taken unless Dani objects: 1b, 2b, 3b, 4b (PLAN R2, R5).

## Decision

### 1. Single organisation (D5)

One operator, PauseAI España. No `tenant_id`. Another chapter runs its own instance on its own Postgres server.

**Names are fixed in the migrations** (PLAN R13): the database is `pauseai_backoffice` and the roles are
`pauseai_backoffice_*`, written into every `GRANT` and `POLICY`, as the earlier project does. dbmate has no variables,
and building every grant and policy with dynamic SQL would make the security review harder. So another chapter's
instance needs its own Postgres server (role names are global to a server), or a renaming migration. The product
name and hostnames still come from config.

### 2. Database roles

| Role (prefix `pauseai_backoffice_`) | Used by                                               | May                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `owner`                             | The migration Job only                                | Own the schemas. Never used at run time                                                                                           |
| `app`                               | The API's staff and bot routes, via `withActor`       | Read and write `app` under RLS                                                                                                    |
| `auth`                              | Better Auth and the Telegram links, in the API        | Only the `auth` schema                                                                                                            |
| `ingest`                            | The Airtable sync (CronJob, and on demand in the API) | Read the sealed link while the sync is on; insert intake records and import runs; execute the matcher; record a run; nothing else |
| `public`                            | The API's census form routes                          | Execute `private.census_form` and `private.submit_census`; no table grants                                                        |

- Every runtime role is `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB` and owns nothing. A catalog test keeps it
  that way.
- Role names are global to the Postgres server, hence the prefix.
- All five roles exist from M0 (locally and in gitops); M0's migrations grant only to `app` and `auth`. `ingest`
  gets its grants in M1, `public` in M2 (PLAN R1).
- Closed by default: nothing is granted to `PUBLIC`, functions aren't executable by `PUBLIC`, and every grant to a
  runtime role is explicit, column by column where a role may write only some columns.
- The API checks at start-up that each connection logs in as the role its routes assume, and stops otherwise.

### 3. The actor: `withActor`

Every query a signed-in person or the bot makes runs inside `withActor`, which sets, per transaction
(`set_config(..., true)`, so nothing leaks to the next user of a pooled connection):

- `app.user_id`: the staff member's account (the Better Auth user id);
- `app.aal`: 2 only for a session a TOTP or backup code created, and for a linked Telegram account
  ([ADR-0004](0004-telegram-bot.md)); 1 otherwise;
- `app.channel`: `web` or `bot`.

With no actor, every policy denies. Jobs without a person act as a system actor where a table needs one (ADR-0001
§2).

### 4. Row-level security by module and channel

- **By module role:** onboarding tables need `onboarding` or `admin`; outreach tables `outreach` or `admin`;
  `audit_log`, exports and erasure `admin` only; staff and invitations are managed by `admin`.
- **Lists edited in Ajustes** (the census's options; "Llegó por", `app.arrival_channels`, PLAN M5) are read by the
  staff who choose from them and changed by admins only, never deleted. "Llegó por" adds no function the runtime
  roles run: the intake functions resolve it as their owner (`private.arrival_channel`), and the bot names no entry
  but WhatsApp's key.
- **Mensajes** (`app.message_templates`, PLAN M5, R71): the WhatsApp messages newcomers receive are the team's,
  read by onboarding staff and admins and written by admins, or a staff member's own (`private_to`), which they alone
  read and write, admins included, as outreach's private records. A message is the team's or its person's for good:
  `private_to` is granted on insert, never on update. Never deleted, and their purpose and version aren't writable.
  The bot gets nothing. The triggers that check which message went out (on a contact attempt and a census link) run
  as the writer, who reads the team's and their own, so no one names someone else's; no new function for the runtime
  roles.
- **Helpers** (`SECURITY DEFINER`, so policies on `staff` and `staff_roles` don't recurse into their own RLS):
  - `private.staff_can(VARIADIC roles)`: true only for the web channel, at aal 2, for an active staff member who
    holds one of the roles.
  - `private.bot_can(VARIADIC roles)`: true only for the bot channel, at aal 2, for an active staff member who
    holds one of the roles.
- **Closed to the bot by default** (PLAN R5): policies use `staff_can`. A policy open to the bot names `bot_can`
  too, on purpose, and a catalog test lists every policy that admits the bot, so opening one shows in review.
  What the bot may do is in [ADR-0004](0004-telegram-bot.md): report an arrival (intake record), report a leave
  (presence), claim a person for oneself, and the reads its commands need. Everything else is refused when
  `app.channel = 'bot'`, whatever the member's roles.
- A `SECURITY DEFINER` function, which bypasses RLS, checks the channel itself.
- No channel set: every policy denies.
- **M1's narrow functions** (migration `intake`), each `SECURITY DEFINER`, each checking its caller and channel
  first, and listed in the catalog tests' allowlists:
  - `private.submit_intake`: a report through the staff app (`manual`) or the bot (`telegram`), each through its
    own channel only: through the staff app by onboarding staff and admins, through the bot by the onboarding role
    alone (D13); then the matcher.
  - `private.resolve_intake`, `private.import_csv`, `private.merge_people`: the staff app only.
  - `private.claim_person`, `private.report_leave`: the staff app or the bot.
  - `private.bot_people`, `private.bot_candidates`: the bot's reads (and the staff app's duplicate check): names,
    stages, owners and attention reasons, never contact details. `bot_people`'s search matches a phone exactly, or
    by a run of 6 or more of its digits (2026-10-24, PLAN R82), and still returns only those.
  - `private.ingest_airtable`, with `private.airtable_link` and `private.airtable_ran` (2026-10-17): the ingest
    role's only grants ([ADR-0005](0005-airtable-intake.md)): the link admins set, encrypted, only while the sync is
    on; the records; how a run went, by its kind. The app role executes none of them, and can't select the link's
    column at all (a column grant): it may only set or clear it, as admins, under RLS.
    The bot reaches people only through these; no table policy names `bot_can`. Through the bot they answer the
    onboarding role alone (`private.may_intake`, D13).
- **Telegram links** (D13): `private.telegram_needs_onboarding`, a trigger that refuses a link code or a link for
  anyone but active staff with the onboarding role (Better Auth's role, which writes them, doesn't see the staff
  tables), and `private.unlink_telegram`, a trigger that unlinks an account and drops its unused codes when it loses
  that role or is deactivated (the app role, through which admins do both, doesn't reach `auth`). Both are
  `SECURITY DEFINER`, executable by no runtime role.
- **pg_trgm** lives in an `extensions` schema of its own: only the app role may look in it (for names' similarity).
  A trusted extension's functions belong to the bootstrap superuser, executable by PUBLIC, so the schema is what's
  closed; a catalog test keeps it so.
- **Two exceptions without an actor**, for the team group's posts (ADR-0004 §8): `private.team_card(person)` returns
  only what a post in the group shows (name, province, country since 2026-10-24, sources, stage, owner), and only for
  someone added in the last 48 hours who arrived within the settings' window (ADR-0004), or who already has a sent
  post; `private.team_unposted(chat)` returns ids. The bot posts arrivals from every source, the hourly Airtable
  sync's included, which has no person behind it.
- **Erasure** (M2 and M3, [personal data](../spec/personal-data.md)): `private.anonymise_person` and
  `private.anonymise_contact`, each `SECURITY DEFINER` to blank append-only timeline text (the owner's `app.redact`),
  each for admins through the staff app alone, checked first.
- **A team account's own person** (PLAN M5, step 5): `staff.person_id`, which admins change through the existing
  `admin_update` policy and a column grant (`UPDATE (person_id)` to the app role). The link grants nothing: no policy
  reads it. A trigger (`private.staff_person_is_live`, as the caller, not a definer) refuses a tombstone or someone
  erased. `private.staff_person_suggestions()` is `SECURITY DEFINER` to reach `auth.users`: for admins alone,
  checked first, it returns ids (an account, and the person whose email identity is the account's sign-in email),
  never the email. A merge moves the link to the survivor and refuses two linked records; erasure unlinks.
- **Outreach** (M3): its tables admit outreach staff and admins through the staff app
  (`staff_can('admin', 'outreach')`), never the bot, which has no outreach command. Onboarding staff don't see it, nor
  outreach staff onboarding's. Nothing there is reached through a definer function but erasure and the private
  records' functions below.
- **Private outreach records, "Solo yo"** (PLAN M5, step 6): a contact, an organisation, a contact's event or an
  organisation's note may be private to one staff member (`private_to`, null for the team's). The policies admit a
  private row to its own person alone: other outreach staff don't see it, admins neither, by the same rule, not a
  filter in the API. An event or a note shows only where its contact or organisation does (`EXISTS` on it, under the
  caller's policies), and a trigger (`private.inherit_privacy`, as the caller) makes what is written on a private
  record as private as it. A row is made private only for its writer, and only ever goes from private to the team:
  `private.private_rules`, after the row so the policies refuse first, as the caller, refuses a team record made
  private and a contact whose organisation the team can't see; `private.target_shared` refuses a campaign target that
  isn't a team contact. Five `SECURITY DEFINER` functions reach past the policies, each checking its caller first:
  for admins, `private.rights_contacts(query)` (a rights request's contacts, private ones too, by an exact email,
  phone or name; ids, the organisation as listed, the name and whether it's private) and
  `private.export_contact(contact)` (everything kept about one, without who on the team keeps it; recorded in
  `app.exports`), with erasure already reaching any contact by id; `private.private_records()` (a deactivated
  member's records, how many, never what) and `private.hand_over_private(departed, heir)` (to an active member in
  outreach or an admin, with `app.redact` to move append-only rows); and, for a private contact's own person,
  `private.merge_private_contact(private, team)` (into the team contact that is the same person: blanks filled, the
  private timeline moved, still private unless its person ticked "Compartir también mis notas", the private contact
  deleted, the sharing on the team's timeline). One trigger does too, `private.share_history()` (PLAN R52): as a
  private contact or organisation is shared, and only when its person ticked that box (`app.share_history`, set by
  the API for that transaction), its timeline or notes, private to that person, become the team's, with
  `app.redact` as the timelines are append-only. It runs only at that change, so a private note written later on a
  team record stays private.
- **The bot's own state** is in `private` (`telegram_updates`, `telegram_dialogs`, `telegram_posts`), outside `app`
  and its policies: only the app role reaches it, with exactly the privileges the bot uses, and a catalog test keeps
  that list. Its links and their codes are credentials, in `auth`, for the auth role alone.
- **Tests:** an RLS matrix (role × channel × table × operation) runs in CI against Postgres 18, as
  `packages/db/tests/rls` does in the earlier project, and is updated with every new table.

### 5. Rules in the database and the audit log

- The data rules are triggers, not UI checks ([data model §5](../spec/data-model.md#5-rules-in-the-database-not-the-ui)):
  append-only timelines and audit log, one person per normalised identity, timeline events written with stage
  and owner changes, an invitation decided once.
- Actor and time columns are stamped from the session (`private.stamp`), so nobody acts in someone else's name.
- **Audit log** (PLAN R2): every write to an `app` table, with its actor, channel, table, row and what changed.
  Columns commented `personal data` are never copied; an update to one is logged with the column's name only.
  Append-only (triggers refuse `UPDATE`, `DELETE`, `TRUNCATE`); admins read it. A catalog test fails when an `app`
  table lacks the audit trigger, or a column that holds personal data isn't marked.

### 6. Staff accounts and sign-in

- **Invite-only** (PLAN R3): an admin invites an email with a set of roles; accepting creates the staff row
  (`app.staff`, keyed by the Better Auth user id) and its roles. The invitation token is 256 random bits, carried
  in the link's fragment, stored only as its SHA-256.
- **The first admin** (PLAN R4): the owner's `create-account` command in an API pod prints a one-hour link to set
  the password and the owner SQL that makes the account an admin once it has enrolled TOTP. A lost authenticator
  is reset by the owner's `reset-authenticator` command.
- **Sign-in** is in [ADR-0003 §2](0003-application-stack.md#2-sign-in): password plus mandatory TOTP. A session
  without the second factor reaches only the enrolment page, and the database refuses it any data (`app.aal`).
- Deactivating a staff member closes every policy to them at once, and unlinks their Telegram account.

### 7. Public surfaces

- **The census forms app (M2)** has no sessions, no cookies and no database credentials. It posts to the API's
  public routes, which run as `public` and can only call the submit function. They are served on a port of their own
  (`FORMS_PORT`, 3003), the only one the forms app's pods are admitted to, and the staff port doesn't serve them: a
  forms pod taken over reaches neither sign-in nor the staff routes, where it could write any `X-Forwarded-For` and
  dodge the per-address limits (security review, 2026-10-16; `scripts/check-network-policies.mjs` keeps it so).
- **The Telegram webhook** ([ADR-0004](0004-telegram-bot.md)).
- Each public route is rate-limited per IP at the gateway and in the API. Forms have a honeypot field and a
  minimum fill time. No third-party captcha, so the CSP stays `'self'`.
- Personal census tokens: 32 random bytes, stored as SHA-256, 30 days, carried in the fragment.
- `/api` answers only on the staff host; a route added by mistake on another host reaches nothing.

### 8. Logs and errors

- GlitchTip through the Sentry SDKs, with the earlier project's privacy options: no cookies, headers, bodies or query
  strings; users dropped; emails redacted.
- pino redaction for phone numbers, emails and tokens. Request bodies, Telegram messages included, are never
  logged. As built: requests log their method and path only; errors their kind, code and constraint, with message and
  stack redacted and a database error's `detail` and `where` (which quote rows) dropped; every log line's own words
  are redacted too (`apps/api/src/app.ts`). An error no route caught answers `{"error":"internal"}`, never its words.
- Nothing typed in a form the page sends goes in an address (PLAN R88): every form says its method, POST for those,
  so one sent before React has hydrated the page goes as a body, not as a query string in the browser's history and
  every access log on the way (a password, a person's phone, the Airtable link). GET only for searches and filters,
  whose addresses are meant to be kept and shared. A test fails any form without one.
- OpenTelemetry instrumentation from day one, export off until the cluster has a backend.

### 9. Changing this model

A new `SECURITY DEFINER` function, a new grant to a runtime role, or a policy that admits the bot requires
updating this ADR, the RLS matrix and the catalog test's lists.

## Consequences

- **Easier:** policies are short (`staff_can('onboarding', 'admin')`); a compromised API process still can't read
  what its actor's roles don't allow, and the bot can't do what isn't opened to it.
- **Harder:** every new table needs its policies, grants, audit trigger and matrix entry (checklist in
  CONTRIBUTING.md); a second chapter needs its own Postgres server.
- **Risks accepted:** module roles let every onboarder see every person (D7). The audit log shows that a person's
  name or phone changed, not to what.
- **Revisit:** per-row access when the team grows past about 8; tenancy if chapters want one shared instance.
