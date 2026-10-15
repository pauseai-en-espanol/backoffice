# ADR-0002: Authorization and data protection

- **Status:** Accepted for M0 (Claude's recommendations D5 and D7, taken unless Dani objects; PLAN R1–R5, R13 to
  review)
- **Date:** 2026-10-15
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G5, §3, §5; [ADR-0001](0001-hosting-and-delivery.md),
  [ADR-0003](0003-application-stack.md), [ADR-0004](0004-telegram-bot.md); [data model](../spec/data-model.md),
  [personal data](../spec/personal-data.md); aiontheballot ADR-0002 and ADR-0008

## Context

- **What is at stake** (BRIEF §5, in priority order): members' personal data, which reveals who supports an
  AI-pause organisation; staff accounts, each of which opens it; linked Telegram accounts, the bot token and the
  webhook secret; the Airtable shared view link; outreach notes.
- **Who uses it:** a handful of volunteers with three roles (`admin`, `onboarding`, `outreach`) that combine, on a
  public host (D4), from their phones, plus a Telegram bot acting for them (ADR-0004).
- **What aiontheballot already proved:** least privilege enforced in Postgres (non-owner runtime roles, RLS,
  explicit grants, closed by default), the actor set per transaction by `withActor`, the second factor checked in
  the database (`app.aal`), and a narrower channel for tools (its ADR-0008, `private.needs_a_person`). Its tenancy
  (`tenant_id` everywhere) and editorial rules (four-eyes, immutable snapshots) don't apply here.

## Options considered

1. **Tenancy (D5).**
   - (a) Tenant-ready from day one: `tenant_id`, composite keys and tenant policies on every table, as
     aiontheballot. Every table and test pays for a second chapter that may never come.
   - (b) **Single organisation.** Another chapter runs its own instance, on its own Postgres server.
2. **Access granularity (D7).**
   - (a) Per row: "a volunteer sees only the people assigned to them". Safer in principle, but onboarding is a
     shared queue: claiming, picking up someone else's person and the unassigned list all need to see more.
   - (b) **Module roles** for v1: onboarding tables need `onboarding` or `admin`, outreach tables `outreach` or
     `admin`. Revisit when the team grows past about 8.
3. **How the bot is limited.**
   - (a) In the API only: a list of routes the bot may call.
   - (b) **In the database too**, as aiontheballot ADR-0008 does for tokens: a channel setting the policies read, so
     a new table is closed to the bot until opened on purpose.
4. **What the audit log keeps.**
   - (a) Each write's row before and after, personal data included (the specification's first draft).
   - (b) **What changed, without personal data**, as aiontheballot: columns commented `personal data` are never
     copied. Erasure then never has to rewrite the log, and an admin reading the log doesn't see members' data.

Recommended and taken unless Dani objects: 1b, 2b, 3b, 4b (PLAN R2, R5).

## Decision

### 1. Single organisation (D5)

One operator, PauseAI España. No `tenant_id`. Another chapter runs its own instance on its own Postgres server.

**Names are fixed in the migrations** (PLAN R13): the database is `pauseai_backoffice` and the roles are
`pauseai_backoffice_*`, written into every `GRANT` and `POLICY`, as aiontheballot does. dbmate has no variables,
and building every grant and policy with dynamic SQL would make the security review harder. So another chapter's
instance needs its own Postgres server (role names are global to a server), or a renaming migration. The product
name and hostnames still come from config.

### 2. Database roles

| Role (prefix `pauseai_backoffice_`) | Used by                                               | May                                                                      |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `owner`                             | The migration Job only                                | Own the schemas. Never used at run time                                  |
| `app`                               | The API's staff and bot routes, via `withActor`       | Read and write `app` under RLS                                           |
| `auth`                              | Better Auth and the Telegram links, in the API        | Only the `auth` schema                                                   |
| `ingest`                            | The Airtable sync (CronJob, and on demand in the API) | Insert intake records and import runs; execute the matcher; nothing else |
| `public`                            | The API's census form routes                          | Execute `private.submit_census`; no table grants                         |

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
- **Tests:** an RLS matrix (role × channel × table × operation) runs in CI against Postgres 18, as
  `packages/db/tests/rls` does in aiontheballot, and is updated with every new table.

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
  public routes, which run as `public` and can only call the submit function.
- **The Telegram webhook** ([ADR-0004](0004-telegram-bot.md)).
- Each public route is rate-limited per IP at the gateway and in the API. Forms have a honeypot field and a
  minimum fill time. No third-party captcha, so the CSP stays `'self'`.
- Personal census tokens: 32 random bytes, stored as SHA-256, 30 days, carried in the fragment.
- `/api` answers only on the staff host; a route added by mistake on another host reaches nothing.

### 8. Logs and errors

- GlitchTip through the Sentry SDKs, with aiontheballot's privacy options: no cookies, headers, bodies or query
  strings; users dropped; emails redacted.
- pino redaction for phone numbers, emails and tokens. Request bodies, Telegram messages included, are never
  logged.
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
