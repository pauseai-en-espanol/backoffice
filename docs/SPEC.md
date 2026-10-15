# PauseAI España backoffice: specification

- **Status:** Draft for review. What is already decided and what is still open is in [§13](#13-decisions); facts we
  still need are in [§14](#14-open-questions).
- **Date:** 2026-10-15
- **Owner:** Dani, who leads onboarding for Spain. Drafted by Claude.
- **Operator and data controller:** PauseAI España (Asociación Pausemos La IA).
- **Repository:** `pauseai-en-espanol/backoffice`. Deployed on `danilupion-com` through `danilupion/gitops`.

This document is the source of truth for scope and constraints until it is split into a brief, ADRs and specs
(the aiontheballot layout) at the end of M0. "Backoffice" is a working name. It lives in config.

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
- **G6. Extensible by Claude Code.** The same conventions as aiontheballot, so new modules follow known
  patterns.

### Non-goals (v1)

- **The app doesn't read WhatsApp.** People report what they see through the bot
  ([§15](#15-alternatives-considered) explains why).
- **No bulk messaging.** The app never sends WhatsApp messages, and never sends outreach email by itself
  ([§7.3](#73-sending-a-person-always-sends)). It prepares messages, and a person sends them.
- **No newsletter or mass mailing.** Those stay where they are.
- **Not a task manager.** Vikunja (`vikunja-pauseai`) keeps general tasks. The backoffice only tracks the next
  action on a person.
- **No writing back to Global's Airtable.** We read from it.
- **No events, donations or finances.**

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
| `onboarding` | The onboarding volunteers and the community's admins      | Read and write people, the pipeline, intake, imports and the census; use the bot    |
| `outreach`   | The outreach team                                         | Read and write organisations, contacts and campaigns                                |

- Roles combine: one staff account can hold several.
- **Staff accounts are invite-only.** There is no sign-up.
- Each staff member links their Telegram account to use the bot ([§6.5.2](#652-the-telegram-bot-m1)).
- A staff account can be linked to that volunteer's own person record (staff are members too), but the two are
  separate: losing staff access never deletes the person.
- Finer access ("a volunteer sees only the people assigned to them") is deferred ([D7](#13-decisions)).

## 4. Before any code: this week

1. **Agree the rule** with the community's admins: whoever approves or sees a join or a leave reports it. Until M1
   ships, in a shared note; from M1, to the bot.
2. **If the community allows it, require approval to join**, so every arrival passes through an admin who can
   report it.
3. **Create the bot** with BotFather and keep its token for the gitops secret.
4. **When convenient, ask Global** for a read-only API token, or to protect the shared view with a password. The
   shared link works meanwhile ([§6.5.1](#651-airtable-m1)), so nothing waits on this.

## 5. Milestones

Each milestone ends with green CI, a deploy and a short demo note. The order makes **G1 and G2 usable first**, and
the census (G3) follows straight after. M1 is the smallest thing that fixes the immediate problem.

| Milestone                | Delivers                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 Foundations**       | Repo scaffold, CI, Helm chart, gitops entries, database roles, sign-in with TOTP, invitations, audit log                                                                      |
| **M1 Onboarding MVP**    | People, identities, stages, owners, next actions, timeline, Hoy / Sin asignar / Embudo views, quick-add, matching and merge, Airtable import, the Telegram bot, notifications |
| **M2 Census**            | Public forms app, census form (generic link and personal links), WhatsApp handover links, skills, interests and teams, consent                                                |
| **M3 Outreach**          | Organisations, contacts, campaigns, templates, the outreach queue and handover; import from the `outreach` repo                                                               |
| **M4 Tools and insight** | Funnel metrics, MCP server with member tokens (if [D10](#13-decisions) says so), retention automation                                                                         |

Backups are Dani's, in gitops, separately from this plan ([§9.8](#98-backups)).

## 6. Onboarding

### 6.1 Concepts

- **Person.** One human, whatever the number of sources they came from. It holds the profile (names, location,
  languages, skills, availability, interests, consent).
- **Identity.** A way to recognise a person: an email, a phone number (E.164), an Airtable record ID. A normalised
  identity belongs to at most one person, which is what prevents duplicates.
- **Source.** Where we learned about a person: `airtable`, `telegram` (reported to the bot), `census`, `manual`
  (the web app), `csv`. A person keeps all of them, each with a date and who reported it.
- **Community presence.** The periods during which a person was in the WhatsApp community: joined at, left at,
  who reported it. Optionally the chat they joined, from a list in settings (a local chat hints at a province).
  Leaving is a signal, not a deletion.
- **Stage.** Where the person is in onboarding ([§6.2](#62-stages)).
- **Owner.** The onboarder responsible for the person. It can be empty: that is exactly the "Sin asignar" queue.
- **Next action.** Free text plus a due date ("Llamar el jueves", 2026-10-20). Every person in an open stage
  should have one.
- **Timeline.** An append-only history per person: notes, contact attempts with their channel and outcome, stage
  and owner changes, joins and leaves, form submissions, imports, merges. It is what lets someone else pick up a
  person.

### 6.2 Stages

Identifiers are English in the database. Labels are Spanish in the UI.

| Stage          | UI label         | Meaning                                                      | Leaves when                         |
| -------------- | ---------------- | ------------------------------------------------------------ | ----------------------------------- |
| `to_triage`    | Por clasificar   | Already in the community before the backoffice; not reviewed | Someone classifies them             |
| `new`          | Nuevo            | Arrived; nobody has engaged yet                              | The first contact attempt is logged |
| `contacting`   | Contactando      | At least one attempt, no reply yet                           | They reply, or the attempts run out |
| `talking`      | En conversación  | They replied; welcome pending                                | Welcome done                        |
| `welcomed`     | Bienvenida hecha | First conversation done; pointed to a team or a first task   | They contribute                     |
| `active`       | Activo           | Contributing                                                 | No activity for 90 days             |
| `dormant`      | Inactivo         | Was active or welcomed, quiet for a long time                | They come back                      |
| `unresponsive` | Sin respuesta    | Three attempts over at least 14 days without reply           | They reply                          |
| `left`         | Baja             | Left the community or asked to leave                         | They come back                      |
| `discarded`    | Descartado       | Spam, duplicate or not a fit                                 | Never (reopened manually)           |

- Any stage can move to any other by hand. The table is the expected path, not a state machine that blocks
  people.
- Every change goes to the timeline with who made it.
- `left` and `discarded` close the next action. `unresponsive` keeps the person reachable for a later campaign.

### 6.3 "Needs attention" rules

Computed on read, never stored. Each rule has a Spanish reason shown on the person's card and in the bot:

1. In `new` with no owner. ("Sin asignar")
2. Next action due today or overdue. ("Acción pendiente")
3. In an open stage (`new`, `contacting`, `talking`, `welcomed`) with no next action. ("Sin siguiente paso")
4. In `contacting` with the last attempt more than 5 days ago. ("Toca seguimiento")
5. Left the community while in an open stage or `active`. ("Ha salido de la comunidad")
6. A possible duplicate is waiting for review. ("Posible duplicado")

The thresholds live in settings, not in code.

### 6.4 Views

Reporting happens mostly through the bot. The web app is where the work is followed and done, and it is
mobile-first all the same.

- **Hoy:** my people needing attention, then the unassigned queue with a "Me lo quedo" (claim) button.
- **Embudo:** a board by stage. Filters: owner, province, source, in the community or not, needs attention.
- **Personas:** a searchable list (name, email, phone; typo-tolerant). Exportable to CSV by admins only, and
  every export is audited.
- **Persona:** profile, identities, community presence, timeline. Quick actions: log a contact attempt (channel
  and outcome presets), set the next action, change stage, assign, add a note, open a WhatsApp chat with a
  prepared message ([§6.7.3](#673-whatsapp-handover-links)), copy the email address.
- **Añadir rápido:** name and phone or email, source, optional note. Duplicates are checked as you type.
- **Bandeja:** records awaiting a decision: possible duplicates and conflicting values.
- **Importar:** "Sincronizar Airtable ahora" with the last run's result; upload a CSV, preview, dry-run diff,
  apply ([§6.5.3](#653-web-and-csv-m1)).
- **Censo:** progress of the census, and the queue of personal links still to send ([§6.7](#67-the-census)).
- **Ajustes → Telegram:** link or unlink my Telegram account.
- **Panel:** counts by stage, arrivals per week by source, time to first contact, unassigned for more than
  48 hours.

### 6.5 Intake sources

Every source produces **intake records**. Matching ([§6.6](#66-matching-and-merging)) turns each one into a new
person, an update to an existing person, or an item in the Bandeja. Every import is **idempotent**: re-importing
the same file or re-running a sync changes nothing.

#### 6.5.1 Airtable (M1)

Spain's signups are in an Airtable view that Global shares with us by link. Global's notification emails carry
the same data, so the app reads no mail. The shared link is all we have, so **the link is configuration**
([D2](#13-decisions)):

- **Where it lives:** a sealed secret in gitops, read by the sync. When Global changes the link, the secret
  changes; no code does.
- **How it is read:** the sync loads the shared view the way a browser does and reads its records (or its CSV
  download, if the view allows one). This uses Airtable's undocumented internals, not its API: Airtable can change
  or block it at any time, and its terms may not allow it. M1 starts with a spike against the real link, run
  locally, which confirms it works without a full browser and records the view's column names. If it needs a
  headless browser, the sync isn't built and the CSV import below is the route.
- **When:** hourly, plus on demand from `/sincronizar` in the bot or a button in Importar. A Postgres advisory lock
  stops two runs overlapping.
- **Idempotent:** the Airtable record ID is the identity.
- **Fails loudly:** a run that can't read the view, or finds the columns changed, imports nothing and tells the
  admins through the bot. The **CSV import** ([§6.5.3](#653-web-and-csv-m1)) is the fallback: someone opens the
  link, downloads the CSV and uploads it.
- **If Global ever grants a read-only API token**, an API reader replaces the shared-view reader behind the same
  interface.

Only mapped fields are copied, never the rest of Global's record.

**The shared view link is a credential.** Anyone holding it reads every Spain signup. It lives only in the sealed
secret, and is never committed, logged, shown in the UI or pasted where others can see it.

#### 6.5.2 The Telegram bot (M1)

This is how WhatsApp arrivals and leaves enter the system, and how the team hears about every arrival.

**Linking an account.**

- In the web app, signed in with the second factor, a staff member taps "Conectar Telegram". The app makes a
  one-time code (valid 10 minutes, stored as a hash) and opens `https://t.me/<bot>?start=<code>`.
- The bot receives `/start <code>` and links that Telegram user ID to the staff member.
- Messages from Telegram users who aren't linked are ignored without a reply, as in aisafety-newsroom.
- An account is unlinked from the web app, by an admin, or automatically when the staff member is deactivated or
  their password or second factor is reset.

**Commands.** These work in a private chat with the bot. Replies are in Spanish.

| Command          | Does                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/alta`          | Reports someone who joined. The bot reads name, phone or email, chat and note from one message, asks for what's missing, shows any likely match ("¿Es Ana G., Nuevo, sin asignar?") and confirms |
| `/baja`          | Reports someone who left. Search by phone or name, pick from buttons, confirm                                                                                                                    |
| `/mios`          | My people needing attention: name, reason, link to the web app                                                                                                                                   |
| `/libres`        | The unassigned queue, with a "Me lo quedo" button on each                                                                                                                                        |
| `/buscar <text>` | Name, stage and owner of the matches, with links. No contact details                                                                                                                             |
| `/sincronizar`   | Runs the Airtable sync now and reports how many people came in                                                                                                                                   |
| `/ayuda`         | The commands                                                                                                                                                                                     |

- A message that isn't a command but contains a phone number or email is taken as a draft `/alta`, and is only
  saved after confirmation.
- **Contact details don't stay in the chat.** After an `/alta` is saved, the bot deletes the reporter's messages
  that contained the phone or email (the Bot API lets a bot delete incoming messages in a private chat within
  48 hours). Its own replies never repeat contact details.
- **Implementation:** as aisafety-newsroom. Fastify routes in `apps/api`, a small hand-written Bot API client (no
  bot framework), updates by webhook ([§9.5](#95-the-telegram-bot)). The state of a conversation in progress lives in
  the database and expires after an hour.

#### 6.5.3 Web and CSV (M1)

- **Quick-add** in the web app, for whoever prefers it to the bot.
- **CSV import** with a column mapping, a preview, a dry run and an apply step. It covers any one-off list, and
  Airtable whenever the shared-view sync breaks.

### 6.6 Matching and merging

- **Normalisation:** emails lowercased and trimmed. Phones parsed to E.164 with libphonenumber, Spain as the
  default region. Names trimmed with Unicode-aware case folding, for comparison only.
- **Exact match** on any normalised identity attaches the record to that person automatically.
- **No exact match** creates a new person in `new`, unless a **fuzzy match** is found: a trigram similarity on the
  name above a threshold, ideally with something else in common (province, chat). In that case the record goes to
  the Bandeja as "Posible duplicado". The bot asks the reporter right away instead.
- **Conflicts never overwrite.** Where a source disagrees with a field a person or the census set, the new value is
  shown in the Bandeja; it is not applied.
- **Merging** is a human action. It moves identities, sources, presence and timeline to the surviving person, keeps
  the other one as a tombstone pointing to it, and is recorded in both timelines and the audit log. Merges are not
  undone automatically: an admin can split by hand, with the tombstone's snapshot as a guide.

### 6.7 The census

How the 106 are recovered (G3), and how every new member is profiled afterwards.

#### 6.7.1 How existing members get in

There is no list of the community's members to import, so they come in three ways:

1. **Airtable:** those who signed up through Global are already there after the first import.
2. **Admins and volunteers** add the people they know, through the bot or the web app, as `to_triage`, or straight
   to `active` or `welcomed`.
3. **The census itself:** a submission from someone not yet in the system creates them in `to_triage`.

#### 6.7.2 The form (M2)

- Fields: name, preferred name, email, phone, province and town, languages, skills, availability (occasional,
  under 2 h a week, 2–5 h, over 5 h), what they would like to help with, how they heard of PauseAI, pronouns
  (optional, free text). Consent: contact by email, contact by WhatsApp, and the privacy notice.
- **Two lists are edited by an admin in settings**, not in code: skills (diseño, redes sociales, programación…)
  and areas to help in (comunicación, eventos, política, divulgación…), each plus "otra". They start as
  placeholders and are filled in before the census goes out.
- **Age:** the form asks the person to confirm they are 14 or older. In Spain a minor under 14 can't consent to
  this alone (LOPDGDD art. 7), so the form doesn't accept them and says to talk to the team.
- **Generic link**, posted in the community's announcements: the submission is matched by phone or email. It
  **can't overwrite** existing data. Where it would, the change goes to the Bandeja
  ([§6.6](#66-matching-and-merging)), since anyone can type anyone's number.
- **Personal link**, one per person, for follow-ups: the person can update their own profile directly. It is
  valid for 30 days, stored only as a hash, and carried in the URL fragment so no server log records it.
- Every submission is a timeline event, and sets `profile_completed_at`.

#### 6.7.3 WhatsApp handover links

For personal links and onboarding messages, the app builds a `https://wa.me/<number>?text=<message>` link with the
message prepared from a template. The onboarder taps it, WhatsApp opens with the message ready, and they press
send. Back in the app they confirm "Enviado", which logs the attempt. Nothing is sent automatically, and the
message comes from a real person's number, which is also what makes a reply likely.

### 6.8 Notifications

- **Team group (optional, [D11](#13-decisions)):** the bot posts each new arrival, from any source, to the
  onboarding team's Telegram group: name, source, province if known, and the buttons "Me lo quedo" and "Abrir".
  When someone claims it, the message is edited to show who. **No contact details** are posted in the group. Only
  linked staff can press the buttons; anyone else gets "No autorizado".
- **Daily digest** at 09:00 Europe/Madrid, by Telegram to each linked onboarder with something pending (by email
  to those without Telegram): their people needing attention, the size of the unassigned queue, and yesterday's
  arrivals. Nothing is sent when nothing is pending.

## 7. Outreach

### 7.1 Concepts

- **Organisation:** a party, union, NGO, university, media outlet, company or public body. It has a type,
  territory (state, autonomous community or province) and website.
- **Contact:** a person we want a relationship with: a politician, journalist, academic or someone at an
  organisation. Name, role, organisation, territory, professional contact details, tier (A for state-level
  decision-makers, B for everyone else, as in the outreach guidelines), tags, and a **relationship stage**.
- **Why they matter:** every contact carries at least one source URL and a reason. Contacts imported or suggested
  by tools start with `needs_review` set.
- **Campaign:** a goal, a language, a sender, templates by tier, evidence paragraphs ("anchors") with their
  sources, and a list of **targets** (contact × campaign).
- **Timeline:** the same append-only pattern as onboarding.

### 7.2 Stages

**Relationship (per contact):** `identified` → `qualified` → `contacted` → `engaged` (replied or met) → `ally`, or
`declined`, or `dormant`.

**Target (per contact in a campaign):** `pending` → `ready` (rendered, reviewed) → `sent` → `replied` → `meeting`;
or `declined`, `bounced`, `no_response`. Each target has an owner, a priority (1 goes first; none sorts last), a
next action and its dates. These are the outreach CLI's statuses, so its tracking sheets import as they are.

### 7.3 Sending: a person always sends

The outreach repo's rule carries over: **nothing in this app sends outreach mail.**

- The app renders each email from the template and the contact. It **fails** on an unresolved merge field, an
  unknown anchor, or a contact still marked `needs_review`.
- **"Siguiente"** gives the owner the next target in the queue: a `mailto:` link, copy buttons for recipient,
  subject and body, or a `wa.me` link where WhatsApp is the right channel. Then it asks whether it went out. "Sí"
  logs `sent` with the date.
- Greetings default to neutral ("Estimado/a"). A gendered treatment is set only when a person has verified it, and
  is never inferred from a name.
- Every figure in a template must come from an anchor with a source.

Sending through Mailu from the app is a later decision ([D8](#13-decisions)).

### 7.4 Import from the outreach repo

A one-off importer reads `campaigns/<slug>/` (`campaign.yaml`, `contacts/contacts.yaml`, `templates/*`,
`anchors.yaml`, `tracking.csv`) into a campaign, its contacts and targets. After that the repo becomes the archive
for that campaign, and new campaigns start in the app.

### 7.5 Views

Campañas (list and per-campaign board by target status), Contactos (directory with filters by tier, territory,
organisation type and relationship), Organizaciones, Plantillas (with a rendered preview per contact), and the
Siguiente queue.

## 8. Data model

PostgreSQL 18, schema `app` for application data, `auth` for credentials, `private` for definer functions and
internal state. Keys are `uuidv7()`. Each table is listed here with its purpose. Columns are specified in the M1
and M3 migrations.

| Table                      | Holds                                                                                    | Module     |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| `staff`                    | Staff accounts' app side: display name, linked person, active flag                       | Core       |
| `staff_roles`              | `(staff_id, role)`                                                                       | Core       |
| `settings`                 | Thresholds, community chats list, skills and interests lists, digest time                | Core       |
| `audit_log`                | Every write: actor, channel (web or bot), table, row, before and after. Append-only      | Core       |
| `people`                   | Profile, stage, owner, next action and due date, `profile_completed_at`, anonymised flag | Onboarding |
| `identities`               | `(kind, value)` unique, `person_id`, verified, source, first seen                        | Onboarding |
| `person_sources`           | Each source a person came from, with date, reporter and external reference               | Onboarding |
| `community_presence`       | `(person_id, joined_at, left_at, chat, reported_by)`                                     | Onboarding |
| `person_events`            | The timeline. Append-only; only anonymisation redacts it                                 | Onboarding |
| `intake_records`           | Every imported or reported record: source, external ID, minimised payload, status, match | Onboarding |
| `imports`                  | Each import or sync run: who, when, file hash, counts, dry-run diff                      | Onboarding |
| `census_links`             | Personal links: person, token hash, expiry, used at                                      | Onboarding |
| `skills`, `interests`      | Lists edited in settings, and the people linked to them                                  | Onboarding |
| `organisations`            | Outreach organisations                                                                   | Outreach   |
| `contacts`                 | Outreach contacts, tier, relationship stage, sources, `needs_review`                     | Outreach   |
| `campaigns`                | Goal, language, sender, status, owner                                                    | Outreach   |
| `campaign_templates`       | Per tier: subject, body with merge fields, word limit, version                           | Outreach   |
| `campaign_anchors`         | Evidence paragraphs and their sources                                                    | Outreach   |
| `campaign_targets`         | Contact × campaign: status, owner, priority, dates, next action                          | Outreach   |
| `contact_events`           | The outreach timeline                                                                    | Outreach   |
| `private.telegram_updates` | Each processed `update_id`, so redeliveries are harmless                                 | Bot        |
| `private.telegram_dialogs` | A conversation in progress; deleted after an hour                                        | Bot        |
| `private.telegram_posts`   | Team-group messages per person, so a claim can edit them                                 | Bot        |
| `auth.telegram_links`      | Telegram user ID ↔ staff, linked at, unlinked at; link codes as hashes                   | Auth       |
| `auth.*`                   | Better Auth's tables (users, accounts, sessions, two-factor); member tokens in M4        | Auth       |

**Rules in the database, not the UI:**

- Timelines and the audit log are append-only (triggers refuse `UPDATE` and `DELETE`; only the anonymisation
  function redacts).
- A normalised identity belongs to one person (unique index).
- Stage changes and assignments write their timeline event in the same transaction (trigger).
- The audit trigger is attached to every `app` table; a catalog test fails when a new table lacks it.
- What the bot may write is limited in the database ([§9.5](#95-the-telegram-bot)).

## 9. Security and privacy

### 9.1 What we protect

In priority order:

1. **Members' personal data.** It reveals who supports an AI-pause organisation, which can be sensitive.
2. **Staff accounts**, since each one opens that data.
3. **Linked Telegram accounts, the bot token and the webhook secret**, since through them someone can act as a
   staff member within the bot's limits.
4. **The Airtable shared view link**, which reads every Spain signup.
5. **Outreach notes.** They are not secret, but they would be embarrassing if leaked.

### 9.2 Sign-in

As aiontheballot (its ADR-0003 §2):

- Better Auth, mounted in the API, with password plus **mandatory TOTP** and backup codes.
- Invite-only; no sign-up.
- Sessions are stored in Postgres, last 12 hours and are revocable.
- Attempts are rate-limited.
- A session without the second factor reaches only the enrolment page, and the database refuses it any data
  (`app.aal`).
- **Change:** passkeys can be offered from M0 as an extra, because the staff host is final from day one.

### 9.3 Database roles and row-level security

As aiontheballot (its ADR-0002), minus tenancy:

| Role (prefix `pauseai_backoffice_`) | Used by                                               | May                                                                      |
| ----------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `owner`                             | The migration Job only                                | Own the schemas. Never used at run time                                  |
| `app`                               | The API's staff and bot routes, via `withActor`       | Read and write `app` under RLS                                           |
| `auth`                              | Better Auth and the Telegram links, in the API        | Only the `auth` schema                                                   |
| `ingest`                            | The Airtable sync (CronJob, and on demand in the API) | Insert intake records and import runs; execute the matcher; nothing else |
| `public`                            | The API's census form routes                          | Execute `private.submit_census`; no table grants                         |

- Every runtime role is `NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB` and owns nothing. A catalog test keeps it
  that way.
- `withActor` sets `app.user_id`, `app.aal` and `app.channel` (`web` or `bot`) per transaction. With no actor,
  every policy denies.
- RLS by module: onboarding tables need the `onboarding` or `admin` role; outreach tables `outreach` or `admin`;
  `audit_log`, exports and erasure `admin` only.
- An RLS matrix test (role × channel × table × operation) runs in CI against Postgres 18, as
  `packages/db/tests/rls` does in aiontheballot.
- Role names are global to the Postgres server, hence the prefix.

### 9.4 Public surfaces

- **The census forms app** has no sessions, no cookies and no database credentials. It posts to the API's public
  routes, which run as `public` and can only call the submit function.
- **The Telegram webhook** ([§9.5](#95-the-telegram-bot)).
- Each public route is rate-limited per IP at the gateway and in the API. Forms have a honeypot field and a
  minimum fill time. No third-party captcha, so the CSP stays `'self'`.
- Personal census tokens: 32 random bytes, stored as SHA-256, 30 days, carried in the fragment.

### 9.5 The Telegram bot

- **Webhook, as aisafety-newsroom:** `/telegram/webhook` on the staff host. The API registers it with a
  `secret_token` and refuses (`401`) any request whose `X-Telegram-Bot-Api-Secret-Token` doesn't match, compared in
  constant time. Each `update_id` is processed once. Bodies are size-limited.
- **Who it acts as.** An update from a linked Telegram user runs through `withActor` as that staff member, with
  `app.channel = 'bot'`. It counts as second-factor level, because the link was made from a session that had the
  second factor, and holding the Telegram account is the factor after that.
- **What the database allows through the bot** (as `private.needs_a_person` does for tokens in aiontheballot
  ADR-0008): reporting an arrival (intake record), reporting a leave (presence), claiming a person for oneself, and
  the reads the bot's commands need. Everything else is refused when `app.channel = 'bot'`, whatever the member's
  roles: no edits to profiles, no stage changes beyond claiming, no exports, no erasure. A new table is closed to
  the bot until listed on purpose.
- **What the bot shows** is names, stages, owners and reasons, never contact details.
- **Accepted risk:** a stolen Telegram account of a linked member can report arrivals and leaves, claim people,
  and see the names and stages that member's bot commands return, until the link is removed. Every action is in
  the audit log with the `bot` channel, so it is visible.
- **Secrets:** the bot token and the webhook secret are sealed, rotatable by a runbook (as aisafety-newsroom), and
  never logged.

### 9.6 Personal data (GDPR)

These are design constraints, not legal advice. Dani decides for the association.

- **Applicable law:** the GDPR, which applies directly in Spain, plus Spain's own Ley Orgánica 3/2018 (LOPDGDD).
  The supervisory authority is the AEPD.
- **Controller:** Asociación Pausemos La IA. The app goes in its record of processing activities (GDPR art. 30).
- **Legal basis.** Membership of an organisation with a political aim can reveal political opinions, which GDPR
  art. 9 treats as special-category data. Art. 9(2)(d) lets such a non-profit process its members' and regular
  contacts' data, with safeguards, provided the data isn't disclosed outside it without consent. LOPDGDD art. 9.1
  adds that consent alone doesn't lift the ban when the main purpose is identifying ideology, so the basis is the
  association's own activity with its members, not consent. **So: nothing leaves the association without
  consent**, and access is least-privilege.
- **Minors:** under 14, consent must come from a parent or guardian (LOPDGDD art. 7). The census checks the age
  ([§6.7.2](#672-the-form-m2)).
- **Global's data:** their privacy notice says signups may be shared with the national chapter. We copy only
  mapped fields.
- **Telegram carries some personal data.** A name and a phone number typed into the bot pass through Telegram's
  servers. The bot deletes those messages once saved, never repeats contact details, and posts none in the team
  group. Dani decides on this use ([D12](#13-decisions)).
- **Minimisation:** no fields beyond the census list. The UI asks staff not to record health, ideology or other
  sensitive details in notes.
- **Privacy notice** linked from the census form; consent recorded with its date and wording version.
- **Rights:** admins can export a person's data (JSON) and erase a person. Erasure anonymises: it removes
  identities, profile and note bodies, and keeps stage counts for statistics. Both actions are audited.
- **Retention ([D9](#13-decisions)):** proposed 12 months after leaving or after last contact for
  `left`, `unresponsive` and `discarded`, then anonymised automatically (M4).
- **Processors:** everything else runs on our cluster (Hetzner, EU). No third-party analytics in the staff app.
  Sending personal data to an LLM (the MCP server, M4) is a separate decision ([D10](#13-decisions)).

### 9.7 Logs and errors

- GlitchTip through the Sentry SDKs, with aiontheballot's privacy options: no cookies, headers, bodies or query
  strings; users dropped; emails redacted.
- pino redaction for phone numbers, emails and tokens. Request bodies, Telegram messages included, are never
  logged.
- OpenTelemetry instrumentation from day one, export off until the cluster has a backend.

### 9.8 Backups

Dani handles them in gitops (`docs/backup-policy-plan.md`), separately from this plan. Until they run, the census
answers exist only in this database.

## 10. Architecture and stack

### 10.1 Deployables

| Deployable           | What                                                                          | Host                                        | Database                      |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `apps/web`           | Next.js staff UI                                                              | `backoffice.pauseai.es`                     | None; calls the API           |
| `apps/api`           | Fastify: all data access, Better Auth, staff, bot, public and internal routes | Same host, `/api/*` and `/telegram/webhook` | `app`, `auth`, `public` roles |
| CronJobs (API image) | Airtable sync, digest, session and dialog cleanup, retention                  | —                                           | `ingest`, `app`, `auth`       |
| `apps/forms` (M2)    | Next.js public census form                                                    | `unete.pauseai.es`                          | None; calls the API           |
| Migration Job        | dbmate, as `owner`                                                            | —                                           | `owner`                       |

Hostnames are configuration, not code ([D4](#13-decisions)).

### 10.2 What changes from aiontheballot

| Area            | aiontheballot                                                                                           | Backoffice                                                         | Why                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Toolchain       | Node 26, pnpm 12, Turbo, TS 7, oxlint, Prettier, Vitest, Playwright, Changesets, Renovate (3-day delay) | **Same**                                                           | One way of working across repos                         |
| Frontend        | Next.js 16, Panda CSS, Ark UI                                                                           | **Same**                                                           | Known; accessible components                            |
| API and data    | Fastify, Kysely, dbmate, Postgres 18, `withActor`                                                       | **Same**                                                           | The security model depends on it                        |
| Auth            | Better Auth, mandatory TOTP                                                                             | **Same**, plus optional passkeys                                   | Host is final from day one                              |
| Tenancy         | Multi-tenant, RLS on `tenant_id`                                                                        | **Single organisation** ([D5](#13-decisions))                      | One operator; a second chapter can run its own instance |
| RLS             | By tenant and membership role                                                                           | By module role and channel                                         | No tenancy; the bot is a narrower channel               |
| Tools channel   | Member tokens for an MCP server (ADR-0008)                                                              | The Telegram bot, limited the same way; tokens later               | Volunteers report from their phones                     |
| Public site     | Separate Next app, cache, two replicas                                                                  | Census form app, one replica                                       | A few submissions a day                                 |
| Background work | Worker Deployment fed over HTTP                                                                         | **Kubernetes CronJobs** from the API image                         | Only short periodic jobs; one less long-running pod     |
| Editorial rules | Four-eyes, immutable snapshots, change control                                                          | Dropped                                                            | Nothing is published                                    |
| UI language     | English source, Spanish mandatory                                                                       | **Spanish only**, strings still in next-intl ([D6](#13-decisions)) | Internal tool; a locale can be added later as a file    |
| Replicas        | Two for web and API                                                                                     | One each                                                           | Internal tool; a short restart is acceptable            |

The scaffold is **copied** from aiontheballot (configs, CI workflows, chart layout, `withActor`, Better Auth
wiring, observability package, seal scripts) and the bot from aisafety-newsroom (webhook route, Bot API client),
not shared as dependencies. The repos then evolve separately.

### 10.3 Repository layout

```text
apps/web                Next.js staff UI
apps/api                Fastify API and Telegram webhook; CronJob entrypoints under src/jobs/
apps/forms              Next.js public census form (M2)
packages/db             Kysely factory, generated types, withActor, pools
packages/domain         Pure logic: normalisation, matching, stage and attention rules, bot message parsing, templates
packages/ui             Panda preset, Ark components
packages/i18n           Spanish messages (web and bot)
packages/observability  Sentry privacy options, error relay
packages/mcp            MCP server (M4, if D10)
db/migrations           dbmate SQL, forward-only; db/schema.sql generated
helm-charts/backoffice  Umbrella chart: one subchart per deployable, migration Job, CronJobs
e2e                     Playwright against production builds, with a fake Bot API
docs                    SPEC (this file), then BRIEF, adr/, spec/, runbooks/
```

Rules as aiontheballot's `CLAUDE.md`:

- Only `apps/api` imports `packages/db` (lint rule).
- Migrations are SQL only, forward-only, one concern each.
- Tests sit next to the code. Every new invariant or policy gets its test first.
- Seeds and fixtures are obviously fictional. No real member, export, contact or Airtable link is ever committed.

### 10.4 Jobs

Kubernetes CronJobs with `timeZone: Europe/Madrid`, `concurrencyPolicy: Forbid`, each with its own role's
credentials only:

| Job                      | Schedule                            | Role                            | Milestone              |
| ------------------------ | ----------------------------------- | ------------------------------- | ---------------------- |
| Session and link cleanup | Daily 03:00                         | `auth`                          | M0                     |
| Airtable sync            | Hourly (and on demand from the API) | `ingest`                        | M1, if the spike works |
| Daily digest             | Daily 09:00                         | `app` (system actor, read-only) | M1                     |
| Dialog cleanup           | Hourly                              | `app` (system actor)            | M1                     |
| Retention                | Daily 04:00                         | `app` (system actor)            | M4                     |

## 11. Deployment

Following gitops `docs/app-onboarding.md` and aiontheballot ADR-0001:

- **Gitops entries:** `catalog/apps/backoffice/applicationset.yaml`,
  `clusters/danilupion-com/values/apps/backoffice.yaml`, SealedSecrets under
  `clusters/danilupion-com/resources/apps/backoffice/`, the repo and namespace in `projects/apps.yaml`.
- **Database:** a `pauseai_backoffice` database on the shared `postgresql` instance, its owner and the runtime
  roles through the halyard chart's `extraRoles`.
- **Images:** Harbor project `backoffice`, tags `harbor.danilupion.com/backoffice/<component>:<version>.<sha>`,
  never `:latest`; base images pinned by digest.
- **CI:** pull requests on GitHub-hosted runners; `main` and releases on the `pauseai-en-espanol` self-hosted
  runner, which alone pushes to Harbor. Actions pinned by SHA. CI holds no cluster credentials.
- **Sync order:** Secrets and the ServiceAccount patch (wave -2), the migration Job (Sync hook, wave -1), the rest.
- **Pods:** requests and limits, a restrictive securityContext, `/healthz` probes.
- **NetworkPolicies:** web and forms accept only the gateway. The API accepts the gateway, the web and forms pods
  and the CronJobs, and reaches Postgres, GlitchTip, Mailu, DNS, and the internet on 443 for Telegram and Airtable.
- **Routes:** `gateway-public` for the staff and forms hosts (D4); per-IP rate limits on the auth, form and webhook
  routes through Envoy Gateway's rate-limit service, which already runs.
- **Mail:** Mailu submission, from a `pauseai.es` sender, for invitations, password resets and the digest for
  staff without Telegram.
- **One environment, production.** A demo dataset (fictional) is available locally through `pnpm db:seed`.

## 12. Quality

As aiontheballot:

- **Static checks:** TypeScript strict, no `any`; oxlint type-aware with zero warnings; Prettier; markdownlint at
  120 columns.
- **Tests:**
  - Unit tests for `packages/domain`, especially bot message parsing, matching and attention rules, with
    fictional fixtures.
  - Database tests for RLS, the bot channel's limits, triggers and grants, on Postgres 18.
  - Playwright for the main flows: sign-in with TOTP, linking Telegram, `/alta` through a fake Bot API, claim from
    the team group, quick-add, CSV import, log attempt, census submission, merge. axe on every page.
- **Accessibility:** WCAG 2.2 AA. Stages are never shown by colour alone.
- **Dependencies:** latest stable only, checked on npm when added. Renovate with the 3-day minimum release age.
- **Process:** `pnpm verify` before push; a changeset per change; the RLS matrix updated with every new table.

## 13. Decisions

### Decided

| ID      | Decision                                                                                                                 | By               |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **D1**  | WhatsApp joins and leaves are reported to a Telegram bot by whoever sees them. No WhatsApp integration for now           | Dani, 2026-10-15 |
| **D2**  | Airtable is read through Global's shared view link, kept as configuration (a sealed secret) ([§6.5.1](#651-airtable-m1)) | Dani, 2026-10-15 |
| **D3**  | No mailbox is read: the Airtable view carries the same data as the notification emails                                   | Dani, 2026-10-15 |
| **D4**  | The staff UI is on `gateway-public` with mandatory two-factor (no VPN)                                                   | Dani, 2026-10-15 |
| **D11** | The bot must work for one person. The team group is optional: on when a group is configured                              | Dani, 2026-10-15 |
| —       | Backups are handled in gitops, separately from this plan                                                                 | Dani, 2026-10-15 |
| —       | Legal and privacy calls (D9, D12, the privacy notice) are Dani's, for the association                                    | Dani, 2026-10-15 |

### Still open

Each has a recommendation. Unless you object, the recommendation is what gets built.

| ID      | Decision                                   | Options                                                                       | Recommendation                                                                                                                                       |
| ------- | ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D5**  | Tenancy                                    | Single organisation, or tenant-ready from day one                             | **Single.** Another chapter runs its own instance (role prefix and database name come from config)                                                   |
| **D6**  | UI language                                | Spanish only, or English source with mandatory Spanish                        | **Spanish only**, through next-intl so a locale can be added later                                                                                   |
| **D7**  | Access granularity                         | Module roles, or "a volunteer sees only their own people"                     | **Module roles** for v1; revisit when the team grows past about 8                                                                                    |
| **D8**  | Outreach sending                           | A person sends (handover), or the app sends through Mailu per explicit click  | **A person sends**, as the outreach repo already does                                                                                                |
| **D9**  | Retention                                  | Anonymisation periods per stage                                               | 12 months after leaving or last contact, for `left`, `unresponsive` and `discarded`; Dani to confirm                                                 |
| **D10** | LLM tools (MCP)                            | None; read-only member tokens; tokens that also draft                         | Decide at M4. If yes, as aiontheballot ADR-0008: a person's token, drafts only, and personal data to Anthropic only with the association's agreement |
| **D12** | Telegram as a channel for names and phones | Accept, with the bot deleting messages after saving; or names only in the bot | **Accept**, as designed in [§6.5.2](#652-the-telegram-bot-m1); Dani to confirm                                                                       |

## 14. Open questions

Nothing blocks M0. These get answered along the way:

1. **The shared view (M1's first spike):** does it load without a full browser, does it allow a CSV download, and
   what are its columns? Checked locally with the real link, which is never committed.
2. **The census's lists:** skills and areas to help in, filled in by an admin in settings before the census goes
   out ([§6.7.2](#672-the-form-m2)).
3. **Community chats** for the bot's chat picker: optional; a free-text chat name works too.

Unless told otherwise, `welcomed` means "first conversation done and pointed to a team or a first task".

## 15. Alternatives considered

- **Reading WhatsApp automatically.** Meta's official Groups API only manages groups the business itself created,
  capped at 8 participants, so it can't read an existing community. Unofficial clients (Baileys) could, from a
  dedicated number made admin, but break WhatsApp's terms, risk that number being banned, and hold a session that
  can read every chat. Dropped in favour of the bot (D1). Revisit only if reports are regularly missed.
- **Reading the notification emails.** Not needed: the Airtable view has the same data (D3).
- **A spreadsheet shared by the team:** fastest to start, but it can't capture sources automatically, has no
  per-row access control or history, and phone numbers end up in one more place.
- **A self-hosted open-source CRM** (Twenty, CiviCRM): pipelines out of the box, but no bot or census flow, a
  different stack and security model to operate, and extending it means learning its plugin system rather than
  using the patterns the team already has.
- **Global's Airtable as the system of record:** we don't own it, and community-only arrivals and the census would
  still need a home.

## Sources checked for this draft

- WhatsApp Groups API limits (8 participants, groups created by the business only):
  [Periskope](https://periskope.app/blog/whatsapp-groups-api-requirements-eligibility-limits),
  [Unipile](https://www.unipile.com/whatsapp-group-api/).
- Telegram Bot API: `setWebhook`'s `secret_token` ([Bot API](https://core.telegram.org/bots/api#setwebhook));
  bots deleting incoming messages in private chats within 48 hours
  ([`deleteMessage`, as mirrored by aiogram](https://docs.aiogram.dev/en/latest/api/methods/delete_message.html)).
- Airtable share links (anyone with the link can read the view unless it has a password or domain restriction;
  CSV download depends on "Allow viewers to copy data out of this view"):
  [Airtable support](https://support.airtable.com/docs/using-the-view-share-menu-in-airtable). Reading a shared
  view without the API is undocumented; others do it (for example
  [an Apify actor](https://apify.com/rl1987/airtable-exporter)).
- Minors' consent at 14 in Spain (LOPDGDD art. 7):
  [AEPD FAQ](https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales).
  LOPDGDD art. 9.1 is cited from memory: check the wording in the BOE before relying on it.
- Global's privacy notice (sharing with national chapters): `pauseai-website/src/posts/privacy.md`.
- aiontheballot ADR-0001, ADR-0002, ADR-0003, ADR-0008; aisafety-newsroom `SPEC.md` (R-CAP-1, R-CAP-2); gitops
  `docs/app-onboarding.md`; outreach `docs/PLAYBOOK.md`.
