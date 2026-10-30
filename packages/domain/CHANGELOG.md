# @backoffice/domain

## 0.7.1

### Patch Changes

- 6deb10b: Dependencies bump

## 0.7.0

### Minor Changes

- 48fb433: The bank and the budget through the API (ADR-0006, M6 step 2): a Norma 43 statement imported first as a dry run
  (the real import rolled back), each account to the treasury account with its IBAN, every total checked, only what is
  new; each line's suggested entries, matched by tesorería, by suggestion or by number, and undone; an entry posted
  from a bank line, matched at once; what the bank and the books say of each account; a year's budget against what was
  posted.

## 0.6.0

### Minor Changes

- 778ba2f: Receipts on the API's volume (ADR-0006 decision 7, M6 step 3): tesorería attaches a PDF or a photo to an entry, 10 MB
  at most, recognised by its first bytes; it is stored encrypted with RECEIPTS_KEY, named by its id, before its row is
  written; tesorería and admins download it, as an attachment, sandboxed. A posted entry's receipts stay with it; a
  draft's go with their files. As the API starts, files without a row are set aside and those whose row came back are
  put back. The chart's `receipts` values add the volume and the Recreate strategy; scripts/seal-receipts-key.sh seals
  the key.
- 0b1bce8: The books' API (ADR-0006, M6 step 2): years, the chart, counterparties and projects; Ingreso, Gasto, Traspaso and
  Asiento manual, saved as drafts or posted, with amounts and days written the Spanish way (`1.234,56`, `30/10/2026`);
  Corregir; the journal, the ledger, income and expenses, the balance sheet and a project's report, each exportable as
  CSV. Closing a year and the exports want a second factor of the last 12 hours, and every export is recorded.

## 0.5.5

### Patch Changes

- 9ef388b: Dependencies bump

## 0.5.4

### Patch Changes

- 3ec8eec: Pages that list countries hydrate again, and Añadir keeps what is typed before the page comes alive (PLAN R86, R87):
  countries' names are the app's own, in Spanish order, not the platform's, which differ between Node and each browser
  ("RAE de Hong Kong (China)" and "Hong Kong"), so React no longer throws away and redraws Añadir or the census form,
  emptying what had been typed; and a name, phone, email or Discord typed in Añadir before React has hydrated it is sent
  with the person, not left out.
- 28347af: Where people live, everywhere it's shown (PLAN R81 to R84): the team group's post says "Dónde vive: Baviera, Alemania"
  instead of "Provincia"; the bot's `/search` and `/left` find a phone by 6 or more of its digits, however written, as
  Personas does; Latin America's and the United States' regions are offered as lists in the place pickers and suggested
  in the census form ("cdmx", "Nueva York" find theirs); and the Panel's "Dónde viven" counts people by country, Spain,
  Latin America and the rest of the world, each country leading to its people in Personas.

## 0.5.3

### Patch Changes

- 8df7a29: A person's page has "Escribirle": the message from Mensajes to write to them with (one's own, then the team's),
  sent by "Abrir WhatsApp", "Abrir el correo" (the mail app opens with it written) or "Copiar el mensaje" for Discord,
  Telegram or anything else, its text under "Ver el mensaje". "¿Lo has enviado?" logs the attempt on that channel,
  asking where a copied one went. A census link in Censo offers the same three ways (PLAN R77).
- 8df7a29: In Mensajes, the version for someone without a name is optional: left empty, the message goes out with {nombre}
  taken out ("Hola, {nombre}:" reads "Hola:"), as the editor shows. Messages may be up to 10,000 characters (PLAN R76).

## 0.5.2

### Patch Changes

- 0886a95: Where someone lives has a country, and where they're from can be said too ("De dónde es": a country and a province
  or region), for Spain's community, Spaniards abroad, Latin America's and Latin Americans abroad (PLAN R74). In the
  staff app a country is picked by typing part of its name, in Spanish or English, Spain first, then Latin America,
  then the rest of the world; while it's Spain, Spain's provinces are offered the same way, by any of their names, and
  anything else typed is kept. The census form asks the same with the phone's own picker, and its privacy summary lists
  the new data. Cards say "Maite (Baviera, Alemania)", Personas filters by country, the Bandeja compares countries,
  the CSV import reads "País", "País de origen" and "De dónde es", the Airtable sync reads Global's Country, and the
  people export adds "pais". Someone living abroad isn't asked for a province. Everyone already in the backoffice whose
  province is one of Spain's, or who came from Global's view, is set as living in Spain.
- 76bca35: Personas and Censo find a phone however it was written: a foreign number without its country code ("857 756 3987" for
  +1 857 756 3987), or 6 or more of its digits, such as its end (PLAN R72). "Cuándo fue" starts on today, on a person's
  page and on Contactos' and Organizaciones' notes; left so, nothing is recorded as another day (PLAN R73).

## 0.5.1

### Patch Changes

- cead178: A contact attempt may be made on Discord: "Discord" in "Por dónde", after "Telegram". In Contacto, only digits are
  read as a phone and the hint says to write a Discord username made of digits with an @ in front; adding a detail the
  person already has says which one ("Esta ficha ya tiene ese teléfono.") instead of "Ya existe algo con esos datos."

## 0.5.0

### Minor Changes

- a4a1e91: Contacto takes a phone, an email or a Discord username in one field and tells which from what is typed, with no
  "Tipo" to choose; each detail is one line with its icon and "Quitar" at the end. Fields side by side keep their boxes
  in line however long their labels, and "(opcional)" moved into the hints, so labels stay on one line.

## 0.4.1

### Patch Changes

- 4e92c54: A contact attempt may be a video call: "Videollamada" in "Por dónde", after "Teléfono".

## 0.4.0

### Minor Changes

- 2829bb3: The WhatsApp group's history comes in through Importar (PLAN R56): `pnpm whatsapp:csv`, run on the laptop that holds
  the group's export, turns it and the exporter's Google Contacts into a CSV with a row per stay in the group. The CSV
  import reads "Entró el" and "Salió el" and Baja, and saves someone known only by a phone, an email or a Discord
  username; the database records each stay once, closes it when a later export says it ended, and never reopens it.
  Joins and leaves go into a person's history on their own day. People who left come in too, as Baja (D16).

## 0.3.0

### Minor Changes

- 01e38c3: Cards say who someone is (PLAN M5, step 4): the name with the province ("Maite (Madrid)"), a one-line internal
  summary the team writes in the profile (never sent to Telegram), and what is missing in plain words ("Falta: correo ·
  qué quiere hacer"), on Hoy, Personas, the Onboarding Pipeline, the Bandeja, Censo and the person's page.
- d00c2c0: Mensajes: the onboarding team writes the WhatsApp messages newcomers receive (the welcome and the census link's) in
  the staff app instead of in code. Several per purpose, picked when WhatsApp is opened; `{nombre}`, `{yo}` and
  `{enlace}` as placeholders, anything else refused as it's typed and by the database; a version for someone without a
  name; a preview. Each change is a new version, and the contact attempt and the census link name the message and
  version that went out. The code's own census link message no longer says "onboarding".

## 0.2.0

### Minor Changes

- e24160b: Fewer stages, and when and where from (PLAN M5, step 3): Por clasificar folds into Nuevo and En conversación into
  "En contacto"; "Llegó el" on each person (unknown allowed, never in the future), with "Sin asignar" only for arrivals of
  the last 30 days; a day for attempts, notes and stage changes that happened another day; "Llegó por", from a list
  admins edit in Ajustes (the bot says WhatsApp, Global's form itself); a Discord username as a contact detail; the old
  "Llegó por" label on sources is now "Entró por"; the Panel counts arrivals by when and where from.

## 0.1.0

### Minor Changes

- 5879bda: The bot's commands in English with Spanish names that work the same (PLAN R38): `/joined` (`/alta`), `/left`
  (`/baja`), `/mine` (`/mios`), `/unassigned` (`/libres`), `/search` (`/buscar`), `/sync` (`/sincronizar`), `/help`
  (`/ayuda`), `/cancel` (`/cancelar`). The API sets Telegram's command menu on every start, by the Spanish names
  and, for English Telegram, by the English ones, described in Spanish; replies name a command by both names.
- 8b141b4: M1 onboarding schema: people, identities, sources, community presence and the timeline; intake records and one
  matcher for every source; the Bandeja; merging; claiming and leaves; the attention rules; the bot's narrow functions;
  the Airtable sync's one function. Domain: contact normalisation, stages, attention reasons, and reading what the bot is
  told.
- e38e0f2: M3 outreach schema: organisations, contacts (tier, relationship stage, reason and sources, or to review; hold; a
  verified treatment only), campaigns with versioned templates per tier and sourced anchors, targets with the outreach
  CLI's statuses (never made ready or sent while their contact needs review or is held), an append-only timeline, and
  a contact's erasure. The letter renderer ported from the outreach CLI: merge fields that fail rather than blank, the
  neutral greeting, the dash and filler checks, the send order, and a mailto: link.
