---
'@backoffice/api': minor
'@backoffice/forms': patch
---

The forms app's routes are served on a port of their own (`FORMS_PORT`, 3002), the only one the forms app's pods
are admitted to: a forms pod taken over reaches neither sign-in nor the staff routes. The charts expose and use it,
and the network policy check keeps it so.
