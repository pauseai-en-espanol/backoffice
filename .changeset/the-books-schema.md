---
'@backoffice/api': minor
'@backoffice/db': minor
'@backoffice/i18n': minor
'@backoffice/migrations': minor
'@backoffice/web': minor
---

The books' database (ADR-0006, M6 step 1): a Tesorería role, which Equipo can grant; the chart of accounts seeded
from the small non-profits' plan; counterparties, projects, fiscal years, journal entries and their lines, and
receipts' rows, which tesorería writes and admins read, with nothing for the bot. Posted entries balance, never
change, are numbered in their year without gaps and are reversed at most once; closed years refuse writes, and
closing one posts its closing entry and the next year's opening entry.
