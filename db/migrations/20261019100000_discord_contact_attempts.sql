-- migrate:up

-- A contact attempt may be made on Discord (Dani, 2026-10-19: "i think we should also list discord there"): a channel
-- of its own in "Por dónde", after Telegram.

ALTER TYPE app.contact_channel ADD VALUE 'discord' AFTER 'telegram';

ALTER TABLE app.person_events DROP CONSTRAINT person_events_check;
ALTER TABLE app.person_events ADD CONSTRAINT person_events_check
  CHECK (kind <> 'contact_attempt'
         OR (data ? 'channel' AND data ? 'outcome'
             AND (data ->> 'channel') IN ('whatsapp', 'phone', 'video', 'email', 'telegram', 'discord', 'in_person',
                                          'other')
             AND (data ->> 'outcome') IN ('no_answer', 'replied', 'left_message', 'wrong_number', 'declined')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
