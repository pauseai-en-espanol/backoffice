# Outreach

- **Status:** Drafted from the specification (v3); reviewed by Dani before M3 starts.
- **Relates to:** [BRIEF](../BRIEF.md) G4; [data model](data-model.md); the `outreach` repo's
  `docs/PLAYBOOK.md`

A shared pipeline for organisations and relevant people: who to contact, why, who owns them, and where each
relationship stands.

## 1. Concepts

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

## 2. Stages

**Relationship (per contact):** `identified` → `qualified` → `contacted` → `engaged` (replied or met) → `ally`, or
`declined`, or `dormant`.

**Target (per contact in a campaign):** `pending` → `ready` (rendered, reviewed) → `sent` → `replied` → `meeting`;
or `declined`, `bounced`, `no_response`. Each target has an owner, a priority (1 goes first; none sorts last), a
next action and its dates. These are the outreach CLI's statuses, so its tracking sheets import as they are.
A target starts in the queue (`pending`, `ready` or `skip`, nothing dated); one already written to comes in only
through the import, which is an admin's. Once someone wrote to it, it never goes back to the queue.

## 3. Sending: a person always sends

The outreach repo's rule carries over: **nothing in this app sends outreach mail.**

- The app renders each email from the template and the contact. It **fails** on an unresolved merge field, an
  unknown anchor, or a contact still marked `needs_review`.
- **"Siguiente"** gives the owner the next target in the queue: a `mailto:` link, copy buttons for recipient,
  subject and body, or a `wa.me` link where WhatsApp is the right channel. Then it asks whether it went out. "Sí"
  logs `sent` with the date.
- Greetings default to neutral ("Estimado/a"). A gendered treatment is set only when a person has verified it, and
  is never inferred from a name.
- Every figure in a template must come from an anchor with a source.

Sending through Mailu from the app is a later decision (D8 in [PLAN](../PLAN.md#open-decisions)).

## 4. Import from the outreach repo

A one-off importer reads `campaigns/<slug>/` (`campaign.yaml`, `contacts/contacts.yaml`, `templates/*`,
`anchors.yaml`, `tracking.csv`) into a campaign, its contacts and targets. After that the repo becomes the archive
for that campaign, and new campaigns start in the app.

An admin picks the files in the staff app (Campañas, "Importar del repositorio"); the page sends their text, and a
dry run shows the counts and problems before anything is written. How the files map:

- **`campaign.yaml`:** `slug`, `name`, `language`, `fromName`, `fromEmail`, `signature`. A slug already in use stops
  the import: a campaign is imported once.
- **Organisations:** one per distinct `org`, reused across campaigns by name; their kind starts as `other`, for staff
  to set.
- **Contacts:** every field carries over (`web` becomes the website, `source` the first source). The reason they
  matter is the campaign's list itself ("Del listado de la campaña «…»"), since the repo recorded none; a contact
  without a `source` is imported with `needs_review` set, as is one the repo marked `needsReview`. A phone or website
  that doesn't parse is dropped, with a warning. The contact's `id` is kept as its external reference.
- **Targets:** every contact not on hold, with its `priority` and `anchor`, in the status `tracking.csv` gives it
  (`pending` if it has no row), with its dates and notes. A held contact is imported but not made a target, unless
  the sheet shows someone already wrote to them: that history is kept, and the hold keeps them out of every queue. The
  furthest status moves the relationship: `sent` or `bounced` to `contacted`, `replied` or `meeting` to `engaged`,
  `declined` to `declined`. The `owner` column is kept in the target's notes, since repo names aren't accounts.
- **Templates and anchors:** `tier-a.md` and `tier-b.md` (front matter: `subject`, `maxWords`, `sources`, `notes`),
  and `anchors.yaml`. A template field that isn't a merge field, or an anchor without a source, is a problem.

## 5. Views

Campañas (list and per-campaign board by target status), Contactos (directory with filters by tier, territory,
organisation type and relationship), Organizaciones, Plantillas (with a rendered preview per contact), and the
Siguiente queue.
