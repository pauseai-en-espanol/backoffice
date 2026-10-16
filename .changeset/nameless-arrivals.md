---
'@backoffice/migrations': minor
'@backoffice/db': minor
'@backoffice/api': minor
'@backoffice/web': minor
'@backoffice/i18n': minor
---

Arrivals without a name (PLAN R37): most bot reports carry only a phone number, so the bot saves a phone or an email
alone in one step, without asking for a name, and quick-add needs a phone or an email but not a name. Such a person
shows as "Sin nombre" in the bot, the team group and the staff app, is greeted without a name in WhatsApp, and gets a
name from a later report, the census, a merge or their page; a name, once known, is never emptied.
