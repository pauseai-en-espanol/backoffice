---
'@backoffice/web': minor
'@backoffice/i18n': minor
'@backoffice/api': patch
'@backoffice/migrations': patch
---

One sign-up day and one way in (PLAN R58, D17): "Llegó el" is "Fecha de alta" and "Llegó por" is "Canal de alta"
everywhere, and "Entró por" leaves the person's page, the cards, the filters and the Panel, which counts sign-ups by
channel alone. Whoever had no channel takes it from where they came in (Global's form, or WhatsApp through the bot).
A person's sign-up is edited in its own card, "Alta y comunidad", which never repeats the day. Importar and
`pnpm whatsapp:csv` call the group's columns "Entrada al grupo" and "Salida del grupo".
