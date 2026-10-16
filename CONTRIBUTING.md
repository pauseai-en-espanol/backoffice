# Contributing

Please read [CLAUDE.md](CLAUDE.md) for the non-negotiables. This file covers the workflow and the checklists.

## Workflow

1. Use Node from `.nvmrc` and pnpm 12, then run `pnpm install`.
2. Start the local database and apply the migrations:

   ```sh
   cp .env.example .env
   pnpm db:up && pnpm db:migrate
   ```

   Postgres 18 runs in Docker on port 5434 (`BACKOFFICE_PG_PORT` to change it), with the same roles as the cluster:
   the owner, which runs migrations, and four runtime roles that own nothing and can't bypass row-level security
   (`db/local/init.sh`). The test database, `pauseai_backoffice_test`, needs nothing: `pnpm test:db` rebuilds it
   from the migrations on every run.

3. Before committing, all of these must pass:

   ```sh
   pnpm lint          # oxlint (type-aware) + markdownlint
   pnpm test
   pnpm build:check
   ```

   Before pushing, `pnpm verify` runs every check CI runs, cheapest first, and stops at the first failure (it needs
   the local database, and Helm for the charts). A change to a rule (a migration, a policy, a check in the API) also
   gets a mutation check: add each way to break it to a list in `scripts/mutations/` and run
   `pnpm test:mutation <list>`, which applies them one at a time and expects a test to fail for each. It is manual,
   never in a hook. `scripts/watch-release.sh` then follows a pushed commit to production (set `WATCH_URLS` in
   `.env`).

4. Add a changeset for any change that affects a package (`pnpm release:note`). Use `pnpm release:empty` for docs or
   CI-only changes. The pre-push hook and CI check for one, and that every deployable whose code changed is released:
   a migration needs `@backoffice/migrations` in the changeset, or its image isn't rebuilt. A change to root files
   (the lockfile, `turbo.json`) needs every deployable.
5. Keep history flat: rebase on `main`, never merge it in. Keep each commit to one topic, and say in it what you ran
   and what it showed. Nothing is pushed without Dani asking.

**Starting again from an empty local database.** This deletes only local, fictional data:

```sh
docker compose down -v   # stop Postgres and delete its volume
pnpm db:up && pnpm db:migrate
```

The roles are created only with a new volume (`db/local/init.sh`). When a runtime role is added there, start again as
above, or add it to the running database by hand with the same `CREATE ROLE` and `GRANT CONNECT`.

## Personal data rules

- **Never commit personal data:** no member, contact, export, CSV, census answer, Airtable record or screenshot of
  one. `.gitignore` refuses `*.csv`, `*.jsonl` and `*.xlsx` outside test fixtures; that is a backstop, not a
  permission.
- **The link to Global's shared Airtable view is a credential.** Admins paste it in Ajustes; the API stores it
  encrypted with the deployment's key (`AIRTABLE_LINK_KEY`, sealed in gitops by `scripts/seal-airtable-key.sh`) and
  never shows it again (ADR-0005). Never commit, log, print or paste it anywhere else. To try the sync locally, set
  `AIRTABLE_LINK_KEY` (`openssl rand -base64 32`) and `INGEST_DATABASE_URL` in your own `.env`, which is never
  committed, and paste the link in your local Ajustes.
- **Fixtures and seeds are obviously fictional:** "Persona de ejemplo", `@ejemplo.test`, phone numbers from the
  ranges reserved for fiction.

## Public repository rules

- **Nothing about the infrastructure** (CLAUDE.md): no hosts, cluster or context names, provider, in-cluster
  services, gateways, runners, other projects, or the gitops repository's identity or layout. Cluster settings live
  in the gitops checkout's `backoffice-deploy.env` (`scripts/deploy-settings.example.env` lists them, with fictional
  values); CI's runner labels in the repository variable `SELF_HOSTED_RUNS_ON`.

## Database rules

- Migrations are plain SQL in `db/migrations/`, run by dbmate. They are **forward-only**: never edit a migration that
  has been merged (CI checks), and keep one concern per migration.
- Migrations run before the new pods roll out, so the old code runs against the new schema for a while. Make each one
  **expand/contract**: add what the new code needs, and drop or rename what the old code uses only in a later release.
- After every migration, regenerate `db/schema.sql` (`pnpm db:migrate` does) and the Kysely types (`pnpm db:types`),
  and commit both. Review the `db/schema.sql` diff: it shows exactly how policies and grants changed.
- Only `apps/api` talks to Postgres, through `packages/db`. Staff and bot queries go through `withActor`.

### New table checklist

Every new table in `app` needs all of these, or the database tests fail (see
[ADR-0002](docs/adr/0002-authorization-and-data-protection.md) and the [data model spec](docs/spec/data-model.md)):

1. **RLS enabled, with policies `TO pauseai_backoffice_app` through `private.staff_can(...)`**, naming the module's
   roles (`onboarding` or `outreach`, plus `admin`). A policy that doesn't call `staff_can` or `bot_can`, or that
   applies to `PUBLIC`, fails the catalog test.
2. **Closed to the bot unless decided otherwise** ([ADR-0004](docs/adr/0004-telegram-bot.md)). A policy that also
   admits `private.bot_can(...)` is a decision: list it in `BOT_POLICIES` (`packages/db/tests/allowlists.ts`), update
   ADR-0004 and ADR-0002, and give the bot only what its commands need.
3. **Explicit grants** to `pauseai_backoffice_app`, column by column where only some columns may be written, and
   nothing to `PUBLIC`. Never `TRUNCATE`, `REFERENCES`, `TRIGGER` or `MAINTAIN`. `pauseai_backoffice_auth` gets
   nothing outside `auth`; `ingest` and `public` only what their milestone's ADR says.
4. **A `private.stamp(...)` trigger** for its actor columns (`*_by`, `actor_id`) and event timestamps (`*_at`), so
   nobody writes in someone else's name or backdates anything. Columns set on a later transition belong to that
   transition's trigger.
5. **The `private.audit()` trigger** (`AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`), or an entry in the catalog
   test's `NOT_AUDITED`, with a reason.
6. **Personal data?** Comment each such column `personal data`: the audit trigger never copies those, and the catalog
   test's `PERSONAL_DATA` list must name them. Define its retention in the personal data spec.
7. **History?** If its rows must never change (a timeline), add `UPDATE`/`DELETE`/`TRUNCATE` triggers using
   `private.forbid_mutation()`, and add it to the catalog test's `APPEND_ONLY`.
8. **An entry in `packages/db/tests/rls/matrix.ts`** with fixture rows, the operations tried on them and who may do
   each, by role and channel; plus data-rule tests for any new trigger, and mutations in `scripts/mutations/`.
9. **Docs:** update the data model spec, and regenerate `db/schema.sql` and the Kysely types.

New `SECURITY DEFINER` functions, or new grants to a runtime role, also require updating ADR-0002 and the catalog
test's allowlists (`packages/db/tests/allowlists.ts`). A definer function pins `search_path = ''`, names every
relation with its schema, and checks the channel itself.

## Licence

There is no licence file yet (PLAN R8): whether this repository is public, and under which licence, is Dani's call.
