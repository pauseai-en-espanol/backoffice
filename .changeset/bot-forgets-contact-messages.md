---
'@backoffice/api': patch
'@backoffice/i18n': patch
---

The bot deletes messages with a phone or email from every conversation that ends without saving or expires, and
`/sync` runs at most ten times an hour per person, one sync at a time.
