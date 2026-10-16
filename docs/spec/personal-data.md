# Personal data

- **Status:** Drafted from the specification (v3). Legal and privacy calls (D9, D12, the privacy notice) are
  Dani's, for the association. D9 is decided.
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

## 6. Telegram carries some personal data

A name and a phone number typed into the bot pass through Telegram's servers. The bot deletes those messages
once saved, never repeats contact details, and posts none in the team group
([ADR-0004](../adr/0004-telegram-bot.md)). Dani decides on this use (D12).

## 7. Minimisation

- No fields beyond the census list ([onboarding §7.2](onboarding.md#72-the-form-m2)).
- The UI asks staff not to record health, ideology or other sensitive details in notes.
- Columns holding personal data are marked as such in the database and never copied into the audit log
  ([data model §2](data-model.md#2-conventions)).

## 8. Notice and rights

- **Privacy notice** linked from the census form; consent recorded with its date and wording version.
- **Rights:** admins can export a person's data (JSON) and erase a person. Erasure anonymises: it removes
  identities, profile and note bodies, and keeps stage counts for statistics. Both actions are audited.

## 8a. Outreach contacts (M3)

Outreach holds people who aren't members: politicians, journalists, academics, people at organisations. What is
kept is professional (role, organisation, a work address or the organisation's inbox) and mostly public, with the
source it came from; their basis would be the association's legitimate interest (art. 6(1)(f)), not art. 9.
**That basis, and whether to tell them where their details came from (art. 14) in the first letter, are Dani's
calls.** Meanwhile the app:

- keeps their contact details off every list (only their own page shows them), and out of the audit log;
- greets them neutrally unless someone has checked how they are addressed, never inferring it from a name;
- lets an admin erase one (`private.anonymise_contact`): name, addresses, phone, notes and timeline words go, the
  organisation and the campaign rows stay for the counts, and they are held for good, so no queue offers them again
  (an objection under art. 21 ends there too);
- sends nothing itself: every letter goes from a person's own mail client.

## 9. Retention (D9)

Decided (Dani, 2026-10-16): **no automatic erasure.** A person's data stays until an admin erases it
(`private.anonymise_person`), on their request (art. 17) or when the association decides. The privacy notice has to
say how long data is kept, or the criteria for it (art. 13.2.a): that wording is the association's.

## 10. Processors

Everything else runs on our cluster (Hetzner, EU). No third-party analytics in the staff app. Sending personal
data to an LLM (the MCP server, M4) is a separate decision (D10).

## 11. Backups

Dani handles them in gitops (`docs/backup-policy-plan.md`), separately from this plan. Until they run, the census
answers exist only in this database.
