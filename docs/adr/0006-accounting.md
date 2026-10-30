# ADR-0006: Accounting

- **Status:** Accepted (Dani, 2026-10-30: "i approve the accounting proposal"; in scope by D20, receipts on a volume
  by D21). Public utility is the association's goal (D24), so the books are kept ready for it from the first entry.
- **Date:** 2026-10-30
- **Deciders:** Dani; drafted by Claude
- **Relates to:** [BRIEF](../BRIEF.md) G7, §3, §5; [ADR-0001](0001-hosting-and-delivery.md) (the volume),
  [ADR-0002](0002-authorization-and-data-protection.md) (the role, RLS); [accounting spec](../spec/accounting.md);
  [personal data §9a](../spec/personal-data.md#9a-accounting-records-m6)

## Context

- **The association has to keep books.** A Ley Orgánica 1/2002 association must keep accounts that give a true and
  fair view of its assets, result and financial position, and an inventory of its assets (art. 14). Its statutes
  set a calendar year (art. 30); the Junta Directiva formulates the annual accounts (art. 15) and the ordinary
  assembly approves them within four months of the close (art. 8, 12). The president orders payments and the
  treasurer, a post the statutes allow but nobody holds yet, keeps the funds and carries them out (art. 16, 19).
- **Where it starts (Dani, 2026-10-30):** one bank account, opened recently, with no movements yet; the association
  had no assets when it was founded (statutes, art. 29). The first money expected is funding from PauseAI Global,
  then donations from volunteers. The statutes allow member fees (art. 28), but the assembly hasn't set any. Nothing
  to import: the books start with the first movement.
- **No tax-relief regime yet, but it is the goal** (D24; Dani, 2026-10-30: "just in case it would be our goal").
  Declaring an association of public utility, which lets it enter Ley 49/2002's regime (donation certificates, the
  modelo 182), takes at least two years of activity (LO 1/2002, art. 32.1.d); the association was registered in
  April 2026. Until then, donations carry no deduction for donors and need no certificate. The application looks at
  those years' accounts and activity, and the modelo 182 at whether a donor gave in the years before (recurrent
  donations get a higher deduction), so the years before matter.
- **Which plan applies is for a gestoría or the treasurer to confirm.** The non-profit adaptation of the general
  plan (RD 1491/2011) and its small-entity version (PYMESFL, ICAC resolution of 26 March 2013) are the reference.
  Partially exempt entities may be spared the corporate tax return under thresholds (Ley 27/2014, art. 124.3); the
  books are kept either way.
- The brief excluded finances ("No events, donations or finances"). D20 brings accounting in.

## Options considered

1. **Where the books live.** (a) An outside tool: a hosted accounting service, or a self-hosted one beside the
   backoffice; donors' and payees' data in one more place, another sign-in and security model to run. (b) **A module
   of the backoffice**: the same roles, RLS, audit and backups (Dani, 2026-10-30).
2. **How movements are kept.** (a) A single-entry list of income and expenses: simplest, but it can't produce a
   balance sheet, and moving to double entry later means rebuilding the history. (b) **Double entry underneath,
   simple forms on top:** each form writes a balanced entry, and the income-and-expense book, the balance sheet and
   the income statement are views of the same entries.
3. **Correcting a mistake.** (a) Edit the movement, keeping the old values in the audit log. (b) **Posted entries
   never change; a reversing entry corrects one**, as accounting expects.
4. **Where receipts are stored.** (a) Postgres (`bytea`): one backup and RLS on the bytes, but a database that grows
   with every photo. (b) Object storage: another service to run and back up. (c) **A persistent volume mounted in the
   API** (Dani, 2026-10-30: D21), with each file's row in Postgres under RLS.
5. **Who can see the books.** (a) Admins and tesorería alike. (b) **Tesorería records; admins read** (segregation of
   duties: whoever records isn't the only one who sees; Dani: "follow best practices"). (c) Tesorería alone.

## Decision

1. **A module of the backoffice, "Cuentas"** (1b, D20), in the `app` schema, built like the rest: RLS through
   `private.staff_can`, grants, the audit trigger, stamps, `personal data` comments, an entry in the RLS matrix, and
   a mutation for each rule.
2. **The app records money and never moves it.** It holds no credential that could make a payment, and has no write
   access to a bank or payment provider. Bank data comes in only as a statement file someone downloads and imports
   (M6, step 2). Reading a bank through an aggregator is out of scope: a third party would hold access to the account.
3. **Double entry underneath** (2b). Amounts are whole cents in a `bigint`, euros only: a charge in another currency
   is recorded as the euros the bank took, and its original amount goes in the description. No VAT accounting: the
   association has no economic activity, so VAT paid is part of the cost. The chart of accounts is data seeded from
   the PYMESFL chart, which tesorería extends (a sub-account for each bank account, for example); the code never
   names an account number.
4. **Rules in Postgres**, each with a test and a mutation:
   - a posted entry balances (debits equal credits, both more than zero) and has at least two lines;
   - a posted entry and its lines never change and are never deleted; a reversing entry, which names the one it
     reverses, corrects it (3b), and an entry is reversed at most once;
   - a posted entry gets the next number in its year, without gaps (the journal's order);
   - nothing is written dated in a closed year; tesorería closes a year once the assembly approves its accounts,
     recording the assembly's date, and the closing and opening entries are made by the database in the same step;
   - drafts are tesorería's to change or delete; only posted entries count in reports.
5. **Access** (5b): a new staff role, `tesoreria` ("Tesorería" in the UI), reads and writes every accounting table.
   Admins read them, so the books never depend on one person, and can grant the role, which the audit log records;
   an admin who needs to record holds tesorería too. Onboarding and outreach see nothing. Nothing is opened to the
   bot (`private.bot_can` appears in no accounting policy).
6. **Who money came from or went to** is the module's own record (`app.counterparties`): a name, optionally a tax ID
   and IBAN, all `personal data`. It never links to `app.people`: tesorería needs no onboarding data, and erasing a
   person must not reach the books, which the law requires the association to keep
   ([personal data §9a](../spec/personal-data.md#9a-accounting-records-m6)).
7. **Receipts on a persistent volume** (4c, D21):
   - Mounted only in the API, the only code that touches data. Each file is named on the volume by its receipt's
     uuid, never by what the uploader called it.
   - Encrypted with AES-256-GCM before it is written, with `RECEIPTS_KEY` (32 random bytes sealed in gitops, as
     `AIRTABLE_LINK_KEY` is; ADR-0005) and the receipt's id as associated data. A copy of the volume, or of its
     backup, reveals nothing without the key, and a file can't be swapped for another receipt's.
   - Served only by the API, after the receipt's row is read through `withActor`, so RLS decides who gets it:
     `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`.
     PDF, JPEG, PNG and WebP only, recognised by their first bytes, not by what the browser claims; 10 MB at most.
   - Written before its row: encrypt, write to a temporary name, flush, rename, then insert. A file without a row is
     removed when the API starts. A posted entry's receipts are kept with it; more can be added.
   - The volume is ReadWriteOnce unless the cluster offers more, so the API deploys with the `Recreate` strategy (it
     already runs one replica; ADR-0003). Its size and storage class come from the chart's values, set in gitops.
8. **Ready for public utility** (D24): every year's accounts come from the books as the assembly approves them;
   a donation records its donor as a counterparty, with their tax ID and province when they give them (both optional
   now, both what the modelo 182 asks), and is told apart by its account (donations, not fees or grants), so the
   years before can be read back for certificates and recurrence once the regime applies.
9. **Exports** for tesorería and admins: the journal, the ledger, the income-and-expense book, the balance sheet and
   the income statement, as CSV with formula-looking cells defused (R18).

## Consequences

- **Easier:** one place for the association's books, with the access model it already trusts; the reports the
  assembly approves come straight from the entries; a gestoría gets a CSV, not a reconstruction.
- **Harder:** the app gets its first stored files. The volume and `RECEIPTS_KEY` join the backup plan (Dani's, in
  gitops), and a restore needs both, from the same moment as the database. The API's deploys have a short gap.
- **Risks accepted:** the chart and the reports follow the reference plan as drafted here, until a gestoría or a
  treasurer reviews them. Admins read donors' names. A lost `RECEIPTS_KEY` loses every receipt.
- **Revisit:** donation certificates and the modelo 182 once the association is of public utility (2028 at the
  earliest; D24); accrual (invoices due but unpaid) if a supplier bills on credit; a second person confirming each posting
  once the treasurer and the admins are different people.
