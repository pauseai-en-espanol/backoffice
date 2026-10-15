# Importing an outreach campaign

A campaign that was run from the `outreach` repo moves into the backoffice once (outreach spec §4): its contacts,
templates, evidence paragraphs and tracking sheet become a campaign here, and the repo's folder becomes its archive.
After that, the campaign is worked in **Siguiente** and **Campañas**, never in the repo again: the two would drift.

**Who acts:** an admin of the backoffice. **Takes:** ten minutes.

## 1. Before importing

1. In the repo, run the CLI's own checks on the campaign one last time, and commit: the import reads the files as
   they are, and a contact still marked `needsReview` there comes in to review here too.
2. Agree with whoever was sending that nobody sends from the repo from now on.

## 2. A dry run

In **Campañas**, **Importar del repositorio**, pick the campaign folder's files: `campaign.yaml`,
`contacts/contacts.yaml`, `templates/anchors.yaml`, `templates/tier-a.md`, `templates/tier-b.md` and `tracking.csv`.
The page first runs the import in a transaction that is rolled back, and shows:

- **the counts**: organisations, contacts, targets, templates and anchors it would make. For
  `2026-sindicatos-es` (checked locally on 2026-10-16) they were 10, 382, 372, 2 and 8;
- **problems**, each with its file and line: any problem stops the import, and nothing is written. Fix the file in
  the repo, commit, and pick it again;
- **warnings**, which don't stop it: a phone or website that doesn't parse (dropped), a contact without a source
  (imported to review), a tracking row for no contact.

## 3. Importing

Import. The campaign starts as a draft, its contacts with the relationship stage their tracking rows reached
(`replied` and `meeting` count as engaged), and each target in its tracking status, with its dates. A contact
held in the repo comes in held, out of every queue; one already written to keeps that history. The repo's
`owner` names are kept in each target's notes, since they aren't accounts: assign owners in the campaign.

Then:

1. Set each organisation's kind in **Organizaciones** (they come in as "other").
2. Review the contacts that came in to review (**Contactos**, "por revisar"): a reason and a source, then clear the
   flag.
3. Make the campaign active, so its targets show in **Siguiente**.

A campaign is imported once: importing the same `slug` again is refused. To start over before anyone has worked it,
ask Dani to remove it from the database.
