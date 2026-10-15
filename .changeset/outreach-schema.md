---
'@backoffice/migrations': minor
'@backoffice/db': minor
'@backoffice/domain': minor
---

M3 outreach schema: organisations, contacts (tier, relationship stage, reason and sources, or to review; hold; a
verified treatment only), campaigns with versioned templates per tier and sourced anchors, targets with the outreach
CLI's statuses (never made ready or sent while their contact needs review or is held), an append-only timeline, and
a contact's erasure. The letter renderer ported from the outreach CLI: merge fields that fail rather than blank, the
neutral greeting, the dash and filler checks, the send order, and a mailto: link.
