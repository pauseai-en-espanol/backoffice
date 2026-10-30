---
'@backoffice/db': minor
'@backoffice/migrations': minor
---

The bank and the budget in the database (ADR-0006, M6 step 2): statements imported from the bank and their lines,
each matched to the entry that records it, and a budget per year by income or expense account; tesorería writes,
admins read, nothing for the bot. A line is imported once and never changes but for its match, which names a posted
entry that moves its account by its amount; a budget line sits neither above nor below another of its year; nothing
dated in a closed year changes.
