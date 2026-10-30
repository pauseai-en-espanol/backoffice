---
'@backoffice/i18n': minor
'@backoffice/web': minor
---

Banco and Presupuesto in Cuentas (ADR-0006, M6 step 2), reached from Movimientos: tesorería imports the bank's Norma
43 statement after reviewing what it would bring, matches each line to a suggested entry or one by its number, or
writes it with "Anotar", posted and matched at once, and sees whether the bank and the books agree; sets a budget per
year by account and sees what was posted against it. Admins read both. An entry's page shows its bank line.
