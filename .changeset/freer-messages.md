---
'@backoffice/migrations': patch
'@backoffice/domain': patch
'@backoffice/i18n': patch
'@backoffice/api': patch
'@backoffice/web': patch
---

In Mensajes, the version for someone without a name is optional: left empty, the message goes out with {nombre}
taken out ("Hola, {nombre}:" reads "Hola:"), as the editor shows. Messages may be up to 10,000 characters (PLAN R76).
