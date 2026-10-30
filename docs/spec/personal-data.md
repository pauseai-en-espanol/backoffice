# Personal data

- **Status:** Drafted from the specification (v3). Legal and privacy calls (D9, D12, the privacy notice) are
  Dani's, for the association. D9 and D12 are decided.
- **Relates to:** [BRIEF](../BRIEF.md) G5 and §5; [ADR-0002](../adr/0002-authorization-and-data-protection.md);
  [ADR-0004](../adr/0004-telegram-bot.md); [ADR-0005](../adr/0005-airtable-intake.md);
  [data model](data-model.md)

**These are design constraints, not legal advice. Dani decides for the association.**

## 1. Applicable law

The GDPR, which applies directly in Spain, plus Spain's own Ley Orgánica 3/2018 (LOPDGDD). The supervisory
authority is the AEPD.

## 2. Controller

Asociación Pausemos La IA. The app goes in its record of processing activities (GDPR art. 30).

## 3. Legal basis

- Membership of an organisation with a political aim can reveal political opinions, which GDPR art. 9 treats as
  special-category data.
- Art. 9(2)(d) lets such a non-profit process its members' and regular contacts' data, with safeguards, provided
  the data isn't disclosed outside it without consent.
- LOPDGDD art. 9.1 adds that consent alone doesn't lift the ban when the main purpose is identifying ideology, so
  the basis is the association's own activity with its members, not consent. **LOPDGDD art. 9.1 is cited from
  memory: check the wording in the BOE before relying on it.**
- **So: nothing leaves the association without consent**, and access is least-privilege
  ([ADR-0002](../adr/0002-authorization-and-data-protection.md)).

## 4. Minors

Under 14, consent must come from a parent or guardian (LOPDGDD art. 7). The census asks the person to confirm
they are 14 or older, doesn't accept them otherwise, and says to talk to the team
([onboarding §7.2](onboarding.md#72-the-form-m2)). Source:
[AEPD FAQ](https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales).

## 5. Global's data

Global's privacy notice says signups may be shared with the national chapter (`pauseai-website`,
`src/posts/privacy.md`). We copy only mapped fields ([ADR-0005](../adr/0005-airtable-intake.md)).

The shared view's link reads every Spain signup, so it is a credential: admins paste it in Ajustes, and the API
stores it encrypted with the deployment's key, which never reaches the database (`app.airtable_sync`). It is
write-only: no answer, log or audit entry carries it or its ciphertext; its column is marked personal data so the
audit log records only that it changed, and who changed it.

## 6. Telegram carries some personal data

A name and a phone number typed into the bot pass through Telegram's servers. The bot deletes those messages
once saved, never repeats contact details, and posts none in the team group
([ADR-0004](../adr/0004-telegram-bot.md)). Dani accepted this use (D12, 2026-10-16).

## 7. Minimisation

- No fields beyond the census list ([onboarding §7.2](onboarding.md#72-the-form-m2)).
- **Where someone is from** (PLAN R74) is a place, a country and a province or region, optional, asked only as "De
  dónde eres", and never a nationality: it can hint at one, so nothing depends on it and nobody is asked twice.
- The UI asks staff not to record health, ideology or other sensitive details in notes, nor in a person's one-line
  internal summary (PLAN M5, step 4), which stays in the staff app and its admins' CSV export: never sent to
  Telegram, in the person's export, cleared by erasure.
- A team member's account may be linked to their own person record (PLAN M5, step 5). The link grants nothing, and
  erasure removes it.
- Columns holding personal data are marked as such in the database and never copied into the audit log
  ([data model §2](data-model.md#2-conventions)).
- **The WhatsApp group's history** (PLAN R56) is converted on the laptop of the admin who exported it: what reaches
  the backoffice is who was in the group, between which days, and the name, number or email the exporter's contacts
  have for them; none of the chat's messages. The command prints counts only, refuses the repository, and the runbook
  ends with deleting the files. People who left come in too, as Baja (D16, Dani's call), so nobody greets them as
  new and the counts of who came and went are honest.

## 8. Notice and rights

- **Privacy notice** linked from the census form; consent recorded with its date and wording version.
- **Rights:** admins can export a person's data (JSON) and erase a person. Erasure anonymises: it removes
  identities, profile and note bodies, and keeps stage counts for statistics. Both actions are audited.

## 8a. Outreach contacts (M3)

Outreach holds people who aren't members: politicians, journalists, academics, people at organisations. What is
kept is professional (role, organisation, a work address or the organisation's inbox) and mostly public, with the
source it came from; their basis would be the association's legitimate interest (art. 6(1)(f)), not art. 9.
**That basis, and whether to tell them where their details came from (art. 14) in the first letter, are Dani's
calls**: the assessment and the notice's paragraph are drafted in
[outreach-legitimate-interest.md](../legal/outreach-legitimate-interest.md) (draft, Dani's to approve). Notes on
contacts and organisations, past conversations included, are the same processing whatever tool keeps them (Dani,
2026-10-17: building PLAN M5 step 6 doesn't wait on it). Meanwhile the app:

- keeps their contact details off every list (only their own page shows them), and out of the audit log;
- lets someone keep a contact, an organisation or a note for themselves ("Solo yo", [outreach §6](outreach.md)):
  nobody else in the app sees it, admins neither, yet a rights request still reaches it, through an admin's search
  by an exact email, phone or name, which finds private contacts too, and their download (recorded as an export) or
  erasure; a departed member's go to whoever an admin chooses in outreach;
- greets them neutrally unless someone has checked how they are addressed, never inferring it from a name;
- lets an admin erase one (`private.anonymise_contact`): name, addresses, phone, notes and timeline words go, the
  organisation and the campaign rows stay for the counts, and they are held for good, so no queue offers them again
  (an objection under art. 21 ends there too);
- sends nothing itself: every letter goes from a person's own mail client.

## 9. Retention (D9)

Decided (Dani, 2026-10-16): **no automatic erasure.** A person's data stays until an admin erases it
(`private.anonymise_person`), on their request (art. 17) or when the association decides. The privacy notice has to
say how long data is kept, or the criteria for it (art. 13.2.a): that wording is the association's.

## 9a. Accounting records (M6)

The books ([ADR-0006](../adr/0006-accounting.md)) hold who money came from or went to (names, and optionally a
tax ID and an IBAN) and receipts that may name people. The association has to keep them: accounts and their
supporting documents for at least as long as tax law can review them (four years, Ley General Tributaria art. 66),
and six as the usual practice (Código de Comercio art. 30), which the association's notice should say. So:

- Erasing a person (`private.anonymise_person`) never reaches the books: they are a separate record, never linked to
  `app.people`, and erasure's art. 17(3)(b) exception covers what a legal obligation requires to keep.
- A request to access one's data covers counterparties and receipts too; admins can read them.
- Once a closed year is past the retention the association sets, an admin may anonymise its counterparties (a
  definer function, added with the first year that gets there).

## 10. Processors

Everything else runs on our own cluster, in the EU. No third-party analytics in the staff app. Sending personal
data to an LLM is a separate decision: D10 decided no MCP server for now.

## 11. Backups

Dani handles them in the gitops repository, separately from this plan. Until they run, the census
answers exist only in this database.
