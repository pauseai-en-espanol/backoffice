-- migrate:up

-- One way in, "Canal de alta" (PLAN R58; Dani, 2026-10-18: "entro por and llego por ... should be merged"): the
-- channel is what people are shown, filtered and counted by; the sources a record came through ("Entró por") are no
-- longer shown, and stay only for the history. So whoever has no channel yet takes it from where they came in, when
-- that says one: Global's form, its own entry; a report to the bot, WhatsApp, which the bot assumes (PLAN M5). The
-- first such source wins. Added by hand, a CSV or the census say nothing of a channel: those stay "Sin indicar".
-- Filled with the table's triggers off, as migration arrivals_dated_and_placed's fill was, so it neither stamps them
-- nor trips the erased rows' guard; erased and merged records are left as they are.
ALTER TABLE app.people DISABLE TRIGGER USER;
UPDATE app.people p
   SET arrival_channel_id = c.id
  FROM (SELECT DISTINCT ON (s.person_id) s.person_id, s.source
          FROM app.person_sources s
         WHERE s.source IN ('airtable', 'telegram')
         ORDER BY s.person_id, s.first_seen_at) first_source
  JOIN app.arrival_channels c
    ON c.key = CASE first_source.source WHEN 'airtable' THEN 'airtable' ELSE 'whatsapp' END
 WHERE p.id = first_source.person_id
   AND p.arrival_channel_id IS NULL
   AND p.merged_into IS NULL
   AND p.anonymised_at IS NULL;
ALTER TABLE app.people ENABLE TRIGGER USER;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
