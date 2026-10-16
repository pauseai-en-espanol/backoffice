---
'@backoffice/migrations': patch
'@backoffice/api': patch
---

A Telegram link code belongs to the session that made it and goes when that session ends, and only an account with
its second factor can be linked: a code kept from before a password or authenticator reset no longer links the bot.
