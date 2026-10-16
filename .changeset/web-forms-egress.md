---
'@backoffice/web': patch
'@backoffice/forms': patch
---

With network policies on, the web and forms pods may connect only to the API (each on the port it calls), DNS and
error tracking (`networkPolicy.errorTracking`), and the API's forms port moves to 3003, clear of the forms app's own
3002 in development.
