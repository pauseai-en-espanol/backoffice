# ADR-0003: Application stack

- **Status:** Accepted (Dani, 2026-10-15: the same technology stack as an earlier project of his, and "security and
  quality wise feel free to reassess"; D6 is Claude's recommendation, taken unless Dani objects). **Amended
  2026-10-30** (Dani, D22: signing in again "very often" bothered him): optional passkeys, and sessions that last
  while used, up to a week; and (D23, "ok go for it") the riskiest actions want a second factor of the last 12 hours
  (§2).
- **Date:** 2026-10-15; amended 2026-10-30
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G5, G6; [ADR-0001](0001-hosting-and-delivery.md),
  [ADR-0002](0002-authorization-and-data-protection.md)

## Context

- Dani asked for the stack of an earlier project of his (below, the earlier project: a multi-tenant public site with
  a staff admin, in production), with security and quality reassessed for this app.
- G6: Claude Code extends the app, so it should follow conventions Claude already works in.
- The app differs from the earlier project: one organisation, nothing published, a handful of staff users, personal
  data rather than public content, and a Telegram bot as a second channel.

## Options considered

1. **Stack.** (a) **The earlier project's**, copied and reassessed. (b) Something lighter (a single Next.js app with
   server actions and direct database access): fewer moving parts, but it would lose the API as the only database
   accessor, which the security model depends on.
2. **UI language (D6).** (a) English source with mandatory Spanish, as the earlier project. (b) **Spanish only**,
   strings still in message files, so a locale can be added later as a file.
3. **Sharing code with the earlier project.** (a) Shared packages. (b) **Copied**, so the repos evolve separately.

Taken: 1a, 2b (D6), 3b.

## Decision

### 1. What changes from the earlier project

| Area            | The earlier project                                                                                     | Backoffice                                            | Why                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Toolchain       | Node 26, pnpm 12, Turbo, TS 7, oxlint, Prettier, Vitest, Playwright, Changesets, Renovate (3-day delay) | **Same**                                              | One way of working across repos                         |
| Frontend        | Next.js 16, Panda CSS, Ark UI                                                                           | **Same**                                              | Known; accessible components                            |
| API and data    | Fastify, Kysely, dbmate, Postgres 18, `withActor`                                                       | **Same**                                              | The security model depends on it                        |
| Auth            | Better Auth, mandatory TOTP                                                                             | **Same**; passkeys later (PLAN R6)                    | Host is final from day one                              |
| Tenancy         | Multi-tenant, RLS on `tenant_id`                                                                        | **Single organisation** (D5)                          | One operator; a second chapter can run its own instance |
| RLS             | By tenant and membership role                                                                           | By module role and channel                            | No tenancy; the bot is a narrower channel               |
| Tools channel   | Member tokens for an MCP server (ADR-0008)                                                              | The Telegram bot, limited the same way; tokens later  | Volunteers report from their phones                     |
| Public site     | Separate Next app, cache, two replicas                                                                  | Census form app, one replica                          | A few submissions a day                                 |
| Background work | Worker Deployment fed over HTTP                                                                         | **Kubernetes CronJobs** from the API image            | Only short periodic jobs; one less long-running pod     |
| Editorial rules | Four-eyes, immutable snapshots, change control                                                          | Dropped                                               | Nothing is published                                    |
| UI language     | English source, Spanish mandatory                                                                       | **Spanish only**, strings still in message files (D6) | Internal tool; a locale can be added later as a file    |
| Replicas        | Two for web and API                                                                                     | One each                                              | Internal tool; a short restart is acceptable            |

The Telegram bot follows another project's: Fastify routes in `apps/api`, a small hand-written Bot API client (no
bot framework), updates by webhook ([ADR-0004](0004-telegram-bot.md)).

### 2. Sign-in

As the earlier project:

- Better Auth, mounted in the API, with password plus **mandatory TOTP** and backup codes.
- Invite-only; no sign-up ([ADR-0002 §6](0002-authorization-and-data-protection.md#6-staff-accounts-and-sign-in)).
- Sessions are stored in Postgres and are revocable. **Since D22 (2026-10-30)** each ends 48 hours after it was last
  used, and a week after sign-in whatever happens (before: 12 hours, never extended; PLAN R12): the API moves its end
  on as it is used, and the database refuses an end past the week. No "remember me", no "trust this device".
- **Passkeys, optional (D22; PLAN R6 deferred them).** An enrolled staff member adds them in Ajustes and then signs
  in with one alone: the device holds the key and must check who holds it (fingerprint, face or PIN; WebAuthn's
  user verification, required at both ceremonies), so its session is aal2. TOTP stays mandatory and the way back in:
  only an account with it can have a passkey (a database trigger), and the owner's reset of a lost authenticator
  removes the passkeys too. Adding one is among the riskiest actions (below); removing one needs a session that passed
  a second factor. Passkeys are discoverable, bound to the staff host, and kept wherever the person's device keeps
  them (a platform's or a password manager's store, which may sync them).
- **Confirming it's you again (D23).** A session lasts up to a week, but the riskiest actions want a second factor of
  the last 12 hours, as every session had before D22: erasure, exports, the rights lookup, Equipo's changes, what
  admins change in Ajustes, the audit log, and adding a passkey. The API marks those routes (`RECENT_SECOND_FACTOR`) and
  answers 403 `stepUp` otherwise; the page goes to "Confirma que eres tú" and comes back. A code from the app counts
  for the session that typed it (`auth.session_step_ups`; Better Auth's own check of a signed-in session's code
  counts no wrong ones, so the API takes an attempt before each check and ends the session at the fifth, and no
  longer lets a signed-in session check codes through Better Auth at all); a passkey signs in afresh. Only a session
  that passed a second factor can confirm (a trigger).
- Attempts are rate-limited, counted in the database.
- A session without the second factor reaches only the enrolment page, and the database refuses it any data
  (`app.aal`).
- Password recovery by email ("He olvidado mi contraseña"), only for accounts with a second factor, one link per
  15 minutes (PLAN R7).
- Cookies are host-only (`__Host-`), `Secure`, `HttpOnly`, `SameSite=Lax`. The API passes on only the Better Auth
  endpoints and body fields the app uses; every other endpoint answers 404.
- **Passkeys** were allowed from M0 as an extra, because the staff host is final from day one; deferred until after
  M1 (PLAN R6), they came with D22.

### 3. Interface language (D6)

Spanish only. Strings live in `packages/i18n` message files, read through `use-intl` (the library under
next-intl), as the earlier project reads them, so the web app, the bot's replies and the API's emails share one catalog.
A locale can be added later as a file. Identifiers in code and the database are English.

### 4. Observability

- GlitchTip through the Sentry SDKs, with the earlier project's privacy options (`packages/observability`): no cookies,
  headers, bodies or query strings; users dropped; emails redacted. Browser errors go through a relay on the
  app's own host, so the browser never sees the DSN.
- pino redaction for phone numbers, emails and tokens; request bodies, Telegram messages included, are never
  logged.
- OpenTelemetry instrumentation from day one, export off until the cluster has a backend.

### 5. Repository layout

```text
apps/web                Next.js staff UI
apps/api                Fastify API and Telegram webhook; CronJob entrypoints under src/jobs/
apps/forms              Next.js public census form (M2)
packages/db             Kysely factory, generated types, withActor, pools
packages/domain         Pure logic: normalisation, matching, stage and attention rules, bot message parsing, templates
packages/ui             Panda preset, Ark components
packages/i18n           Spanish messages (web and bot)
packages/observability  Sentry privacy options, error relay
packages/mcp            MCP server: not built (D10, not now)
db/migrations           dbmate SQL, forward-only; db/schema.sql generated
helm-charts/backoffice  Umbrella chart: one subchart per deployable, migration Job, CronJobs
e2e                     Playwright against production builds, with a fake Bot API
docs                    BRIEF, PLAN, adr/, spec/, runbooks/
```

Rules, as the earlier project's `CLAUDE.md`:

- Only `apps/api` imports `packages/db` (lint rule).
- Migrations are SQL only, forward-only, one concern each.
- Tests sit next to the code. Every new invariant or policy gets its test first.
- Seeds and fixtures are obviously fictional. No real member, export, contact or Airtable link is ever committed.

### 6. Copied, not shared

The scaffold is **copied** from the earlier project (configs, CI workflows, chart layout, `withActor`, Better Auth
wiring, observability package, seal scripts) and the bot from another project's (webhook route, Bot API client),
not shared as dependencies. The repos then evolve separately.

### 7. Quality

- **Static checks:** TypeScript strict, no `any`; oxlint type-aware with zero warnings; Prettier; markdownlint at
  120 columns.
- **Tests:**
  - Unit tests for `packages/domain`, especially bot message parsing, matching and attention rules, with
    fictional fixtures.
  - Database tests for RLS, the bot channel's limits, triggers and grants, on Postgres 18.
  - Playwright for the main flows: sign-in with TOTP, linking Telegram, `/joined` (`/alta`) through a fake Bot API,
    claim from the team group, quick-add, CSV import, log attempt, census submission, merge. axe on every page.
- **Accessibility:** WCAG 2.2 AA. Stages are never shown by colour alone.
- **Dependencies:** latest stable only, checked on npm when added. Renovate with the 3-day minimum release age.
- **Process:** `pnpm verify` before push; a changeset per change; the RLS matrix updated with every new table.

## Consequences

- **Easier:** Claude and Dani already know every piece; the earlier project's tested patterns (sign-in, `withActor`,
  the RLS matrix, the release flow) come over with their tests.
- **Harder:** two repos to keep current with the same tools; a fix found in one is copied to the other by hand.
- **Revisit:** shared packages if a third app copies the same scaffold; English if a non-Spanish speaker joins the
  staff.
