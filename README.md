# Backoffice

PauseAI España's internal tool for its two pipelines: **onboarding**, which captures every new person (Global's
Airtable signups and arrivals in the WhatsApp community, reported through a Telegram bot), shows who needs to act
on whom and by when, and recovers what we know about existing members; and **outreach**, which tracks the
organisations and people we want a relationship with, and who contacts them. "Backoffice" is a working name; it
lives in config.

## Documentation

- [Product brief](docs/BRIEF.md): scope and constraints (source of truth)
- [Plan](docs/PLAN.md): milestones, decisions, open questions
- [Architecture decisions](docs/adr/): hosting, authorization and data protection, stack, the Telegram bot, the
  Airtable intake
- [Specs](docs/spec/): onboarding, outreach, data model, personal data
- [Runbooks](docs/runbooks/): deploying, the first admin, a lost authenticator, the bot's token, importing an
  outreach campaign
- [Contributing](CONTRIBUTING.md): workflow, the local database, the new-table checklist

## Getting started

Requires Node 26 (see `.nvmrc`), pnpm 12 (pinned in `package.json`) and Docker, for the local Postgres.

```sh
pnpm install
cp .env.example .env
pnpm db:up && pnpm db:migrate
pnpm lint
pnpm test
pnpm test:db
pnpm build:check
```

## Deployment

Argo CD deploys `helm-charts/backoffice` on Dani's cluster from a private gitops repository; images come from the
release workflow, through the registry ([ADR-0001](docs/adr/0001-hosting-and-delivery.md),
[deploying](docs/runbooks/deploying.md)).

## Personal data

This repository never holds members' data, exports, Airtable files or the link to Global's shared view. Fixtures and
seeds are obviously fictional.
