-- migrate:up

-- Organisations get a timeline of notes, as contacts have, and a note on either may say when the conversation it
-- tells happened (PLAN M5, step 6; Dani, 2026-10-16): so extracts from past conversations can be kept.
-- - "Cuándo fue" (`happened_on`): the day it happened, if not the day written, never in the future, as people's
--   events have (step 3). The note itself keeps when it was written and by whom (created_at and actor_id, set by the
--   database).
-- - Expand/contract: each organisation's one notes field becomes its first note, dated the day the organisation was
--   last changed, by nobody known; the field is no longer written, and a later migration drops it.

ALTER TABLE app.contact_events ADD COLUMN happened_on date;
ALTER TABLE app.contact_events ADD CONSTRAINT contact_events_happened_on_check
  CHECK (happened_on IS NULL OR kind = 'note');
GRANT INSERT (happened_on) ON app.contact_events TO pauseai_backoffice_app;
CREATE TRIGGER happened BEFORE INSERT ON app.contact_events
  FOR EACH ROW WHEN (NEW.happened_on IS NOT NULL) EXECUTE FUNCTION private.happened_rules();

-- An organisation's notes: append-only, as a contact's timeline. A body is emptied only by erasure (none yet).
CREATE TABLE app.organisation_notes (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  organisation_id  uuid NOT NULL REFERENCES app.organisations (id),
  body             text CHECK (btrim(body) <> '' AND length(body) <= 4000),
  happened_on      date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  actor_id         uuid,
  channel          text CHECK (channel IN ('web', 'bot'))
);
COMMENT ON COLUMN app.organisation_notes.body IS 'personal data';
CREATE INDEX organisation_notes_organisation_id_idx ON app.organisation_notes (organisation_id, created_at DESC);

CREATE TRIGGER stamp BEFORE INSERT ON app.organisation_notes
  FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id', 'created_at');
CREATE TRIGGER stamp_channel BEFORE INSERT ON app.organisation_notes
  FOR EACH ROW EXECUTE FUNCTION private.stamp_channel();
CREATE TRIGGER happened BEFORE INSERT ON app.organisation_notes
  FOR EACH ROW WHEN (NEW.happened_on IS NOT NULL) EXECUTE FUNCTION private.happened_rules();
CREATE TRIGGER forbid_mutation BEFORE UPDATE OR DELETE ON app.organisation_notes
  FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.organisation_notes
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.organisation_notes
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Outreach staff and admins, through the staff app; never the bot (outreach spec). A note always says something.
ALTER TABLE app.organisation_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (organisation_id, body, happened_on) ON app.organisation_notes TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.organisation_notes FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.organisation_notes FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')) AND body IS NOT NULL);

INSERT INTO app.organisation_notes (organisation_id, body, happened_on)
SELECT o.id, btrim(o.notes), (o.updated_at AT TIME ZONE 'Europe/Madrid')::date
  FROM app.organisations o
 WHERE btrim(coalesce(o.notes, '')) <> '';

REVOKE INSERT (notes), UPDATE (notes) ON app.organisations FROM pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
