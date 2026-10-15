# ADR-0001: Hosting and delivery

- **Status:** Accepted (Dani, 2026-10-15: self-host on `danilupion-com`; D4, the staff UI on `gateway-public` with
  mandatory two-factor)
- **Date:** 2026-10-15
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) §4; [ADR-0002](0002-authorization-and-data-protection.md),
  [ADR-0003](0003-application-stack.md); aiontheballot ADR-0001; gitops `docs/app-onboarding.md`

## Context

- **What the owner decided:** self-host on the GitOps-managed cluster `danilupion-com` (one node, Hetzner, EU),
  through `danilupion/gitops`, as aiontheballot and aisafety-newsroom already are.
- **What the cluster offers** (from the gitops repo): Argo CD ApplicationSets, SealedSecrets, Harbor
  (`harbor.danilupion.com`), Envoy Gateway (`gateway-public`, with its rate-limit service already running),
  cert-manager, a shared Postgres 18 instance provisioned by the halyard `postgresql` chart (`extraRoles`), Mailu,
  and GlitchTip.
- **What the app needs to run:**
  - a staff UI and an API, used by a handful of volunteers;
  - a Telegram webhook reachable from the internet (M1);
  - a public census form (M2), a few submissions a day;
  - short periodic jobs: session clean-up, the Airtable sync, the daily digest, dialog clean-up, retention.
- **Backups** are Dani's, in gitops (`docs/backup-policy-plan.md`), separately from this ADR.

## Options considered

1. **Background work.**
   - (a) A worker Deployment fed over HTTP, as aiontheballot's extraction worker (its ADR-0006). A long-running
     pod for work that is only periodic and short; one more thing to keep alive and to secure.
   - (b) **Kubernetes CronJobs** run from the API's image, each with only its own role's credentials. Nothing
     runs between runs; Kubernetes handles schedules, missed runs and overlap (`concurrencyPolicy: Forbid`).
     On-demand runs (the Airtable sync from the bot or the web) happen in the API, behind a Postgres advisory lock
     so they never overlap a scheduled run.
2. **Replicas.**
   - (a) Two for web and API, as aiontheballot, whose public site must survive traffic spikes.
   - (b) **One each.** An internal tool for a handful of volunteers: a short restart during a rollout is
     acceptable, and in-process state (rate-limit windows) stays simple. Raising it later is a values change.
3. **Environments.** (a) Staging and production. (b) **Production only**, with a fictional demo dataset locally
   (`pnpm db:seed`), as aiontheballot.
4. **Staff UI exposure (D4).** (a) Behind a VPN or the private gateway. (b) **On `gateway-public` with mandatory
   two-factor**, so volunteers reach it from their phones without a VPN.

Dani chose 4b (D4). The rest are Claude's recommendations, taken as decided unless Dani objects: 1b, 2b, 3b.

## Decision

### 1. Deployables

| Deployable           | What                                                                          | Host                                        | Database                      |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `apps/web`           | Next.js staff UI                                                              | `backoffice.pauseai.es`                     | None; calls the API           |
| `apps/api`           | Fastify: all data access, Better Auth, staff, bot, public and internal routes | Same host, `/api/*` and `/telegram/webhook` | `app`, `auth`, `public` roles |
| CronJobs (API image) | Airtable sync, digest, session and dialog cleanup, retention                  | —                                           | `ingest`, `app`, `auth`       |
| `apps/forms` (M2)    | Next.js public census form                                                    | `unete.pauseai.es`                          | None; calls the API           |
| Migration Job        | dbmate, as `owner`                                                            | —                                           | `owner`                       |

Hostnames are configuration, not code (D4). The roles are in
[ADR-0002 §2](0002-authorization-and-data-protection.md#2-database-roles).

### 2. Jobs

Kubernetes CronJobs with `timeZone: Europe/Madrid`, `concurrencyPolicy: Forbid`, each with its own role's
credentials only:

| Job                      | Schedule                            | Role                            | Milestone              |
| ------------------------ | ----------------------------------- | ------------------------------- | ---------------------- |
| Session and link cleanup | Daily 03:00                         | `auth`                          | M0                     |
| Airtable sync            | Hourly (and on demand from the API) | `ingest`                        | M1, if the spike works |
| Daily digest             | Daily 09:00                         | `app` (system actor, read-only) | M1                     |
| Dialog cleanup           | Hourly                              | `app` (system actor)            | M1                     |
| Retention                | Daily 04:00                         | `app` (system actor)            | M4                     |

### 3. Gitops entries

Following gitops `docs/app-onboarding.md` and aiontheballot ADR-0001:

- `catalog/apps/backoffice/applicationset.yaml`, `clusters/danilupion-com/values/apps/backoffice.yaml`,
  SealedSecrets under `clusters/danilupion-com/resources/apps/backoffice/`, the repo and namespace in
  `projects/apps.yaml`.
- **Database:** a `pauseai_backoffice` database on the shared `postgresql` instance, its owner and the runtime
  roles through the halyard chart's `extraRoles`. All five roles are created from the start (PLAN R1).

### 4. Images and CI

- **Images:** Harbor project `backoffice`, tags `harbor.danilupion.com/backoffice/<component>:<version>.<sha>`,
  never `:latest`; base images pinned by digest.
- **CI:** pull requests on GitHub-hosted runners; `main` and releases on the `pauseai-en-espanol` self-hosted
  runner, which alone pushes to Harbor. Actions pinned by SHA. No `pull_request_target`. CI holds no cluster
  credentials.
- **Release:** as aiontheballot: after CI passes on `main`, Changesets bumps versions; every deployable whose
  version is ahead of the umbrella chart's tag is built, pushed and written into the chart, and Argo CD deploys it.

### 5. Sync order and pods

- **Sync order:** Secrets and the ServiceAccount patch (wave -2), the migration Job (Sync hook, wave -1), the rest.
- **Pods:** requests and limits, a restrictive securityContext (non-root, read-only root filesystem, no
  capabilities, `RuntimeDefault` seccomp), no service-account token, `/healthz` probes.
- **NetworkPolicies:** web and forms accept only the gateway. The API accepts the gateway, the web and forms pods
  and the CronJobs, and reaches Postgres, GlitchTip, Mailu, DNS, and the internet on 443 for Telegram and Airtable.

### 6. Routes and mail

- **Routes:** `gateway-public` for the staff and forms hosts (D4); per-IP rate limits on the auth, form and webhook
  routes through Envoy Gateway's rate-limit service, which already runs.
- **Mail:** Mailu submission, from a `pauseai.es` sender, for invitations, password resets and the digest for
  staff without Telegram.

### 7. Environments

**One environment, production.** A demo dataset (fictional) is available locally through `pnpm db:seed`.

## Consequences

- **Easier:** one Deployment each for web and API, no worker to keep alive; jobs fail visibly per run, and each
  holds one credential.
- **Harder:** a rollout restarts the only API pod (seconds of 502s); Telegram retries its webhook, so no update is
  lost. A CronJob's start-up cost (a Node process) is paid every run, which is fine at hourly frequency.
- **Risks accepted:** no staging; changes are tested locally and in CI against production builds. No backups
  until Dani's gitops plan runs (census answers exist only in this database meanwhile).
- **Revisit:** more replicas if the team grows or a restart's blip matters; a worker if a job needs to run often
  or long.
