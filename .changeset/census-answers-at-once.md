---
'@backoffice/migrations': patch
---

Two generic census answers with the same new email or phone at once no longer fail: the second waits for the first
and goes to the Bandeja.
