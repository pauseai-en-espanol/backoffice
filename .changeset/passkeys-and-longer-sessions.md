---
'@backoffice/api': minor
'@backoffice/i18n': minor
'@backoffice/migrations': minor
'@backoffice/web': minor
---

Signing in less often (PLAN D22). A session now ends 48 hours after it was last used, and a week after sign-in at the
latest, instead of 12 hours after sign-in whatever happened. And passkeys, optional: in Ajustes, "Llaves de acceso"
adds one on this computer or phone (or in a password manager), and Entrar's "Usar una llave de acceso" then signs in
with it alone, the device checking the fingerprint, face or PIN. The password and the code keep working; the owner's
reset of a lost authenticator removes the passkeys too.
