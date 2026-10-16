---
'@backoffice/migrations': minor
'@backoffice/api': minor
'@backoffice/web': minor
'@backoffice/domain': minor
'@backoffice/i18n': minor
'@backoffice/db': minor
---

Mensajes: the onboarding team writes the WhatsApp messages newcomers receive (the welcome and the census link's) in
the staff app instead of in code. Several per purpose, picked when WhatsApp is opened; `{nombre}`, `{yo}` and
`{enlace}` as placeholders, anything else refused as it's typed and by the database; a version for someone without a
name; a preview. Each change is a new version, and the contact attempt and the census link name the message and
version that went out. The code's own census link message no longer says "onboarding".
