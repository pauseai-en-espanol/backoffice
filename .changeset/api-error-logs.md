---
'@backoffice/api': patch
---

Errors are logged without what could quote a person (a database error's detail and where are dropped; messages,
stacks and every log line are redacted of emails and phone numbers), and an error no route caught answers
`{"error":"internal"}` instead of its message.
