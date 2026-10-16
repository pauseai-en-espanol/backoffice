---
'@backoffice/api': minor
'@backoffice/web': minor
'@backoffice/migrations': minor
'@backoffice/db': minor
'@backoffice/i18n': minor
'@backoffice/forms': patch
---

Admins set Global's Airtable view link in Ajustes, and turn the sync on or off there, instead of a sealed secret in
gitops (ADR-0005, PLAN R49). The API stores the link encrypted with the deployment's `AIRTABLE_LINK_KEY` (a key sealed
once by `scripts/seal-airtable-key.sh`, which never reaches the database) and never shows it again: Ajustes says who
set it and when, and how the last run went. The sync, hourly or on demand, reads it only while it's on; off, or
without a link, it does nothing. Importar shows the sync as off until an admin turns it on. The chart's
`airtableSync.sharedViewUrlSecret` is now `airtableSync.linkKeySecret`, and `AIRTABLE_SHARED_VIEW_URL` is no longer
read. The forms app only changes because the repository's root did.
