# ADR-0005: Airtable signups through the shared view link

- **Status:** Accepted (Dani, 2026-10-15: D2, "the shared link is all I have; I think it should be configuration";
  D3, the Airtable view carries the same data as the emails). Reading the view is gated on M1's first spike.
  **Amended 2026-10-17** (Dani: "i think this should be a configuration or something in the web (maybe only for
  admins)", then "yes, change ADR-0005 accordingly"; PLAN R49): the link moves from a sealed secret in gitops to the
  database, set by admins in Ajustes, encrypted with a key that stays in gitops (decision 1, option 3c).
- **Date:** 2026-10-15; amended 2026-10-17
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G2, §5; [ADR-0001 §2](0001-hosting-and-delivery.md#2-jobs) (the sync job),
  [ADR-0002 §2](0002-authorization-and-data-protection.md#2-database-roles) (the `ingest` role);
  [onboarding spec §5](../spec/onboarding.md#5-intake-sources); [personal data §5](../spec/personal-data.md#5-globals-data)

## Context

- Spain's signups through Global's join form are in an Airtable view that Global shares with us by link. Global's
  notification emails carry the same data.
- **The shared link is all we have.** No API token, no account on Global's base.
- Anyone with a shared view link can read the view unless it has a password or a domain restriction. Whether
  viewers can download a CSV depends on the view's "Allow viewers to copy data out of this view" setting
  ([Airtable support](https://support.airtable.com/docs/using-the-view-share-menu-in-airtable); checked
  2026-10-15).
- Reading a shared view without the API is undocumented. Others do it (for example
  [an Apify actor](https://apify.com/rl1987/airtable-exporter)). Airtable can change or block it at any time, and
  its terms may not allow it.
- Global's privacy notice says signups may be shared with the national chapter (`pauseai-website`,
  `src/posts/privacy.md`).

## Options considered

1. **Where signups come from.**
   - (a) Reading Global's notification emails from a mailbox: a mailbox to secure and parse, for the same data
     (D3 rules it out).
   - (b) **The Airtable view.**
   - (c) Global's Airtable as the system of record: we don't own it, and community-only arrivals and the census
     would still need a home.
2. **How the view is read.**
   - (a) Airtable's API: needs a token Global hasn't given.
   - (b) **The shared view link, read the way a browser does** (its records, or its CSV download if the view
     allows one), if a spike shows it works without a full browser.
   - (c) A headless browser: heavy, and the same fragility.
   - (d) **Manual CSV import**: someone opens the link, downloads the CSV and uploads it.
3. **Where the link lives.** (a) In the database, editable in the UI. (b) A sealed secret in gitops, read by the
   sync. (c) **In the database, set by admins in the UI, encrypted with a key sealed in gitops, and never shown
   again.**

Dani chose 1b (D3) and 3b (D2), then 3c (2026-10-17): with 3b, setting or changing the link took a terminal, the
seal script and a gitops push, so in practice the sync was never turned on. 2b is built if the spike succeeds; 2d is
always there, and is the route if the spike needs a headless browser (2c is not built). 2a replaces 2b behind the same
interface if Global ever grants a read-only token.

## Decision

1. **The link is configuration, set in the web by admins** (D2, amended 2026-10-17). In Ajustes, an admin pastes
   Global's view link, turns the sync on or off, and sees how its last run went (when, the counts, or why it imported
   nothing). When Global changes the link, an admin pastes the new one; nothing in gitops or the code changes.
   - **Encrypted at rest** (`app.airtable_sync.link_ciphertext`): the API seals it with AES-256-GCM before it
     reaches Postgres (a fresh nonce each time, the purpose as associated data), with `AIRTABLE_LINK_KEY`, 32 random
     bytes generated and sealed in gitops by `scripts/seal-airtable-key.sh`, which no one types or sees. The key never
     reaches the database, so a backup or a dump holds no usable link. A new key can't open the old ciphertext: the
     sync then fails as `key` and an admin pastes the link again.
   - **Write-only:** the app role may set or clear the column but not select it (a column grant), so no staff route
     can return the link or its ciphertext, to admins either; Ajustes says only who set it and when.
   - **Admins only:** row-level security lets admins change the row; onboarding staff read whether the sync is on
     (Importar), never the link; nobody else, and never the bot.
   - **Read only by the sync, only while it's on:** `private.airtable_link()`, for the ingest role, returns the
     ciphertext while the sync is on, and nothing otherwise; the sync opens it with the key. Off, or without a link,
     the hourly job says so and does nothing.
   - **Audited without its value:** the column is marked personal data, so `private.audit` records that it changed
     and who changed it, never the ciphertext. Who set it, and when, the database records itself (a trigger), not the
     caller; removing the link turns the sync off, and a new link starts with no last run.
2. **The link is a credential.** Anyone holding it reads every Spain signup. It is never committed, logged, printed,
   shown in the UI after it is saved, or pasted where others can see it; the only place a person types it is Ajustes.
   Only an `https://airtable.com/…/shr…` link is accepted. Errors and the recorded failures name a kind (`link`,
   `page`, `data`, `columns`, `key`, `database`), never a message that could hold it. Fixtures use fictional views.
3. **The spike comes first in M1.** Run locally against the real link, which is never committed, it answers: does
   the view load without a full browser, does it allow a CSV download, and what are its columns? It records the
   column names. If it needs a headless browser, the sync isn't built and the CSV import is the route.

   **Result (2026-10-15, structure and counts only; no record's values were read):** the share page loads with a
   plain request and embeds a signed URL for the view's data (`/v0.3/view/viw…/readSharedViewData`, its
   `accessPolicy` signed by Airtable), which answers JSON with the table's columns and rows. No browser is needed,
   so the sync is built (`apps/api/src/imports/airtable.ts`). The share allows `downloadCsv`, so the CSV import is
   a real fallback. The view had 118 rows, all with Country = Spain, and far more columns than we map (Bio, photo,
   Discord, stipends, payments…). The sync keeps only these: `Full name`, `Email`, `Email 2`, `Phone`, `City`,
   `Country` (since PLAN R74, kept as its ISO code), `Languages`, `Discovery method of PAI`; it reads `duplicate`
   (Global's own flag, 8 rows) and `GDPR chapter share permission` (ticked on 43 rows), which can leave rows out
   (R14). Required: `Full name` and `Email`; if either disappears, the run fails and imports nothing.

4. **The sync** runs as `pauseai_backoffice_ingest`, which may only execute the sync's three functions:
   `private.airtable_link()` (the sealed link, while the sync is on), `private.ingest_airtable(records)` (it inserts
   the import run and the intake records and runs the matcher, as the owner) and `private.airtable_ran(failure,
counts)` (how a run went, for Ajustes); no table grants. The API runs it on demand with the same key:
   - **When:** hourly (a CronJob), plus on demand from `/sync` (`/sincronizar`) in the bot or a button in Importar. A Postgres
     advisory lock stops two runs overlapping.
   - **Idempotent:** the Airtable record ID is the identity; re-running a sync changes nothing.
   - **Fails loudly:** a run that can't read the view, or finds the columns changed, imports nothing and tells the
     admins through the bot.
   - **Minimal:** only mapped fields are copied, never the rest of Global's record.
   - **Permission (PLAN R14):** every row of the view is imported: the view is what Global shares with the chapter
     (Dani, 2026-10-16). Setting `AIRTABLE_REQUIRE_CHAPTER_PERMISSION` to `true` would leave out the rows without
     Global's `GDPR chapter share permission` ticked, and only count them.
5. **The CSV import** in the web app ([onboarding §5.3](../spec/onboarding.md#53-web-and-csv-m1)) is the fallback
   whenever the shared-view sync breaks.
6. **An API reader** replaces the shared-view reader behind the same interface if Global grants a read-only API
   token.
7. **We never write back** to Global's Airtable.

## Consequences

- **Easier:** signups arrive within the hour with no one copying them; nothing waits on Global.
- **Harder:** the reader depends on Airtable internals and can break without notice; the alert and the CSV import
  cover it.
- **Easier (2026-10-17):** turning the sync on, changing the link and seeing why a run failed take an admin in the
  web, not a terminal and a gitops push; the key is sealed once and never changes in normal use.
- **Risks accepted:** Airtable's terms may not allow reading a view this way. The link is a bearer credential to
  every Spain signup.
- **Trade-off accepted (2026-10-17):** any admin account can now point the sync at another view, or remove the link.
  Mitigated by mandatory two-factor sign-in for every account (D4), the check that only an Airtable shared view's
  link is accepted, and the audit log, which says who changed the link and when. Whatever a view brings still goes
  through the matcher and the Bandeja, as every intake does. The link also passes through the API once, over TLS,
  when an admin saves it; request bodies are never logged (ADR-0002).
- **Before or while M1 runs** ([PLAN, this week](../PLAN.md#this-week)): ask Global, when convenient, for a
  read-only API token, or to protect the shared view with a password. Neither blocks M1.
