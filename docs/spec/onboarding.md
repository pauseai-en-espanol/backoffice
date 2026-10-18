# Onboarding

- **Status:** Drafted from the specification (v3); reviewed by Dani before M1 starts.
- **Relates to:** [BRIEF](../BRIEF.md) G1–G3; [ADR-0004](../adr/0004-telegram-bot.md) (the bot),
  [ADR-0005](../adr/0005-airtable-intake.md) (Airtable); [data model](data-model.md);
  [personal data](personal-data.md)

How a person moves from arriving to contributing, and what the team sees and does along the way. The bot's and
Airtable's mechanics and security are in their ADRs; this spec says what they do for onboarding.

## 1. Concepts

- **Person.** One human, whatever the number of sources they came from. It holds the profile (names, location,
  languages, skills, availability, interests, consent). Someone reported through the bot or quick-add, or imported
  from a CSV, may have no name yet, only a phone or an email (PLAN R37, R56); a later report, the census or a merge
  fills it, and a name, once known, is never emptied.
- **Identity.** A way to recognise a person: an email, a phone number (E.164), a Discord username (2 to 32 lowercase
  letters, digits, `_` and `.`, never `..`; PLAN M5), an Airtable record ID. A normalised identity belongs to at most
  one person, which is what prevents duplicates.
- **Source.** How a record came into the backoffice: `airtable`, `telegram` (reported to the bot), `census`,
  `manual` (the web app), `csv`. A person keeps all of them, each with a date and who reported it, for the history
  ("Añadido desde …"); since PLAN R58 it is neither shown as a field nor filtered on: the channel is.
- **Sign-up** (PLAN M5, R58; D17). "Fecha de alta": the one day someone joined us, whatever the way in (Global's
  form, the WhatsApp group, Discord…), by default the day they're added, never in the future, and empty ("No se
  sabe") when nobody knows, as for older members entered after the fact (Dani, 2026-10-16). "Canal de alta": the way
  in, from a list admins edit in Ajustes (WhatsApp, Email, Discord, Formulario de PauseAI Global, Otro to start),
  never free text; the bot's reports say WhatsApp, Global's form says itself, Añadir asks, a CSV may bring a column.
  It is the one way in people are shown, filtered and counted by (Dani, 2026-10-18: "entro por and llego por ...
  should be merged"); people from before it took theirs from their source (migration `20261018120000`).
- **Community presence.** The periods (stays) during which a person was in the WhatsApp community: the day they
  joined (unknown for someone in since before the records), the day they left, who reported each. Optionally the chat
  they joined, from a list in settings (a local chat hints at a province). Leaving is a signal, not a deletion. Joins
  and leaves go into the timeline on their own day (PLAN R56).
- **Stage.** Where the person is in onboarding ([§2](#2-stages)).
- **Owner.** The onboarder responsible for the person. It can be empty: that is exactly the "Sin asignar" queue.
- **Next action.** Free text plus a due date ("Llamar el jueves", 2026-10-20). Every person in an open stage
  should have one.
- **Timeline.** An append-only history per person: notes, contact attempts with their channel and outcome, stage
  and owner changes, joins and leaves, form submissions, imports, merges. It is what lets someone else pick up a
  person. Attempts, notes and stage changes made by hand may say the day they happened ("Fecha", never in the
  future; PLAN M5): the history goes by that day, and still shows when each was written and by whom.

## 2. Stages

Identifiers are English in the database. Labels are Spanish in the UI.

| Stage          | UI label         | Meaning                                                        | Leaves when                           |
| -------------- | ---------------- | -------------------------------------------------------------- | ------------------------------------- |
| `new`          | Nuevo            | Arrived, or already there and not reviewed; nobody has engaged | The first contact attempt is logged   |
| `contacting`   | En contacto      | We've written; whether they replied is on each attempt         | Welcome done, or the attempts run out |
| `welcomed`     | Bienvenida hecha | First conversation done; pointed to a team or a first task     | They contribute                       |
| `active`       | Activo           | Contributing                                                   | No activity for 90 days               |
| `dormant`      | Inactivo         | Was active or welcomed, quiet for a long time                  | They come back                        |
| `unresponsive` | Sin respuesta    | Three attempts over at least 14 days without reply             | They reply                            |
| `left`         | Baja             | Left the community or asked to leave                           | They come back                        |
| `discarded`    | Descartado       | Spam, duplicate or not a fit                                   | Never (reopened manually)             |

- Any stage can move to any other by hand. The table is the expected path, not a state machine that blocks
  people.
- Every change goes to the timeline with who made it.
- `left` and `discarded` close the next action. `unresponsive` keeps the person reachable for a later campaign.
- Unless told otherwise, `welcomed` means "first conversation done and pointed to a team or a first task".
- **Fewer since PLAN M5** (Dani, 2026-10-16): `to_triage` (Por clasificar) folded into `new`, and `talking` (En
  conversación) into `contacting`, now "En contacto". People in them moved with them; older history keeps the old
  names, with a line saying the stages were simplified. A reply no longer moves anyone out of `contacting`; it brings
  someone `unresponsive` back to it.

## 3. "Needs attention" rules

Computed on read, never stored. Each rule has a Spanish reason shown on the person's card and in the bot:

1. In `new` with no owner, arrived in the last 30 days (someone whose arrival nobody knows never is). ("Sin
   asignar")
2. Next action due today or overdue. ("Acción pendiente")
3. In an open stage (`new`, `contacting`, `welcomed`) with no next action. ("Sin siguiente paso")
4. In `contacting`, and the latest attempt (by the day it happened) went unanswered more than 5 days ago. ("Toca
   seguimiento")
5. Left the community while in an open stage or `active`. ("Ha salido de la comunidad")
6. A possible duplicate is waiting for review. ("Posible duplicado")

The thresholds live in settings, not in code (but for the 30 days of "Sin asignar"), and so does how far back an
arrival may be for the team group to hear of it: a week by default (ADR-0004). "Sin respuesta" (the stage) comes
from the attempts since the last reply, counted by the day they happened.

## 4. Views

Reporting happens mostly through the bot. The web app is where the work is followed and done, and it is
mobile-first all the same.

Every **card** (Hoy, Personas, the Onboarding Pipeline, the Bandeja, Censo) says who someone is (PLAN M5, step 4):
the name with the province ("Maite (Madrid)"), the team's one-line internal summary ("Resumen interno", in the
profile; staff only, never sent to Telegram, at most 200 characters), and what is missing in plain words ("Falta:
correo · qué quiere hacer": a phone, an email, the province, an area they'd like to help in). Someone who left or
was discarded is asked nothing. The person's page shows the summary and the same line under their name.

Someone on the team (PLAN M5, step 5) shows "Equipo" on their card: an admin links their team account to their
person, from the person's page ("Cuenta del equipo"), where the account sharing their email comes first, or from
Equipo, which suggests it. Personas and the board filter by it ("Del equipo"). The link grants nothing, and a
deactivated account keeps it without the badge.

- **Hoy:** my people needing attention, then the unassigned queue with a "Me lo quedo" (claim) button.
- **Onboarding Pipeline** (`/pipeline`; Embudo until D14): a board by stage. Filters: owner, province, "Canal de
  alta", "Fecha de alta" known or not, in the community or not, needs attention.
- **Personas:** a searchable list (name, email, phone; typo-tolerant). Exportable to CSV by admins only, and
  every export is audited. How many it finds is said above it, and a counter for each stage, with the rest of the
  filters, is that stage's filter; the other filters are folded under "Más filtros", and those on are listed, each
  with a link that takes it off (PLAN R59).
- **Persona:** profile, identities, community presence, timeline. Quick actions: log a contact attempt (channel
  and outcome presets), set the next action, change stage, assign, add a note, open a WhatsApp chat with a
  prepared message ([§7.3](#73-whatsapp-handover-links)), copy the email address. Laid out to read first and edit in
  place (PLAN R57): who they are, with "Me lo quedo" and WhatsApp; then where they are (stage, owner, next step, each
  changed where it is shown), one place to write an attempt or a note, and the history, its latest ten in view;
  beside it, a card each for contact, profile, sign-up and community, and census, edited in the card; merging, the team
  account and their data under "Más acciones". The sign-up's day is written once: the card "Alta y comunidad" tells
  only what changed in the group since ("Salió del grupo el …", "Volvió al grupo el …"; PLAN R58).
- **Añadir rápido:** a phone, an email or a Discord username, the name if known, "Canal de alta", "Fecha de alta"
  (today, emptied when nobody knows), optional note. Duplicates are checked as you type.
- **Bandeja:** records awaiting a decision: possible duplicates and conflicting values. A possible duplicate is
  compared, row by row, with each record it looks like, phones and emails included but for a census answer's, with
  "igual" where they agree; when the one it is isn't among them, it is searched for and attached to whoever is found
  (a census answer, only to its candidates; PLAN R60).
- **Importar:** "Sincronizar Airtable ahora" with the last run's result, while an admin has the sync on in Ajustes;
  upload a CSV, preview, dry-run diff, apply ([§5.3](#53-web-and-csv-m1)).
- **Censo:** progress of the census, and the queue of personal links still to send ([§7](#7-the-census)), oldest
  first, 50 at a time, searchable as Personas is (PLAN R47).
- **Ajustes → Telegram:** link or unlink my Telegram account.
- **Ajustes → Formulario de PauseAI Global (Airtable)**, admins only: paste Global's view link, which is never shown
  again ("Configurado el … por …"), replace or remove it, turn the sync on or off, and see how its last run went
  ([§5.1](#51-airtable-m1)).
- **Panel:** counts by stage, sign-ups per week (by "Fecha de alta") by "Canal de alta", time to first contact,
  unassigned for more than 48 hours; people with no sign-up day are left out of the weeks and the waits, and counted
  in a line of their own.

## 5. Intake sources

Every source produces **intake records**. Matching ([§6](#6-matching-and-merging)) turns each one into a new
person, an update to an existing person, or an item in the Bandeja. Every import is **idempotent**: re-importing
the same file or re-running a sync changes nothing.

### 5.1 Airtable (M1)

Spain's signups are in an Airtable view that Global shares with us by link. Global's notification emails carry
the same data, so the app reads no mail (D3). How the view is read, and why the link is a credential, is in
[ADR-0005](../adr/0005-airtable-intake.md). For onboarding:

- **Who turns it on:** an admin, in Ajustes, by pasting the view's link and switching the sync on; off, or without
  a link, nothing syncs (PLAN R49).
- **When:** hourly, plus on demand from `/sync` (`/sincronizar`) in the bot or a button in Importar.
- **Idempotent:** the Airtable record ID is the identity.
- **Fails loudly:** a run that can't read the view, or finds the columns changed, imports nothing and tells the
  admins through the bot. The CSV import ([§5.3](#53-web-and-csv-m1)) is the fallback.
- Only mapped fields are copied, never the rest of Global's record.

### 5.2 The Telegram bot (M1)

This is how WhatsApp arrivals and leaves enter the system, and how the team hears about every arrival. Linking
an account, the webhook and what the bot may do are in [ADR-0004](../adr/0004-telegram-bot.md).

**Commands.** These work in a private chat with the bot, by their English name or their Spanish one, exactly the
same (PLAN R38); Telegram's menu shows the English names to people whose Telegram is in English, the Spanish ones
to everyone else. Replies are in Spanish, and name a command by both names, English first: "/joined (/alta)".

| Command                        | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/joined` (`/alta`)            | Reports someone who joined. The bot reads name, phone or email, chat and note from one message, shows any likely match ("¿Es Ana G., Nuevo, sin asignar?") and confirms. A phone or an email alone is enough: most reports carry only a phone, and the person is saved without a name ("Sin nombre") for staff to name later (PLAN R37). It asks only for what's missing: who, when there's neither a name nor a contact; a phone or email, when there's only a name ("Sin contacto" goes on without one) |
| `/left` (`/baja`)              | Reports someone who left. Search by phone or name, pick from buttons, confirm                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/mine` (`/mios`)              | My people needing attention: name, reason, link to the web app                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/unassigned` (`/libres`)      | The unassigned queue, with a "Me lo quedo" button on each                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `/search` (`/buscar`) `<text>` | Name, stage and owner of the matches, with links. No contact details                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `/sync` (`/sincronizar`)       | Runs the Airtable sync now and reports how many people came in                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/help` (`/ayuda`)             | The commands, by both names                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

- `/cancel` (`/cancelar`) drops the conversation in progress.
- A message that isn't a command but contains a phone number or email is taken as a draft `/joined`, and is only
  saved after confirmation.
- **Contact details don't stay in the chat.** After a `/joined` is saved, the bot deletes the reporter's messages
  that contained the phone or email. Its own replies never repeat contact details.
- The state of a conversation in progress lives in the database and expires after an hour.

### 5.3 Web and CSV (M1)

- **Quick-add** in the web app, for whoever prefers it to the bot. A phone, an email or a Discord username is
  required; the name only if known (PLAN R37, M5).
- **CSV columns for older members** (PLAN M5): "Fecha de alta" (dd/mm/yyyy or yyyy-mm-dd; an empty cell in a mapped
  column means nobody knows), "Canal de alta" (matched to the list by name) and Discord, with the stage, so they can be
  retrofilled in bulk.
- **CSV import** with a column mapping, a preview, a dry run and an apply step. It covers any one-off list, and
  Airtable whenever the shared-view sync breaks. A row needs a name, or a phone, an email or a Discord username to
  find them by (PLAN R56: most of the group's numbers are in nobody's contacts).
- **A stay in the group per row** (PLAN R56): "Entrada al grupo" (empty, when the column is there: in since before
  anyone knows) and "Salida del grupo" (empty: still in), and the stage Baja for someone who left. Someone who came
  back is a row per stay, one person by their phone. A stay already recorded is never recorded twice; a later file
  closes the stay that ended since, and an older one never reopens it.
- **The WhatsApp group's history** (PLAN R56, D16): the group's export, with the exporter's Google Contacts for the
  numbers, turned into that CSV on the exporter's laptop (`pnpm whatsapp:csv`), so none of the chat's messages reach
  the backoffice ([runbook](../runbooks/importing-the-whatsapp-history.md)). Those who left come in as Baja.

## 6. Matching and merging

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

## 7. The census

How the 106 are recovered (G3), and how every new member is profiled afterwards.

### 7.1 How existing members get in

There is no list of the community's members to import, so they come in four ways:

1. **Airtable:** those who signed up through Global are already there after the first import.
2. **Admins and volunteers** add the people they know, through the bot or the web app, as `new`, or straight to
   `active` or `welcomed`, with "Fecha de alta" empty when nobody knows when they joined (PLAN M5).
3. **The census itself:** a submission from someone not yet in the system creates them in `new`.
4. **The WhatsApp group's history** (PLAN R56): everyone who joined, left or wrote since the exporting phone was
   added, with their stays ([§5.3](#53-web-and-csv-m1)). Members since before who never wrote aren't in it.

### 7.2 The form (M2)

- Fields: name, preferred name, email, phone, province and town, languages, skills, availability (occasional,
  under 2 h a week, 2–5 h, over 5 h), what they would like to help with, how they heard of PauseAI, pronouns
  (optional, free text). Consent: contact by email, contact by WhatsApp, and the privacy notice.
- **Two lists are edited by an admin in settings**, not in code: skills (diseño, redes sociales, programación…)
  and areas to help in (comunicación, eventos, política, divulgación…), each plus "otra". They start as
  placeholders and are filled in before the census goes out.
- **Age:** the form asks the person to confirm they are 14 or older. In Spain a minor under 14 can't consent to
  this alone (LOPDGDD art. 7), so the form doesn't accept them and says to talk to the team
  ([personal data §4](personal-data.md#4-minors)).
- **Generic link**, posted in the community's announcements: the submission is matched by phone or email. It
  **can't overwrite** existing data. Where it would, the change goes to the Bandeja
  ([§6](#6-matching-and-merging)), since anyone can type anyone's number.
- **Personal link**, one per person, for follow-ups: the person can update their own profile directly. It is
  valid for 30 days, stored only as a hash, and carried in the URL fragment so no server log records it.
- Every submission is a timeline event, and sets `profile_completed_at`.
- The form's public surface (no sessions, no cookies, rate limits, honeypot, token format) is in
  [ADR-0002 §7](../adr/0002-authorization-and-data-protection.md#7-public-surfaces).

### 7.3 WhatsApp handover links

For personal links and onboarding messages, the app builds a `https://wa.me/<number>?text=<message>` link with the
message prepared from a template. The onboarder taps it, WhatsApp opens with the message ready, and they press
send. Back in the app they confirm "Enviado", which logs the attempt. Nothing is sent automatically, and the
message comes from a real person's number, which is also what makes a reply likely.

The templates are the team's, written in the staff app's **Mensajes** (PLAN M5, D15), not in code: the welcome (a
person's page) and the census link's (Censo), several per purpose, each with a title, offered in the order they were
written, the first already picked. Their placeholders are `{nombre}` (the name to greet them by), `{yo}` (the
onboarder's name) and, for the census link, `{enlace}`, which it must carry; any other brace is refused as it's typed
and by the database. A template that uses `{nombre}` also says how it reads for someone saved without a name (PLAN
R37). Each change adds a version, and the attempt logged by "Enviado" names the template and version that went out,
as the census link does. A template is retired, never deleted. With none in use, the code's own neutral message goes
out.

## 8. Notifications

- **Team group (optional, D11):** the bot posts each new arrival, from any source, to the onboarding team's
  Telegram group: name, source, province if known, and the buttons "Me lo quedo" and "Abrir". When someone claims
  it, the message is edited to show who. **No contact details** are posted in the group. Only linked staff can
  press the buttons; anyone else gets "No autorizado".
- **Daily digest** at 09:00 Europe/Madrid, by Telegram to each linked onboarder with something pending (by email
  to those without Telegram): their people needing attention, the size of the unassigned queue, and yesterday's
  arrivals. Nothing is sent when nothing is pending.

## 9. Open questions

- **Community chats** for the bot's chat picker: optional; a free-text chat name works too.
- **The census's lists:** skills and areas to help in, filled in by an admin in settings before the census goes
  out ([§7.2](#72-the-form-m2)).
