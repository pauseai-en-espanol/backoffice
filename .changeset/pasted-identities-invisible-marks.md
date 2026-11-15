---
'@backoffice/domain': patch
'@backoffice/web': patch
'@backoffice/api': patch
'@backoffice/forms': patch
---

A phone, email or Discord username pasted with the invisible marks WhatsApp and phones copy with it is read as one
(PLAN R97): Contacto no longer refuses a valid number pasted there as "no es un teléfono", and an email pasted with
them is stored without them, so it isn't a second address nobody can tell from the first. A phone spaced with narrow
or thin spaces is read too.
