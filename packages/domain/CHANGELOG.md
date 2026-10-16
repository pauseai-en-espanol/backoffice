# @backoffice/domain

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
