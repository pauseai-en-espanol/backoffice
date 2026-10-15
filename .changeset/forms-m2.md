---
'@backoffice/forms': minor
'@backoffice/i18n': minor
'@backoffice/api': patch
---

M2 census form: the public form on its own host (generic and personal links, the token only in the address's
fragment), which reaches the API's census routes only from its server, with the shared secret; no cookies, no
sessions, nothing third-party; a draft privacy notice until the association publishes its own. The API chart takes
the census settings (the public role, the shared secret, the form's origin) and lets the form's pods in.
