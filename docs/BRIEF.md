# Product brief: PauseAI España backoffice

- **Status:** Source of truth for scope and constraints. Split from the reviewed specification draft (v3) of
  2026-10-15. Decisions are in [adr/](adr/), milestones and open decisions in [PLAN.md](PLAN.md), and the details
  in [spec/](spec/). **Amended 2026-10-30:** the association's accounts come into scope (D20, G7).
- **Date:** 2026-10-15
- **Owner:** Dani, who leads onboarding for Spain. Drafted by Claude.
- **Operator and data controller:** PauseAI España (Asociación Pausemos La IA).
- **Repository:** `pauseai-en-espanol/backoffice`, public. Deployed on Dani's cluster through a private gitops
  repository.

"Backoffice" is a working name. It lives in config, never in code.

## 1. Problem

1. **Nobody can see the whole onboarding pipeline.** New people arrive in two ways:
   - **Global's join form.** Spain's signups are in an Airtable view. Global's notification emails carry the same
     data, so the view is enough.
   - **Joining the WhatsApp community directly**, through any of its tens of chats. Only admins see people join and
     leave.

   The onboarding team (volunteers) shares the work but sees none of these signals, so nobody knows who needs to
   be contacted, by whom, or how far along anyone is.

2. **Nothing is known about the 106 members already in the community.** No profile, location, skills or
   availability was ever collected.
3. **Outreach to relevant people has no pipeline.** The `outreach` repo has a campaign CLI (ingest → curate →
   render → track, one CSV per campaign), but no shared view of who to contact, who owns them, or where each
   relationship stands.
4. **The association's money has no books** (2026-10-30). It has a bank account and expects funding from PauseAI
   Global, then donations; the law and its statutes require accounts the assembly approves every year.

## 2. Goals and non-goals

### Goals

- **G1. One place that answers "who needs to act, on whom, by when"** for every person in onboarding.
- **G2. Every arrival is captured and starts the process.** Airtable signups come in automatically. Whoever sees
  someone join or leave the community tells a Telegram bot in a few seconds. Either way the arrival becomes one
  person (no duplicates across sources) and the team is told.
- **G3. The 106 existing members are recovered** through a short census form.
- **G4. An outreach pipeline** for organisations and relevant people: add them with a sourced reason, assign
  them, contact them, record what happened.
- **G5. Safe with personal data.** Least privilege enforced in Postgres, mandatory second factor, audit log,
  retention and erasure, EU hosting.
- **G6. Extensible by Claude Code.** The same conventions as an earlier project of Dani's, so new modules follow
  known patterns.
- **G7. The association's books** (D20): every movement recorded with its proof from the first one, and the
  reports the assembly approves at the end of each year ([ADR-0006](adr/0006-accounting.md)).

### Non-goals (v1)

- **The app doesn't read WhatsApp.** People report what they see through the bot
  ([ADR-0004](adr/0004-telegram-bot.md) explains why).
- **No bulk messaging.** The app never sends WhatsApp messages, and never sends outreach email by itself
  ([outreach spec §3](spec/outreach.md#3-sending-a-person-always-sends)). It prepares messages, and a person sends
  them.
- **No newsletter or mass mailing.** Those stay where they are.
- **Not a task manager.** Vikunja (`vikunja-pauseai`) keeps general tasks. The backoffice only tracks the next
  action on a person.
- **No writing back to Global's Airtable.** We read from it.
- **No events or fundraising, and the app never moves money.** It keeps the books (G7), but makes no payment,
  has no donation page and no access to the bank beyond the statements someone imports.

### What success looks like

| Measure                                | Target                                |
| -------------------------------------- | ------------------------------------- |
| Airtable signups in the system         | All of them, within a day of arriving |
| Community arrivals reported to the bot | The same day they join                |
| New arrival assigned to an onboarder   | Within 48 hours                       |
| First contact attempt                  | Within 72 hours of arrival            |
| Census answered by existing members    | 60% within 4 weeks of sending it      |
| Arrivals only one admin knew about     | Zero                                  |

## 3. Users and roles

| Role (UI)    | Who                                                       | Can                                                                                 |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `admin`      | Dani, plus one more person so access never depends on one | Everything, plus staff accounts, settings, imports, exports, erasure, the audit log |
| `tesoreria`  | The treasurer, once there is one                          | Read and write the books: movements, receipts, the chart, closing a year            |
| `onboarding` | The onboarding volunteers and the community's admins      | Read and write people, the pipeline, intake, imports and the census; use the bot    |
| `outreach`   | The outreach team                                         | Read and write organisations, contacts and campaigns                                |

- Roles combine: one staff account can hold several.
- Admins read the books but don't record in them: whoever records isn't the only one who sees
  ([ADR-0006](adr/0006-accounting.md)). An admin who records holds `tesoreria` too.
- **Staff accounts are invite-only.** There is no sign-up.
- Each staff member links their Telegram account to use the bot ([ADR-0004](adr/0004-telegram-bot.md)).
- A staff account can be linked to that volunteer's own person record (staff are members too), but the two are
  separate: losing staff access never deletes the person.
- Finer access ("a volunteer sees only the people assigned to them") is deferred (D7 in
  [PLAN.md](PLAN.md#open-decisions)).

## 4. Constraints

- **One organisation, one country.** The backoffice serves PauseAI España only. Another chapter runs its own
  instance, on its own Postgres server (D5): role and database names are fixed in the migrations.
- **Spain's community, and Spanish speakers.** Arrivals and members are people in Spain, Spaniards abroad, Latin
  Americans and Latin Americans abroad (PLAN R74, D19); outreach is Spanish. The UI is in Spanish (D6).
- **Self-hosted in the EU.** Everything runs on Dani's cluster, in the EU, deployed through gitops
  ([ADR-0001](adr/0001-hosting-and-delivery.md)). No third-party analytics in the staff app.
- **The app never reads WhatsApp.** Arrivals and leaves seen in the community are reported to a Telegram bot
  (D1).
- **A person always sends.** Nothing in the app sends WhatsApp messages or outreach email by itself; it prepares
  them and a person sends them (D8).
- **The app never moves money.** It records what the bank did; payments are made at the bank, by the people the
  statutes empower.
- **We only read from Global.** Global's Airtable is read through the shared view link, which is configuration
  and a credential ([ADR-0005](adr/0005-airtable-intake.md)).
- **No hardcoded names, domains or dates.** The product name, hostnames, bot name and sender address come from
  config. Database role and database names are the one exception: fixed in the migrations (D5).
- **Same stack and conventions as an earlier project of Dani's**, reassessed for security and quality
  ([ADR-0003](adr/0003-application-stack.md)).
- **Personal data is handled as the GDPR and Spain's LOPDGDD require**
  ([personal data spec](spec/personal-data.md)). Legal and privacy calls are Dani's, for the association.
- **Seeds and fixtures are obviously fictional.** No real member, export, contact or Airtable link is ever
  committed.

## 5. What we protect

In priority order:

1. **Members' personal data.** It reveals who supports an AI-pause organisation, which can be sensitive.
2. **Staff accounts**, since each one opens that data.
3. **Linked Telegram accounts, the bot token and the webhook secret**, since through them someone can act as a
   staff member within the bot's limits.
4. **The Airtable shared view link**, which reads every Spain signup.
5. **The books:** who gave money and who was paid, their tax IDs and IBANs, and the receipts.
6. **Outreach notes.** They are not secret, but they would be embarrassing if leaked.

How each is protected is in [ADR-0002](adr/0002-authorization-and-data-protection.md),
[ADR-0004](adr/0004-telegram-bot.md), [ADR-0005](adr/0005-airtable-intake.md) and [ADR-0006](adr/0006-accounting.md).

## 6. Scope by milestone

The order makes **G1 and G2 usable first**, and the census (G3) follows straight after. M1 is the smallest thing
that fixes the immediate problem. What each milestone ships is in [PLAN.md](PLAN.md#milestones).

| Milestone                | Delivers                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0 Foundations**       | Repo scaffold, CI, Helm chart, gitops entries, database roles, sign-in with TOTP, invitations, audit log                                                                                   |
| **M1 Onboarding MVP**    | People, identities, stages, owners, next actions, timeline, Hoy / Sin asignar / Onboarding Pipeline views, quick-add, matching and merge, Airtable import, the Telegram bot, notifications |
| **M2 Census**            | Public forms app, census form (generic link and personal links), WhatsApp handover links, skills, interests and teams, consent                                                             |
| **M3 Outreach**          | Organisations, contacts, campaigns, templates, the outreach queue and handover; import from the `outreach` repo                                                                            |
| **M4 Tools and insight** | Funnel metrics, no MCP server for now (D10) and no retention automation (D9)                                                                                                               |
| **M6 Cuentas**           | The books: the chart, Ingreso / Gasto / Traspaso, receipts, posting and corrections, reports, closing a year; then bank statements                                                         |

Backups are Dani's, in gitops, separately from this plan ([personal data spec](spec/personal-data.md#11-backups)).

## 7. Alternatives considered

- **Reading WhatsApp automatically.** Dropped in favour of the bot (D1); see
  [ADR-0004](adr/0004-telegram-bot.md#options-considered).
- **Reading the notification emails.** Not needed: the Airtable view has the same data (D3); see
  [ADR-0005](adr/0005-airtable-intake.md#options-considered).
- **A spreadsheet shared by the team:** fastest to start, but it can't capture sources automatically, has no
  per-row access control or history, and phone numbers end up in one more place.
- **A self-hosted open-source CRM** (Twenty, CiviCRM): pipelines out of the box, but no bot or census flow, a
  different stack and security model to operate, and extending it means learning its plugin system rather than
  using the patterns the team already has.
- **Global's Airtable as the system of record:** we don't own it, and community-only arrivals and the census would
  still need a home.
