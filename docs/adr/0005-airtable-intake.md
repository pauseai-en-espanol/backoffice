# ADR-0005: Airtable signups through the shared view link

- **Status:** Accepted (Dani, 2026-10-15: D2, "the shared link is all I have; I think it should be configuration";
  D3, the Airtable view carries the same data as the emails). Reading the view is gated on M1's first spike.
- **Date:** 2026-10-15
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
3. **Where the link lives.** (a) In the database, editable in the UI. (b) **A sealed secret in gitops**, read by
   the sync.

Dani chose 1b (D3) and 3b (D2). 2b is built if the spike succeeds; 2d is always there, and is the route if the
spike needs a headless browser (2c is not built). 2a replaces 2b behind the same interface if Global ever grants a
read-only token.

## Decision

1. **The link is configuration** (D2): a sealed secret in gitops, read by the sync. When Global changes the link,
   the secret changes; no code does.
2. **The link is a credential.** Anyone holding it reads every Spain signup. It lives only in the sealed secret,
   and is never committed, logged, shown in the UI or pasted where others can see it. Fixtures use fictional views.
3. **The spike comes first in M1.** Run locally against the real link, which is never committed, it answers: does
   the view load without a full browser, does it allow a CSV download, and what are its columns? It records the
   column names. If it needs a headless browser, the sync isn't built and the CSV import is the route.

   **Result (2026-10-15, structure and counts only; no record's values were read):** the share page loads with a
   plain request and embeds a signed URL for the view's data (`/v0.3/view/viw…/readSharedViewData`, its
   `accessPolicy` signed by Airtable), which answers JSON with the table's columns and rows. No browser is needed,
   so the sync is built (`apps/api/src/imports/airtable.ts`). The share allows `downloadCsv`, so the CSV import is
   a real fallback. The view had 118 rows, all with Country = Spain, and far more columns than we map (Bio, photo,
   Discord, stipends, payments…). The sync keeps only these: `Full name`, `Email`, `Email 2`, `Phone`, `City`,
   `Languages`, `Discovery method of PAI`; it reads `duplicate` (Global's own flag, 8 rows) and
   `GDPR chapter share permission` (ticked on 43 rows) to leave rows out. Required: `Full name` and `Email`; if
   either disappears, the run fails and imports nothing.

4. **The sync** runs as `pauseai_backoffice_ingest`, which may only execute `private.ingest_airtable(records)`
   (it inserts the import run and the intake records and runs the matcher, as the owner); no table grants:
   - **When:** hourly (a CronJob), plus on demand from `/sincronizar` in the bot or a button in Importar. A Postgres
     advisory lock stops two runs overlapping.
   - **Idempotent:** the Airtable record ID is the identity; re-running a sync changes nothing.
   - **Fails loudly:** a run that can't read the view, or finds the columns changed, imports nothing and tells the
     admins through the bot.
   - **Minimal:** only mapped fields are copied, never the rest of Global's record.
   - **Permission (PLAN R14):** while `AIRTABLE_REQUIRE_CHAPTER_PERMISSION` holds (the default), rows without
     Global's `GDPR chapter share permission` ticked are left out and only counted. Dani decides whether Global's
     privacy notice covers the rest; setting it to `false` imports them on the next run.
5. **The CSV import** in the web app ([onboarding §5.3](../spec/onboarding.md#53-web-and-csv-m1)) is the fallback
   whenever the shared-view sync breaks.
6. **An API reader** replaces the shared-view reader behind the same interface if Global grants a read-only API
   token.
7. **We never write back** to Global's Airtable.

## Consequences

- **Easier:** signups arrive within the hour with no one copying them; nothing waits on Global.
- **Harder:** the reader depends on Airtable internals and can break without notice; the alert and the CSV import
  cover it.
- **Risks accepted:** Airtable's terms may not allow reading a view this way. The link is a bearer credential to
  every Spain signup.
- **Before or while M1 runs** ([PLAN, this week](../PLAN.md#this-week)): ask Global, when convenient, for a
  read-only API token, or to protect the shared view with a password. Neither blocks M1.
