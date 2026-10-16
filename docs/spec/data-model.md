# Data model

- **Status:** M0 tables drafted for M0; the onboarding and outreach columns are specified in the M1 and M3
  migrations, each reviewed by Dani line by line.
- **Relates to:** [ADR-0002](../adr/0002-authorization-and-data-protection.md) (roles, RLS, audit),
  [onboarding](onboarding.md), [outreach](outreach.md), [personal data](personal-data.md)

## 1. Schemas

PostgreSQL 18, database `pauseai_backoffice`.

| Schema    | Holds                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `app`     | Application data, under row-level security                                                            |
| `auth`    | Credentials: Better Auth's tables and the Telegram links. Only `pauseai_backoffice_auth` reaches it   |
| `private` | Helper and definer functions, and internal state the API keeps for itself (the bot's tables, from M1) |
| `public`  | Nothing but dbmate's bookkeeping                                                                      |

## 2. Conventions

- **Keys** are `uuidv7()`, except the audit log's identity column and composite keys.
- **Times** are `timestamptz`.
- **Actor and time columns** (`created_by`, `created_at`, `updated_by`, `updated_at`, `*_by`, `*_at` of an event)
  are set by the `private.stamp(...)` trigger from the session (`app.user_id`) and the transaction time. Whatever
  the caller sends is overwritten, so nobody can act in someone else's name or backdate a record.
- **When something happened** is a second, separate date (PLAN M5): `people.arrived_on` ("Llegó el", null when
  nobody knows) and `person_events.happened_on` ("Fecha", on contact attempts, notes and stage changes made by hand;
  a stage change takes it from the transaction's `app.happened_on`). Both are what someone says, never in the future
  (triggers refuse it), and shown next to the record's own `created_at` and actor, which stay as above.
- **Personal data.** Every column that holds personal data is commented `personal data`. The audit trigger never
  copies those columns into `audit_log`; an update that changes only such a column is logged with its name and no
  values. A catalog test keeps the list of such columns honest.
- **Every `app` table** has, or CI fails:
  - RLS enabled, with policies through the `private` helpers;
  - explicit grants per runtime role, and nothing to `PUBLIC`;
  - the `private.audit()` trigger, or an entry in the catalog test's exceptions with a reason;
  - an entry in `packages/db/tests/rls/matrix.ts` with the expected outcome for every role, channel and operation.
- **Closed to the bot by default.** Policies use `private.staff_can(...)`, which admits only the web channel; a
  table opened to the bot says so with `private.bot_can(...)` in a policy, on purpose
  ([ADR-0002 §4](../adr/0002-authorization-and-data-protection.md#4-row-level-security-by-module-and-channel)).
- **Enumerations** are Postgres enums; identifiers are English, UI labels Spanish.
- **Migrations** are SQL, forward-only, one concern each (dbmate). `db/schema.sql` and the Kysely types are
  regenerated with every migration.

## 3. Tables by module

Each table is listed with its purpose. The M0 tables' columns are in [§4](#4-m0-tables); the others' are
specified in the M1 and M3 migrations.

| Table                      | Holds                                                                                      | Module     |
| -------------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| `staff`                    | Staff accounts' app side: display name, linked person, active flag                         | Core       |
| `staff_roles`              | `(user_id, role)`                                                                          | Core       |
| `invitations`              | Invitations to become staff, with their roles                                              | Core       |
| `settings`                 | Thresholds, community chats list, skills and interests lists, digest time (M1)             | Core       |
| `airtable_sync`            | One row: Global's view link, encrypted and write-only; the switch; the last run (ADR-0005) | Onboarding |
| `audit_log`                | Every write: actor, channel (web or bot), table, row, what changed. Append-only            | Core       |
| `people`                   | Profile, stage, owner, next action and due date, `profile_completed_at`, anonymised flag   | Onboarding |
|                            | "Llegó el" (`arrived_on`, null: unknown) and "Llegó por" (`arrival_channel_id`), M5        |            |
|                            | `summary`: the card's one-line internal summary (≤ 200, personal data; M5, step 4)         |            |
| `arrival_channels`         | "Llegó por"'s list, edited by admins in Ajustes; `key` marks the bot's and Global's (M5)   | Onboarding |
| `identities`               | `(kind, value)` unique, `person_id`, verified, source, first seen; kinds: email, phone,    | Onboarding |
|                            | Discord username (M5), Airtable record                                                     |            |
| `person_sources`           | Each source a person came from, with date, reporter and external reference                 | Onboarding |
| `community_presence`       | `(person_id, joined_at, left_at, chat, reported_by)`                                       | Onboarding |
| `person_events`            | The timeline. Append-only; only anonymisation redacts it. `happened_on`: its day, M5       | Onboarding |
| `intake_records`           | Every imported or reported record: source, external ID, minimised payload, status, match   | Onboarding |
| `imports`                  | Each import or sync run: who, when, file hash, counts, dry-run diff                        | Onboarding |
| `census_links`             | Personal links: person, token hash, expiry, used at; the message it went in (M5)           | Onboarding |
| `message_templates`        | Mensajes: the team's WhatsApp messages by purpose, title, versions, retired (M5)           | Onboarding |
| `skills`, `interests`      | Lists edited in settings, and the people linked to them                                    | Onboarding |
| `organisations`            | Outreach organisations                                                                     | Outreach   |
| `contacts`                 | Outreach contacts, tier, relationship stage, sources, `needs_review`                       | Outreach   |
| `campaigns`                | Goal, language, sender, status, owner                                                      | Outreach   |
| `campaign_templates`       | Per tier: subject, body with merge fields, word limit, version                             | Outreach   |
| `campaign_anchors`         | Evidence paragraphs and their sources                                                      | Outreach   |
| `campaign_targets`         | Contact × campaign: status, owner, priority, dates, next action                            | Outreach   |
| `contact_events`           | The outreach timeline                                                                      | Outreach   |
| `private.telegram_updates` | Each processed `update_id`, so redeliveries are harmless; kept a week                      | Bot        |
| `private.telegram_dialogs` | A conversation in progress; deleted after an hour                                          | Bot        |
| `private.telegram_posts`   | Team-group messages per person, so a claim can edit them                                   | Bot        |
| `auth.telegram_links`      | Telegram user ID ↔ staff account, one each way, and when they were linked                  | Auth       |
| `auth.telegram_link_codes` | One-time link codes as SHA-256 hashes: ten minutes, used once                              | Auth       |
| `auth.*`                   | Better Auth's tables (users, accounts, sessions, two-factor); member tokens in M4          | Auth       |

Tables are in `app` unless their schema is named.

## 4. M0 tables

### `app.staff`

The app side of a staff account. Its key is the Better Auth user, so one person has one staff row whatever their
roles. Losing staff access (deactivation) never deletes the row, nor the person it is linked to. An admin links the
account to someone still there (never a tombstone, nor someone erased); a merge moves the link to the survivor and
refuses two linked records; erasure unlinks (PLAN M5, step 5).

| Column           | Type          | Notes                                                                |
| ---------------- | ------------- | -------------------------------------------------------------------- |
| `user_id`        | `uuid`        | Primary key; `auth.users.id`, foreign key                            |
| `display_name`   | `text`        | Not null. Personal data                                              |
| `person_id`      | `uuid`        | Null, unique. Their own person record (M5, step 5): grants nothing   |
| `active`         | `boolean`     | Not null, default true. False: no policy admits the account          |
| `created_at`     | `timestamptz` | Stamped                                                              |
| `created_by`     | `uuid`        | Stamped; null when created by accepting an invitation as the invitee |
| `deactivated_at` | `timestamptz` | Set with `active = false`, cleared on reactivation                   |
| `deactivated_by` | `uuid`        | Who deactivated it                                                   |

### `app.staff_roles`

| Column       | Type             | Notes                                                      |
| ------------ | ---------------- | ---------------------------------------------------------- |
| `user_id`    | `uuid`           | Part of the primary key; `app.staff`                       |
| `role`       | `app.staff_role` | Part of the primary key: `admin`, `onboarding`, `outreach` |
| `created_at` | `timestamptz`    | Stamped                                                    |
| `created_by` | `uuid`           | Stamped                                                    |

A role change is a delete and an insert, both audited. Roles combine.

### `app.invitations`

Staff accounts are invite-only. An admin invites an email with a set of roles; the email carries a random token
(256 bits), of which only the SHA-256 is stored.

| Column        | Type               | Notes                                                   |
| ------------- | ------------------ | ------------------------------------------------------- |
| `id`          | `uuid`             | `uuidv7()`                                              |
| `email`       | `text`             | Lowercase, checked shape. Personal data                 |
| `roles`       | `app.staff_role[]` | Not empty                                               |
| `token_hash`  | `text`             | Hex SHA-256, unique; the token itself is never stored   |
| `expires_at`  | `timestamptz`      | At most 30 days after creation; the app uses 7          |
| `created_by`  | `uuid`             | Stamped                                                 |
| `created_at`  | `timestamptz`      | Stamped                                                 |
| `accepted_at` | `timestamptz`      | With `accepted_by`, set once by acceptance              |
| `accepted_by` | `uuid`             | The account that accepted it                            |
| `revoked_at`  | `timestamptz`      | Set once by revoking; never together with `accepted_at` |

- A pending invitation changes once: it is revoked, or accepted before it expires. A decided one never changes
  again (trigger).
- **Lookup** goes through `private.pending_invitation(token_hash)`: the email and roles of a pending, unexpired
  invitation, and nothing for any other token.
- **Acceptance** goes through `private.accept_invitation(token_hash)` (`SECURITY DEFINER`): only if the signed-in
  account's verified email is the invited one, it creates `app.staff` (display name from the account), adds the
  roles, and marks the invitation accepted.
- Admins delete invitations that are no longer pending, so an email is kept only while it is needed; the audit log
  keeps the invitation's id, never its email.

### `app.audit_log`

| Column       | Type          | Notes                                                                                               |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| `id`         | `bigint`      | Identity                                                                                            |
| `actor_id`   | `uuid`        | From the session; null for the owner and jobs without an actor                                      |
| `channel`    | `text`        | `web`, `bot`, or null for the owner and jobs                                                        |
| `action`     | `text`        | `insert`, `update`, `delete`                                                                        |
| `table_name` | `text`        |                                                                                                     |
| `row_id`     | `text`        | The primary key, or a JSON object when it is composite                                              |
| `diff`       | `jsonb`       | `{"new": row}`, `{"old": changed, "new": changed}` or `{"old": row}`, without personal-data columns |
| `at`         | `timestamptz` | Transaction time                                                                                    |

Append-only: triggers refuse `UPDATE`, `DELETE` and `TRUNCATE`. Admins read it; nobody writes it but the audit
trigger.

### `auth` schema

Better Auth's tables: `users`, `sessions` (with `aal`), `accounts`, `verifications`, `two_factors`,
`rate_limits`. Only `pauseai_backoffice_auth` reaches them. They have no audit trigger, so none of their personal
data is copied elsewhere.

- `sessions.aal` is 2 only for a session that a TOTP or backup code created; every other session stays 1 for life.
- A trigger refuses an aal2 session for an account without a second factor.
- Expired sessions, verification values and day-old rate-limit rows are deleted daily (the session clean-up job).

### Bot tables (M1)

Migration `telegram` ([ADR-0004](../adr/0004-telegram-bot.md)):

- **`auth.telegram_links`:** `user_id` (primary key, the Better Auth account, deleted with it), `telegram_user_id`
  (unique; personal data), `linked_at`. The auth role selects, inserts and deletes: a link is replaced, never
  edited. Deleted when the staff member is deactivated, their password is reset, or the owner resets their
  authenticator.
- **`auth.telegram_link_codes`:** `code_hash` (hex SHA-256 of the code; the code itself is never stored), `user_id`,
  `created_at`, `expires_at` (at most ten minutes later, checked), `used_at` (the only column the auth role may
  update). Spent codes are deleted daily with the session clean-up.
- **`private.telegram_updates`:** `update_id` (primary key), `received_at`. Deleted after a week (dialog clean-up).
- **`private.telegram_dialogs`:** `telegram_user_id` (primary key), `user_id`, `state` (what the bot read so far,
  which may hold a phone or email: personal data), `expires_at` (an hour after its last step). Deleted hourly once
  expired.
- **`private.telegram_posts`:** (`person_id`, `chat_id`) primary key, `message_id` (empty while the post is being
  sent: the row is the claim to send it), `posted_at`.

The `private` tables have no RLS and no audit trigger: nothing but the app role reaches them, with exactly the
privileges the bot uses (a catalog test lists them), and they hold the bot's working state, not records.

## 5. Rules in the database, not the UI

- Timelines and the audit log are append-only (triggers refuse `UPDATE` and `DELETE`; only the anonymisation
  function redacts).
- A normalised identity belongs to one person (unique index).
- Stage changes and assignments write their timeline event in the same transaction (trigger).
- The audit trigger is attached to every `app` table; a catalog test fails when a new table lacks it.
- What the bot may write is limited in the database
  ([ADR-0002 §4](../adr/0002-authorization-and-data-protection.md#4-row-level-security-by-module-and-channel),
  [ADR-0004](../adr/0004-telegram-bot.md)).
- A person's `full_name` may be missing (NULL, never blank) only for someone the bot or quick-add saved with a phone
  or an email (PLAN R37); Airtable, the CSV import and the census always name them. A later report or a merge fills
  it, it is never matched on, and once known it is never emptied (`person_rules`).
- An invitation is decided once, and accepted only by the invited, verified email.
- An aal2 session exists only for an account with a second factor.
