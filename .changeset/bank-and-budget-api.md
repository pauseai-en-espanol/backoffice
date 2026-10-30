---
'@backoffice/api': minor
'@backoffice/domain': minor
---

The bank and the budget through the API (ADR-0006, M6 step 2): a Norma 43 statement imported first as a dry run
(the real import rolled back), each account to the treasury account with its IBAN, every total checked, only what is
new; each line's suggested entries, matched by tesorería, by suggestion or by number, and undone; an entry posted
from a bank line, matched at once; what the bank and the books say of each account; a year's budget against what was
posted.
