-- migrate:up

-- A contact attempt may be a video call (Dani, 2026-10-18: "i think that videocall should be appearing as an option
-- there"): a channel of its own in "Por dónde", next to the phone.

ALTER TYPE app.contact_channel ADD VALUE 'video' AFTER 'phone';

ALTER TABLE app.person_events DROP CONSTRAINT person_events_check;
ALTER TABLE app.person_events ADD CONSTRAINT person_events_check
  CHECK (kind <> 'contact_attempt'
         OR (data ? 'channel' AND data ? 'outcome'
             AND (data ->> 'channel') IN ('whatsapp', 'phone', 'video', 'email', 'telegram', 'in_person', 'other')
             AND (data ->> 'outcome') IN ('no_answer', 'replied', 'left_message', 'wrong_number', 'declined')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
