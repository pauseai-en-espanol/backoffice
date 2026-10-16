---
'@backoffice/migrations': minor
'@backoffice/api': minor
'@backoffice/web': minor
'@backoffice/i18n': minor
---

The Telegram bot is the onboarding team's alone (D13): only active staff with the onboarding role can connect it and
use it, not an admin without that role. The database refuses a link code or a link for anyone else, and unlinks an
account, dropping its unused codes, when it loses the role or is deactivated; the bot's functions answer the
onboarding role alone. Ajustes offers "Conectar Telegram" only to onboarding staff and tells everyone else the bot
is the onboarding team's.
