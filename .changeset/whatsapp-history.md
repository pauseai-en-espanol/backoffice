---
'@backoffice/api': minor
'@backoffice/web': minor
'@backoffice/i18n': minor
'@backoffice/domain': minor
'@backoffice/migrations': minor
'@backoffice/db': patch
---

The WhatsApp group's history comes in through Importar (PLAN R56): `pnpm whatsapp:csv`, run on the laptop that holds
the group's export, turns it and the exporter's Google Contacts into a CSV with a row per stay in the group. The CSV
import reads "Entró el" and "Salió el" and Baja, and saves someone known only by a phone, an email or a Discord
username; the database records each stay once, closes it when a later export says it ended, and never reopens it.
Joins and leaves go into a person's history on their own day. People who left come in too, as Baja (D16).
