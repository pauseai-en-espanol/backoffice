# @backoffice/i18n

## 0.1.0

### Minor Changes

- 5879bda: The bot's commands in English with Spanish names that work the same (PLAN R38): `/joined` (`/alta`), `/left`
  (`/baja`), `/mine` (`/mios`), `/unassigned` (`/libres`), `/search` (`/buscar`), `/sync` (`/sincronizar`), `/help`
  (`/ayuda`), `/cancel` (`/cancelar`). The API sets Telegram's command menu on every start, by the Spanish names
  and, for English Telegram, by the English ones, described in Spanish; replies name a command by both names.
- 9b8add8: M2 census API: the forms app's routes (shared secret, rate limit, honeypot, fill time, normalised contact details),
  Censo's progress and queue, personal links with a WhatsApp message ready, marking them sent, the option lists, a
  person's census answers on their page, and the admin's export (JSON) and erasure.
- 613d8ea: M0 foundations: database roles, staff, invitations, audit log and Better Auth's schema; Spanish messages; error
  tracking's privacy options.
- a3e2c8f: M2 census form: the public form on its own host (generic and personal links, the token only in the address's
  fragment), which reaches the API's census routes only from its server, with the shared secret; no cookies, no
  sessions, nothing third-party; a draft privacy notice until the association publishes its own. The API chart takes
  the census settings (the public role, the shared secret, the form's origin) and lets the form's pods in.
- 1c5bd11: Arrivals without a name (PLAN R37): most bot reports carry only a phone number, so the bot saves a phone or an email
  alone in one step, without asking for a name, and quick-add needs a phone or an email but not a name. Such a person
  shows as "Sin nombre" in the bot, the team group and the staff app, is greeted without a name in WhatsApp, and gets a
  name from a later report, the census, a merge or their page; a name, once known, is never emptied.
- e38e0f2: M3 outreach API: organisations, contacts and campaigns with their templates, anchors and targets; each letter
  rendered and handed over (text, mailto: and wa.me links), never sent; Siguiente, the next target in send order;
  "Sí, enviado"; a contact's erasure; and the one-off import of a campaign from the outreach repo's files, dry run
  first. The Bandeja shows a census answer without its contact details, and a census list is reordered in one go.
- e38e0f2: M4 Panel: people by stage, arrivals per week by source, how long arrivals waited for a first contact attempt, and who
  has waited more than 48 hours with nobody on them.
- f4a9480: The Telegram bot (M1): linking staff accounts from the staff app, the webhook, /alta, /baja, /mios, /libres,
  /buscar, /sincronizar, /ayuda and /cancelar, contact details deleted from the chat once saved, the team group's posts
  and claims, the daily digest and the dialog clean-up jobs, and the owner's telegram-webhook command.
- 5cf2102: The staff web app for M0, in Spanish: sign-in with a mandatory second factor, password recovery, invitations, the
  team (invite, roles, deactivation, password links) and the audit log for admins; the shared Panda preset.
- 970da1b: M1 onboarding pages: Hoy (my people needing attention and the unassigned queue, with "Me lo quedo"), Personas (search,
  filters, "Cargar más", the admins' CSV export), a person's page (contact details, WhatsApp handover, stage and owner,
  next action, contact attempts and notes, profile, community presence, the timeline, merging), Embudo, Añadir rápido
  (with possible duplicates as you type), the Bandeja, Importar (the Airtable sync and the CSV import with its dry run),
  and Ajustes (linking Telegram, the onboarding settings). A menu on phones.
- 7bbad20: M2 staff web app: Censo (progress, the generic link from CENSUS_URL, and personal links made once and sent from the
  onboarder's own WhatsApp); a person's census answers and consents, and, for admins, exporting or erasing their data;
  census answers in the Bandeja, shown in words; and the census's lists in Ajustes, which admins edit.
- 54b233e: M3 staff web app: Siguiente (the next letter to send, read before sending, opened in the sender's own mail or copied
  part by part, then "¿La has enviado?"; nothing sends on its own); Campañas, with each campaign's targets by status in
  send order, its templates by tier, its evidence paragraphs and a preview of any contact's letter; Contactos, the
  directory with its filters, review, hold, notes and, for admins, erasure; Organizaciones; and the admins' import of a
  campaign from the outreach repo, with a dry run first.

### Patch Changes

- 6c25821: The bot deletes messages with a phone or email from every conversation that ends without saving or expires, and
  `/sync` runs at most ten times an hour per person, one sync at a time.
- a4b91d0: The draft privacy notice no longer promises erasure after 12 months: D9 decided no automatic erasure, so data stays
  until the person asks for it to be erased.
