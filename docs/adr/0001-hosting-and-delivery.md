# ADR-0001: Hosting and delivery

- **Status:** Accepted (Dani, 2026-10-15: self-host on Dani's cluster; D4, the staff UI on the public gateway with
  mandatory two-factor)
- **Date:** 2026-10-15
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) §4; [ADR-0002](0002-authorization-and-data-protection.md),
  [ADR-0003](0003-application-stack.md); the gitops repository's onboarding conventions

## Context

- **What the owner decided:** self-host on the Kubernetes cluster Dani operates in the EU, deployed by Argo CD from
  a private gitops repository, as other apps already are. The cluster-specific facts (hosts, names, the onboarding
  layout) live in that repository; this one is public (2026-10-16) and keeps none of them (CLAUDE.md).
- **What the cluster offers:** Argo CD ApplicationSets, Sealed Secrets, a private container registry (Harbor),
  Envoy Gateway (a public gateway, with its rate-limit service already running), cert-manager, a shared Postgres 18
  instance whose provisioning creates a database's owner and extra roles, a mail server, and GlitchTip.
- **What the app needs to run:**
  - a staff UI and an API, used by a handful of volunteers;
  - a Telegram webhook reachable from the internet (M1);
  - a public census form (M2), a few submissions a day;
  - short periodic jobs: session clean-up, the Airtable sync, the daily digest, dialog clean-up.
- **Backups** are Dani's, planned in the gitops repository, separately from this ADR.

## Options considered

1. **Background work.**
   - (a) A worker Deployment fed over HTTP. A long-running pod for work that is only periodic and short; one more
     thing to keep alive and to secure.
   - (b) **Kubernetes CronJobs** run from the API's image, each with only its own role's credentials. Nothing
     runs between runs; Kubernetes handles schedules, missed runs and overlap (`concurrencyPolicy: Forbid`).
     On-demand runs (the Airtable sync from the bot or the web) happen in the API, behind a Postgres advisory lock
     so they never overlap a scheduled run.
2. **Replicas.**
   - (a) Two for web and API, as for a public site that must survive traffic spikes.
   - (b) **One each.** An internal tool for a handful of volunteers: a short restart during a rollout is
     acceptable, and in-process state (rate-limit windows) stays simple. Raising it later is a values change.
3. **Environments.** (a) Staging and production. (b) **Production only**, with a fictional demo dataset locally
   (`pnpm db:seed`).
4. **Staff UI exposure (D4).** (a) Behind a VPN or a private gateway. (b) **On the public gateway with mandatory
   two-factor**, so volunteers reach it from their phones without a VPN.

Dani chose 4b (D4). The rest are Claude's recommendations, taken as decided unless Dani objects: 1b, 2b, 3b.

## Decision

### 1. Deployables

| Deployable           | What                                                                          | Host                                        | Database                      |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `apps/web`           | Next.js staff UI                                                              | The staff host                              | None; calls the API           |
| `apps/api`           | Fastify: all data access, Better Auth, staff, bot, public and internal routes | Same host, `/api/*` and `/telegram/webhook` | `app`, `auth`, `public` roles |
| CronJobs (API image) | Airtable sync, digest, session and dialog cleanup                             | —                                           | `ingest`, `app`, `auth`       |
| `apps/forms` (M2)    | Next.js public census form                                                    | The forms host                              | None; calls the API           |
| Migration Job        | dbmate, as `owner`                                                            | —                                           | `owner`                       |

Hostnames are configuration, not code (D4). The roles are in
[ADR-0002 §2](0002-authorization-and-data-protection.md#2-database-roles).

### 2. Jobs

Kubernetes CronJobs with `timeZone: Europe/Madrid`, `concurrencyPolicy: Forbid`, each with its own role's
credentials only (there is no retention job: D9 decided no automatic erasure):

| Job                      | Schedule                            | Role                            | Milestone              |
| ------------------------ | ----------------------------------- | ------------------------------- | ---------------------- |
| Session and link cleanup | Daily 03:00                         | `auth`                          | M0                     |
| Airtable sync            | Hourly (and on demand from the API) | `ingest`                        | M1, if the spike works |
| Daily digest             | Daily 09:00                         | `app` (system actor, read-only) | M1                     |
| Dialog cleanup           | Hourly                              | `app` (system actor)            | M1                     |

### 3. Gitops entries

In the private gitops repository, following its onboarding conventions:

- An ApplicationSet, the cluster's values, the SealedSecrets, and the repository and namespace in its Argo CD
  project. The namespace and the Application are `pauseai-es-backoffice`, as PauseAI España's other apps (Dani,
  2026-10-16); the Helm release stays `backoffice`, so the resources inside keep their names (`backoffice-api`, …).
- **Database:** a `pauseai_backoffice` database on the shared Postgres instance, its owner and the runtime roles
  created by its provisioning. All five roles are created from the start (PLAN R1).
- **The deploy scripts' settings:** the cluster-specific values the sealing scripts need, in `backoffice-deploy.env`
  at the gitops repository's root (`scripts/lib/deploy-settings.sh`; `scripts/deploy-settings.example.env` lists
  them, with fictional values).

### 4. Images and CI

- **Images:** the registry's `pauseai-es` project, shared with PauseAI España's other apps and pulled with its robot
  (Dani, 2026-10-16), tags `<registry>/pauseai-es/backoffice-<component>:<version>.<sha>`, never `:latest`; base
  images pinned by digest. The pods still run in their own namespace, `pauseai-es-backoffice`.
- **CI:** pull requests on GitHub-hosted runners; `main` and releases on the `pauseai-en-espanol` organisation's
  self-hosted runner, whose labels are the repository variable `SELF_HOSTED_RUNS_ON`, and which alone pushes to the
  registry. Actions pinned by SHA. No `pull_request_target`. CI holds no cluster credentials. The repository being
  public, workflows from outside contributors' pull requests wait for approval, and the release masks the
  registry's host in its logs.
- **Release:** after CI passes on `main`, Changesets bumps versions; every deployable whose version is ahead of the
  umbrella chart's tag is built, pushed and written into the chart, and Argo CD deploys it.

### 5. Sync order and pods

- **Sync order:** Secrets and the ServiceAccount patch (wave -2), the migration Job (Sync hook, wave -1), the rest.
- **Pods:** requests and limits, a restrictive securityContext (non-root, read-only root filesystem, no
  capabilities, `RuntimeDefault` seccomp), no service-account token, `/healthz` probes.
- **NetworkPolicies:** web and forms accept only the gateway, and reach only the API, DNS and GlitchTip. The API
  accepts the gateway and the web pods on its staff port (3001), and the forms pods on its forms port (3003) alone
  (ADR-0002 §7); it reaches Postgres, GlitchTip, the mail server, DNS, and the internet on 443 for Telegram and
  Airtable. `scripts/check-network-policies.mjs` checks in CI that each side's rules match the other's.

### 6. Routes and mail

- **Routes:** the public gateway for the staff and forms hosts (D4); per-IP rate limits on the auth, form and
  webhook routes through Envoy Gateway's rate-limit service, which already runs.
- **Mail:** the cluster's mail server, by SMTP submission, from a `pauseai.es` sender, for invitations, password
  resets and the digest for staff without Telegram.

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
