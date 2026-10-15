# CLAUDE.md

PauseAI España's backoffice: the onboarding and outreach pipelines, for a single organisation, in Spanish.

- Scope and constraints: `docs/BRIEF.md` (source of truth)
- Decisions: `docs/adr/` (0001 hosting, 0002 authorization and data protection, 0003 stack, 0004 Telegram bot,
  0005 Airtable intake)
- Milestones, decisions taken and open: `docs/PLAN.md` · Specs (onboarding, outreach, data model, personal data):
  `docs/spec/`
- Operations: `docs/runbooks/` (first admin, lost authenticator, deploying)
- Turborepo's own guidance for agents: `AGENTS.md`

## Non-negotiables

- **No personal data in the repository, ever:** no member, contact, export, CSV, census answer or Airtable record.
  Fixtures and seeds are obviously fictional ("Persona de ejemplo", `@ejemplo.test`).
- **The link to Global's shared Airtable view is a credential** (ADR-0005). It lives only in its sealed secret in
  gitops. Never commit, log, print, paste or show it, not even in a test or an error message.
- **No hardcoded names or hosts.** The product name and hostnames come from config. Only the database and role names
  are fixed in the migrations (PLAN R13).
- **Access lives in Postgres (ADR-0002).** Every new `app` table needs RLS through `private.staff_can` (and
  `private.bot_can` only on purpose), explicit grants, the audit trigger, stamps, `personal data` comments and an
  entry in `packages/db/tests/rls/matrix.ts` (checklist in CONTRIBUTING.md).
- **Database roles:** runtime roles never own anything, and every staff or bot query goes through `withActor`. A new
  `SECURITY DEFINER` function, a new grant to a runtime role, or a policy that admits the bot requires an ADR-0002
  update and the catalog test's lists.
- **The bot is closed by default** (ADR-0004): it may do only what a policy opens to `bot_can`, and it never shows
  or keeps contact details.
- **Nothing sends on its own:** no WhatsApp message and no outreach email leaves without a person pressing send
  (BRIEF, non-goals).
- **Accessibility:** WCAG 2.2 AA; stages and states are never shown by colour alone.
- **Git:** commits are allowed; keep history flat (rebase, never merge commits). Never push, to this repository or
  gitops, without being asked: pushing `main` releases to Harbor, and pushing gitops deploys.

## Layout

- `apps/web`: Next.js staff UI (Spanish), no database access · `apps/api`: Fastify API, Better Auth, the Telegram
  webhook (M1) and the jobs' entry points (`src/jobs/`); the only code that touches Postgres
- `packages/db`: Kysely, generated types, `withActor`, pools, database tests · `packages/domain`: pure logic (M1)
- `packages/ui`: Panda preset · `packages/i18n`: Spanish messages · `packages/observability`: Sentry privacy options
- `db/migrations/*.sql` (dbmate) and `db/schema.sql` (generated dump, review it in every change)
- `helm-charts/backoffice`: the umbrella chart; each deployable's subchart in its own `helm-chart/`

## Commands

Copy `.env.example` to `.env` for local database URLs.

| Command                                                     | What it does                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm install` · `pnpm dev` · `pnpm build`                  | Install, run locally, build                                              |
| `pnpm lint` · `pnpm format`                                 | oxlint (type-aware) and markdownlint · Prettier                          |
| `pnpm build:check`                                          | Type check                                                               |
| `pnpm test`                                                 | Unit tests (Vitest)                                                      |
| `pnpm test:db`                                              | Access matrix, catalog meta-tests and data rules (local Postgres 18)     |
| `pnpm test:e2e`                                             | Playwright, against production builds                                    |
| `pnpm verify` · `pnpm test:mutation <list>`                 | Every pre-push check in order · break each rule of a list, expect a fail |
| `pnpm db:up` · `pnpm db:down`                               | Start or stop local Postgres 18 on port 5434 (Docker, roles as in prod)  |
| `pnpm db:migrate` · `pnpm db:new <name>` · `pnpm db:status` | Apply migrations (refreshes `db/schema.sql`) · new migration · status    |
| `pnpm db:types`                                             | Regenerate the Kysely types from the local database                      |
| `pnpm release:note`                                         | Add a changeset (pre-push and CI require one)                            |

## Conventions

- **TypeScript:** version 7, strict, via `@slango.configs/*`. ESM. No `any`.
- **Dependencies:** latest stable only (no alpha, beta, rc or canary), checked on npm when added; pnpm and Renovate
  wait 3 days after a release.
- **Migrations:** SQL only, forward-only (never edit one once merged), one concern each, expand/contract.
- **Tests:** next to the code as `*.spec.ts`; database tests in `packages/db/tests`. Every new invariant or policy
  gets its test first, and a mutation in `scripts/mutations/` for each way to break it.
- **i18n:** every UI, email and bot string in `packages/i18n` (Spanish only, D6).
- **Deployment (ADR-0001):** Helm chart in `helm-charts/backoffice`, deployed by Argo CD on `danilupion-com`. Never
  tag images `:latest`. Every pod sets resource requests and limits and a restrictive securityContext.
- **Docs:** Markdown lines under 120 characters. Any change to the stack or the security model needs an ADR (copy
  `docs/adr/0000-template.md`).
- **Milestones:** each one ends with green CI and a short demo note in `docs/PLAN.md` (Tracking).
