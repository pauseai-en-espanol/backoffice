-- migrate:up

-- People and their timeline (onboarding spec, concepts; data model spec): one row per human, however many sources
-- they came from; the ways to recognise them; where we learned about them; when they were in the community; and an
-- append-only history that lets anyone pick a person up. Onboarding staff and admins reach them through the staff
-- app; the bot only through the narrow functions of migration intake, which never return contact details.

CREATE TABLE app.people (
  id                    uuid PRIMARY KEY DEFAULT uuidv7(),
  full_name             text NOT NULL CHECK (btrim(full_name) <> '' AND length(full_name) <= 200),
  preferred_name        text CHECK (length(preferred_name) <= 100),
  province              text CHECK (length(province) <= 100),
  town                  text CHECK (length(town) <= 100),
  languages             text[] NOT NULL DEFAULT '{}' CHECK (cardinality(languages) <= 20),
  pronouns              text CHECK (length(pronouns) <= 50),
  availability          app.availability,
  how_heard             text CHECK (length(how_heard) <= 500),
  stage                 app.stage NOT NULL DEFAULT 'new',
  owner_id              uuid REFERENCES app.staff (user_id),
  next_action           text CHECK (btrim(next_action) <> '' AND length(next_action) <= 300),
  next_action_due       date,
  profile_completed_at  timestamptz,
  -- A merged person is a tombstone pointing at the one that stays (onboarding spec, merging).
  merged_into           uuid REFERENCES app.people (id),
  anonymised_at         timestamptz,
  -- For comparing and searching names; never shown.
  name_folded           text GENERATED ALWAYS AS (private.fold_name(full_name)) STORED,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (merged_into IS DISTINCT FROM id),
  CHECK (next_action_due IS NULL OR next_action IS NOT NULL)
);
COMMENT ON COLUMN app.people.full_name IS 'personal data';
COMMENT ON COLUMN app.people.preferred_name IS 'personal data';
COMMENT ON COLUMN app.people.province IS 'personal data';
COMMENT ON COLUMN app.people.town IS 'personal data';
COMMENT ON COLUMN app.people.languages IS 'personal data';
COMMENT ON COLUMN app.people.pronouns IS 'personal data';
COMMENT ON COLUMN app.people.availability IS 'personal data';
COMMENT ON COLUMN app.people.how_heard IS 'personal data';
COMMENT ON COLUMN app.people.next_action IS 'personal data';
COMMENT ON COLUMN app.people.name_folded IS 'personal data';
CREATE INDEX people_name_folded_trgm_idx ON app.people USING gin (name_folded extensions.gin_trgm_ops);
CREATE INDEX people_stage_idx ON app.people (stage) WHERE merged_into IS NULL;
CREATE INDEX people_owner_id_idx ON app.people (owner_id) WHERE merged_into IS NULL;

-- A normalised identity belongs to one person: the unique key is what prevents duplicates. The shapes match
-- @backoffice/domain's normalisation (identities.ts), which the API applies first.
CREATE TABLE app.identities (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id   uuid NOT NULL REFERENCES app.people (id),
  kind        app.identity_kind NOT NULL,
  value       text NOT NULL,
  verified    boolean NOT NULL DEFAULT false,
  source      app.source_kind NOT NULL,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value),
  CHECK (CASE kind
           WHEN 'email' THEN value = lower(value) AND value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           WHEN 'phone' THEN value ~ '^\+[1-9][0-9]{6,14}$'
           WHEN 'airtable' THEN value ~ '^rec[A-Za-z0-9]{14}$'
         END)
);
COMMENT ON COLUMN app.identities.value IS 'personal data';
CREATE INDEX identities_person_id_idx ON app.identities (person_id);

-- Where we learned about a person, first seen when and from whom.
CREATE TABLE app.person_sources (
  person_id      uuid NOT NULL REFERENCES app.people (id),
  source         app.source_kind NOT NULL,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  reported_by    uuid REFERENCES app.staff (user_id),
  PRIMARY KEY (person_id, source)
);

-- When a person was in the WhatsApp community: joined, left, who reported each, and the chat if known. Leaving is a
-- signal, not a deletion.
CREATE TABLE app.community_presence (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id           uuid NOT NULL REFERENCES app.people (id),
  joined_on           date,
  left_on             date,
  chat                text CHECK (length(chat) <= 100),
  joined_reported_by  uuid REFERENCES app.staff (user_id),
  left_reported_by    uuid REFERENCES app.staff (user_id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on)
);
COMMENT ON COLUMN app.community_presence.chat IS 'personal data';
CREATE INDEX community_presence_person_id_idx ON app.community_presence (person_id);
-- At most one open period a person.
CREATE UNIQUE INDEX community_presence_open_idx ON app.community_presence (person_id) WHERE left_on IS NULL;

-- The timeline: append-only, only anonymisation redacts it. `body` holds what a person wrote (a note, the next action);
-- `data` the structured part (a stage's from and to, a contact attempt's channel and outcome, a merge's snapshot).
CREATE TABLE app.person_events (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id   uuid NOT NULL REFERENCES app.people (id),
  kind        app.event_kind NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  channel     text CHECK (channel IN ('web', 'bot')),
  body        text CHECK (length(body) <= 4000),
  data        jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object'),
  CHECK (kind <> 'contact_attempt'
         OR (data ? 'channel' AND data ? 'outcome'
             AND (data ->> 'channel') IN ('whatsapp', 'phone', 'email', 'telegram', 'in_person', 'other')
             AND (data ->> 'outcome') IN ('no_answer', 'replied', 'left_message', 'wrong_number', 'declined')))
);
COMMENT ON COLUMN app.person_events.body IS 'personal data';
COMMENT ON COLUMN app.person_events.data IS 'personal data';
CREATE INDEX person_events_person_id_created_at_idx ON app.person_events (person_id, created_at DESC);

-- The channel of a write, from the session, like its actor and time.
CREATE FUNCTION private.stamp_channel() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    NEW.channel := private.current_channel();
    RETURN NEW;
  END
  $$;

-- Rules on a person's changes, in the same transaction (onboarding spec, stages): `left` and `discarded` close the
-- next action; and a stage, owner or next-action change writes its timeline event, with who made it (below). Staff
-- can't change a tombstone (merged) or an anonymised person: their update policy leaves those out.
CREATE FUNCTION private.person_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.stage IN ('left', 'discarded') THEN
      NEW.next_action := NULL;
      NEW.next_action_due := NULL;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE FUNCTION private.person_timeline() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO app.person_events (person_id, kind, data)
      VALUES (NEW.id, 'created', jsonb_build_object('stage', NEW.stage));
      RETURN NULL;
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO app.person_events (person_id, kind, data)
      VALUES (NEW.id, 'stage_changed', jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      INSERT INTO app.person_events (person_id, kind, data)
      VALUES (NEW.id, 'owner_changed', jsonb_build_object('from', OLD.owner_id, 'to', NEW.owner_id));
    END IF;
    IF (NEW.next_action, NEW.next_action_due) IS DISTINCT FROM (OLD.next_action, OLD.next_action_due)
       AND NEW.stage NOT IN ('left', 'discarded') THEN
      INSERT INTO app.person_events (person_id, kind, body, data)
      VALUES (NEW.id, 'next_action_set', NEW.next_action, jsonb_build_object('due', NEW.next_action_due));
    END IF;
    RETURN NULL;
  END
  $$;

-- A contact attempt moves the person along (onboarding spec, stages): the first one takes `new` to `contacting`; a
-- reply takes `new`, `contacting` or `unresponsive` to `talking`; and the settings' number of attempts without a reply
-- over at least their days takes `contacting` to `unresponsive`. Runs as the writer, who may update the person.
CREATE FUNCTION private.contact_attempt_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    current app.stage;
    attempts integer;
    first_at timestamptz;
    settings app.settings;
  BEGIN
    SELECT p.stage INTO current FROM app.people p WHERE p.id = NEW.person_id;
    IF NEW.data ->> 'outcome' = 'replied' THEN
      IF current IN ('new', 'contacting', 'unresponsive') THEN
        UPDATE app.people p SET stage = 'talking' WHERE p.id = NEW.person_id;
      END IF;
      RETURN NULL;
    END IF;
    IF current = 'new' THEN
      UPDATE app.people p SET stage = 'contacting' WHERE p.id = NEW.person_id;
      RETURN NULL;
    END IF;
    IF current = 'contacting' THEN
      SELECT s.* INTO settings FROM app.settings s;
      SELECT count(*), min(e.created_at) INTO attempts, first_at
        FROM app.person_events e
       WHERE e.person_id = NEW.person_id AND e.kind = 'contact_attempt'
         AND e.created_at > coalesce((SELECT max(r.created_at) FROM app.person_events r
                               WHERE r.person_id = NEW.person_id AND r.kind = 'contact_attempt'
                                 AND r.data ->> 'outcome' = 'replied'), '-infinity');
      IF attempts >= settings.unresponsive_attempts
         AND first_at <= now() - make_interval(days => settings.unresponsive_days) THEN
        UPDATE app.people p SET stage = 'unresponsive' WHERE p.id = NEW.person_id;
      END IF;
    END IF;
    RETURN NULL;
  END
  $$;

-- Triggers --------------------------------------------------------------------------------------------------------

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.people
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER rules BEFORE UPDATE ON app.people
  FOR EACH ROW EXECUTE FUNCTION private.person_rules();
CREATE TRIGGER timeline AFTER INSERT OR UPDATE ON app.people
  FOR EACH ROW EXECUTE FUNCTION private.person_timeline();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.people
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.identities
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.identities
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.person_sources
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.community_presence
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.community_presence
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER stamp BEFORE INSERT ON app.person_events
  FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id', 'created_at');
CREATE TRIGGER stamp_channel BEFORE INSERT ON app.person_events
  FOR EACH ROW EXECUTE FUNCTION private.stamp_channel();
CREATE TRIGGER forbid_mutation BEFORE UPDATE OR DELETE ON app.person_events
  FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.person_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER contact_attempt AFTER INSERT ON app.person_events
  FOR EACH ROW WHEN (NEW.kind = 'contact_attempt') EXECUTE FUNCTION private.contact_attempt_rules();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.person_events
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Grants and policies ---------------------------------------------------------------------------------------------
-- Onboarding staff and admins, through the staff app. People are made only from intake records
-- (private.submit_intake, migration intake), never inserted here, and never deleted (anonymised instead, M2).

ALTER TABLE app.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.person_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.community_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.person_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON app.people TO pauseai_backoffice_app;
GRANT UPDATE (full_name, preferred_name, province, town, languages, pronouns, availability, how_heard, stage,
              owner_id, next_action, next_action_due)
  ON app.people TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.people FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_update ON app.people FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')) AND merged_into IS NULL AND anonymised_at IS NULL)
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));

-- A phone or email added or removed by hand; `verified` set once someone checked it.
GRANT SELECT, DELETE ON app.identities TO pauseai_backoffice_app;
GRANT INSERT (person_id, kind, value, verified, source), UPDATE (verified) ON app.identities TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.identities FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_insert ON app.identities FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')) AND source = 'manual');
CREATE POLICY onboarding_update ON app.identities FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')))
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_delete ON app.identities FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));

GRANT SELECT ON app.person_sources TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.person_sources FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));

-- Joins and leaves recorded from the staff app; the bot reports them through its functions.
GRANT SELECT ON app.community_presence TO pauseai_backoffice_app;
GRANT INSERT (person_id, joined_on, left_on, chat, joined_reported_by, left_reported_by),
      UPDATE (joined_on, left_on, chat, left_reported_by)
  ON app.community_presence TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.community_presence FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_insert ON app.community_presence FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_update ON app.community_presence FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')))
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));

-- Staff write notes and contact attempts; every other kind comes from the database's own triggers and functions.
GRANT SELECT ON app.person_events TO pauseai_backoffice_app;
GRANT INSERT (person_id, kind, body, data) ON app.person_events TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.person_events FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_insert ON app.person_events FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding'))
              AND (kind IN ('note', 'contact_attempt') OR pg_catalog.pg_trigger_depth() > 0));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
