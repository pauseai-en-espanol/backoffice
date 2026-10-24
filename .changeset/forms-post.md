---
'@backoffice/web': patch
'@backoffice/forms': patch
---

A form sent before the page comes alive never puts what was typed in its address (PLAN R88): every form the page
sends is a POST, so pressing Entrar or Intro before React has hydrated it sends a body, which Next answers with the
page again, not `/entrar?email=…&password=…` in the browser's history and the access logs; the same for a person's
details, the Airtable link and a census answer.
