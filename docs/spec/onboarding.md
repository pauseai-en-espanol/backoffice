# Onboarding

- **Status:** Drafted from the specification (v3); reviewed by Dani before M1 starts.
- **Relates to:** [BRIEF](../BRIEF.md) G1–G3; [ADR-0004](../adr/0004-telegram-bot.md) (the bot),
  [ADR-0005](../adr/0005-airtable-intake.md) (Airtable); [data model](data-model.md);
  [personal data](personal-data.md)

How a person moves from arriving to contributing, and what the team sees and does along the way. The bot's and
Airtable's mechanics and security are in their ADRs; this spec says what they do for onboarding.

## 1. Concepts

- **Person.** One human, whatever the number of sources they came from. It holds the profile (names, location,
  languages, skills, availability, interests, consent). Someone reported through the bot or quick-add may have no
  name yet, only a phone or an email (PLAN R37); a later report, the census or a merge fills it, and a name, once
  known, is never emptied.
- **Identity.** A way to recognise a person: an email, a phone number (E.164), an Airtable record ID. A normalised
  identity belongs to at most one person, which is what prevents duplicates.
- **Source.** Where we learned about a person: `airtable`, `telegram` (reported to the bot), `census`, `manual`
  (the web app), `csv`. A person keeps all of them, each with a date and who reported it.
- **Community presence.** The periods during which a person was in the WhatsApp community: joined at, left at,
  who reported it. Optionally the chat they joined, from a list in settings (a local chat hints at a province).
  Leaving is a signal, not a deletion.
- **Stage.** Where the person is in onboarding ([§2](#2-stages)).
- **Owner.** The onboarder responsible for the person. It can be empty: that is exactly the "Sin asignar" queue.
- **Next action.** Free text plus a due date ("Llamar el jueves", 2026-10-20). Every person in an open stage
  should have one.
- **Timeline.** An append-only history per person: notes, contact attempts with their channel and outcome, stage
  and owner changes, joins and leaves, form submissions, imports, merges. It is what lets someone else pick up a
  person.

## 2. Stages

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
- Unless told otherwise, `welcomed` means "first conversation done and pointed to a team or a first task".

## 3. "Needs attention" rules

Computed on read, never stored. Each rule has a Spanish reason shown on the person's card and in the bot:

1. In `new` with no owner. ("Sin asignar")
2. Next action due today or overdue. ("Acción pendiente")
3. In an open stage (`new`, `contacting`, `talking`, `welcomed`) with no next action. ("Sin siguiente paso")
4. In `contacting` with the last attempt more than 5 days ago. ("Toca seguimiento")
5. Left the community while in an open stage or `active`. ("Ha salido de la comunidad")
6. A possible duplicate is waiting for review. ("Posible duplicado")

The thresholds live in settings, not in code.

## 4. Views

Reporting happens mostly through the bot. The web app is where the work is followed and done, and it is
mobile-first all the same.

- **Hoy:** my people needing attention, then the unassigned queue with a "Me lo quedo" (claim) button.
- **Embudo:** a board by stage. Filters: owner, province, source, in the community or not, needs attention.
- **Personas:** a searchable list (name, email, phone; typo-tolerant). Exportable to CSV by admins only, and
  every export is audited.
- **Persona:** profile, identities, community presence, timeline. Quick actions: log a contact attempt (channel
  and outcome presets), set the next action, change stage, assign, add a note, open a WhatsApp chat with a
  prepared message ([§7.3](#73-whatsapp-handover-links)), copy the email address.
- **Añadir rápido:** a phone or email, the name if known, source, optional note. Duplicates are checked as you
  type.
- **Bandeja:** records awaiting a decision: possible duplicates and conflicting values.
- **Importar:** "Sincronizar Airtable ahora" with the last run's result; upload a CSV, preview, dry-run diff,
  apply ([§5.3](#53-web-and-csv-m1)).
- **Censo:** progress of the census, and the queue of personal links still to send ([§7](#7-the-census)).
- **Ajustes → Telegram:** link or unlink my Telegram account.
- **Panel:** counts by stage, arrivals per week by source, time to first contact, unassigned for more than
  48 hours.

## 5. Intake sources

Every source produces **intake records**. Matching ([§6](#6-matching-and-merging)) turns each one into a new
person, an update to an existing person, or an item in the Bandeja. Every import is **idempotent**: re-importing
the same file or re-running a sync changes nothing.

### 5.1 Airtable (M1)

Spain's signups are in an Airtable view that Global shares with us by link. Global's notification emails carry
the same data, so the app reads no mail (D3). How the view is read, and why the link is a credential, is in
[ADR-0005](../adr/0005-airtable-intake.md). For onboarding:

- **When:** hourly, plus on demand from `/sync` (`/sincronizar`) in the bot or a button in Importar.
- **Idempotent:** the Airtable record ID is the identity.
- **Fails loudly:** a run that can't read the view, or finds the columns changed, imports nothing and tells the
  admins through the bot. The CSV import ([§5.3](#53-web-and-csv-m1)) is the fallback.
- Only mapped fields are copied, never the rest of Global's record.

### 5.2 The Telegram bot (M1)

This is how WhatsApp arrivals and leaves enter the system, and how the team hears about every arrival. Linking
an account, the webhook and what the bot may do are in [ADR-0004](../adr/0004-telegram-bot.md).

**Commands.** These work in a private chat with the bot, by their English name or their Spanish one, exactly the
same (PLAN R38); Telegram's menu shows the Spanish names to people whose Telegram is in Spanish, the English ones to
everyone else. Replies are in Spanish, and name a command by both names, English first: "/joined (/alta)".

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

- **Quick-add** in the web app, for whoever prefers it to the bot. A phone or an email is required; the name only if
  known (PLAN R37).
- **CSV import** with a column mapping, a preview, a dry run and an apply step. It covers any one-off list, and
  Airtable whenever the shared-view sync breaks.

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

There is no list of the community's members to import, so they come in three ways:

1. **Airtable:** those who signed up through Global are already there after the first import.
2. **Admins and volunteers** add the people they know, through the bot or the web app, as `to_triage`, or straight
   to `active` or `welcomed`.
3. **The census itself:** a submission from someone not yet in the system creates them in `to_triage`.

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
