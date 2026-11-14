---
'@backoffice/domain': patch
'@backoffice/api': patch
'@backoffice/i18n': patch
---

A phone is found by any 2 of its digits, however they are spaced (PLAN R96), not only from 6: in Personas, Censo, the
Bandeja, Fusionar and ⌘K, and a number pasted from WhatsApp, with its invisible marks, is read as one. Contactos and
⌘K find a contact by its phone the same way, which they never did; Contactos' hint says so. The bot's search still
needs 6 digits, since it never shows a number (ADR-0004).
