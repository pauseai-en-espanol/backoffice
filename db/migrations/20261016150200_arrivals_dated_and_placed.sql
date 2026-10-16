-- migrate:up

-- A person's arrival, told as it happened (PLAN M5, step 3; Dani, 2026-10-16), for the people already in the
-- community who are entered after the fact:
-- - "Llegó el" (`arrived_on`): the day someone arrived, by default the day they are added, never in the future; empty
--   when nobody knows ("No se sabe": an older member entered after the fact, Dani himself). The "Sin asignar" rule,
--   the Panel and the team group's posts go by it, and leave out whoever has none.
-- - "Llegó por" (`arrival_channel_id`): where they came from, from the list in app.arrival_channels.
-- - "Fecha" (`happened_on`) on contact attempts, notes and stage changes made by hand: when it happened, never in the
--   future. The record itself keeps when it was written and by whom (created_at and actor_id, set by the database
--   alone), so nothing can be backdated: the two dates are shown side by side.
-- - A Discord username as a contact detail, next to phone and email: matched for duplicates like them.

-- When someone arrived. People already here arrived the day they were added, as far as anyone knows (they all were,
-- recently), except those "Por clasificar", who were members before the backoffice: theirs stays unknown (Dani,
-- 2026-10-16). Filled with the table's triggers off, so the fill neither touches their stamps nor trips the erased
-- rows' guard.
ALTER TABLE app.people ADD COLUMN arrived_on date;
ALTER TABLE app.people DISABLE TRIGGER USER;
UPDATE app.people SET arrived_on = (created_at AT TIME ZONE 'Europe/Madrid')::date WHERE stage <> 'to_triage';
ALTER TABLE app.people ENABLE TRIGGER USER;
ALTER TABLE app.people ALTER COLUMN arrived_on SET DEFAULT ((now() AT TIME ZONE 'Europe/Madrid')::date);

-- Where they came from: empty for everyone already here, until someone says.
ALTER TABLE app.people ADD COLUMN arrival_channel_id uuid REFERENCES app.arrival_channels (id);

GRANT UPDATE (arrived_on, arrival_channel_id) ON app.people TO pauseai_backoffice_app;

CREATE FUNCTION private.arrival_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.arrived_on > (now() AT TIME ZONE 'Europe/Madrid')::date THEN
      RAISE EXCEPTION 'nobody arrives in the future' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER arrival BEFORE INSERT OR UPDATE OF arrived_on ON app.people
  FOR EACH ROW EXECUTE FUNCTION private.arrival_rules();

-- When an attempt, a note or a stage change made by hand happened, if not when it was written.
ALTER TABLE app.person_events ADD COLUMN happened_on date;
ALTER TABLE app.person_events ADD CONSTRAINT person_events_happened_on_check
  CHECK (happened_on IS NULL OR kind IN ('contact_attempt', 'note', 'stage_changed'));
GRANT INSERT (happened_on) ON app.person_events TO pauseai_backoffice_app;

CREATE FUNCTION private.happened_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.happened_on > (now() AT TIME ZONE 'Europe/Madrid')::date THEN
      RAISE EXCEPTION 'nothing has happened in the future yet' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER happened BEFORE INSERT ON app.person_events
  FOR EACH ROW WHEN (NEW.happened_on IS NOT NULL) EXECUTE FUNCTION private.happened_rules();

-- Discord usernames as Discord makes them: 2 to 32 lowercase letters, digits, underscores and dots, never two dots in a
-- row. Any kind the check doesn't name is refused (it used to pass).
ALTER TABLE app.identities DROP CONSTRAINT identities_check;
ALTER TABLE app.identities ADD CONSTRAINT identities_check CHECK (
  CASE kind
    WHEN 'email' THEN value = lower(value) AND value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    WHEN 'phone' THEN value ~ '^\+[1-9][0-9]{6,14}$'
    WHEN 'airtable' THEN value ~ '^rec[A-Za-z0-9]{14}$'
    WHEN 'discord' THEN value ~ '^[a-z0-9_.]{2,32}$' AND position('..' IN value) = 0
    ELSE false
  END);

-- An intake may carry the day they arrived (`arrived_on`, YYYY-MM-DD, or null for "nobody knows"), where from
-- (`arrival`, an entry's key or label) and Discord usernames (`discords`).
CREATE OR REPLACE FUNCTION private.check_payload(payload jsonb) RETURNS void
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = ''
  AS $$
  DECLARE
    extra text;
  BEGIN
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'an intake payload is an object' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(k, ', ') INTO extra FROM jsonb_object_keys(payload) k
     WHERE k NOT IN ('name', 'preferred_name', 'emails', 'phones', 'discords', 'airtable_id', 'province', 'town',
                     'languages', 'how_heard', 'chat', 'note', 'stage', 'joined_on', 'arrived_on', 'arrival');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'an intake payload takes no %', extra USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(coalesce(payload -> 'emails', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'phones', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'discords', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'languages', '[]')) <> 'array' THEN
      RAISE EXCEPTION 'emails, phones, discords and languages are arrays' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF payload ? 'arrived_on' AND jsonb_typeof(payload -> 'arrived_on') <> 'null'
       AND (jsonb_typeof(payload -> 'arrived_on') <> 'string' OR (payload ->> 'arrived_on') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'arrived_on is a date, YYYY-MM-DD, or null' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END
  $$;

CREATE OR REPLACE FUNCTION private.intake_identities(payload jsonb) RETURNS TABLE (kind app.identity_kind, value text)
  LANGUAGE sql IMMUTABLE
  SET search_path = ''
  AS $$
    SELECT 'email'::app.identity_kind, e FROM jsonb_array_elements_text(coalesce(payload -> 'emails', '[]')) e
    UNION
    SELECT 'phone'::app.identity_kind, p FROM jsonb_array_elements_text(coalesce(payload -> 'phones', '[]')) p
    UNION
    SELECT 'discord'::app.identity_kind, d FROM jsonb_array_elements_text(coalesce(payload -> 'discords', '[]')) d
    UNION
    SELECT 'airtable'::app.identity_kind, payload ->> 'airtable_id' WHERE payload ? 'airtable_id'
  $$;

-- A new person: named, or with a phone, an email or a Discord username to find them by (the bot and the staff app);
-- arrived when the intake says (null: nobody knows), else today, never later; from where it says. The stages an intake may set are the
-- ones existing members come in as; anything else, including the old "Por clasificar" the census still sends, starts
-- them as new.
CREATE OR REPLACE FUNCTION private.intake_create(intake app.intake_records) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    person uuid;
    named boolean := coalesce(btrim(intake.payload ->> 'name'), '') <> '';
    today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  BEGIN
    IF NOT named
       AND NOT (intake.source IN ('telegram', 'manual')
                AND EXISTS (SELECT 1 FROM private.intake_identities(intake.payload) x
                             WHERE x.kind IN ('phone', 'email', 'discord') AND btrim(x.value) <> '')) THEN
      RAISE EXCEPTION 'a new person needs a name, or a phone, an email or a Discord username'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO app.people (full_name, stage, arrived_on, arrival_channel_id)
    VALUES (CASE WHEN named THEN left(btrim(intake.payload ->> 'name'), 200) END,
            CASE WHEN intake.payload ->> 'stage' IN ('new', 'welcomed', 'active')
                 THEN (intake.payload ->> 'stage')::app.stage ELSE 'new' END,
            CASE WHEN jsonb_typeof(intake.payload -> 'arrived_on') = 'null' THEN NULL
                 ELSE least(coalesce((intake.payload ->> 'arrived_on')::date, today), today) END,
            private.arrival_channel(intake.payload ->> 'arrival'))
    RETURNING id INTO person;
    PERFORM private.intake_attach(intake, person);
    RETURN person;
  END
  $$;

-- Attaching an intake also tells when and where from: an arrival day fills an unknown one, and an earlier one than
-- the day held wins (they were here before we knew); "where from" fills only an empty one.
CREATE OR REPLACE FUNCTION private.intake_attach(intake app.intake_records, person uuid) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path = ''
  AS $_$
  DECLARE
    payload jsonb := intake.payload;
    subject app.people;
    conflicts jsonb := '{}';
    identity record;
    holder uuid;
    field text;
    proposed text;
    held text;
    taken text[] := '{}';
    channel uuid := private.arrival_channel(payload ->> 'arrival');
  BEGIN
    SELECT p.* INTO subject FROM app.people p WHERE p.id = person FOR UPDATE;
    FOR identity IN SELECT * FROM private.intake_identities(payload) LOOP
      SELECT private.survivor(i.person_id) INTO holder FROM app.identities i
       WHERE i.kind = identity.kind AND i.value = identity.value;
      IF holder IS NULL THEN
        INSERT INTO app.identities (person_id, kind, value, source)
        VALUES (person, identity.kind, identity.value, intake.source);
      ELSIF holder <> person THEN
        taken := taken || identity.value;
      END IF;
    END LOOP;
    IF cardinality(taken) > 0 THEN
      conflicts := conflicts || jsonb_build_object('identities', to_jsonb(taken));
    END IF;
    INSERT INTO app.person_sources (person_id, source, reported_by)
    VALUES (person, intake.source, intake.reported_by)
    ON CONFLICT DO NOTHING;

    IF coalesce(btrim(payload ->> 'name'), '') = '' THEN
      NULL;
    ELSIF subject.full_name IS NULL THEN
      UPDATE app.people p SET full_name = left(btrim(payload ->> 'name'), 200) WHERE p.id = person;
    ELSIF private.fold_name(payload ->> 'name') <> subject.name_folded THEN
      conflicts := conflicts || jsonb_build_object('full_name',
        jsonb_build_object('current', subject.full_name, 'proposed', btrim(payload ->> 'name')));
    END IF;
    FOREACH field IN ARRAY ARRAY['preferred_name', 'province', 'town', 'how_heard'] LOOP
      proposed := nullif(btrim(payload ->> field), '');
      held := to_jsonb(subject) ->> field;
      IF proposed IS NULL THEN
        CONTINUE;
      ELSIF held IS NULL THEN
        EXECUTE format('UPDATE app.people SET %I = $1 WHERE id = $2', field) USING proposed, person;
      ELSIF private.fold_name(held) <> private.fold_name(proposed) THEN
        conflicts := conflicts || jsonb_build_object(field, jsonb_build_object('current', held, 'proposed', proposed));
      END IF;
    END LOOP;
    IF jsonb_typeof(payload -> 'languages') = 'array' THEN
      UPDATE app.people p
         SET languages = ARRAY(SELECT DISTINCT l FROM unnest(p.languages || ARRAY(
                                 SELECT jsonb_array_elements_text(payload -> 'languages'))) l ORDER BY l)
       WHERE p.id = person;
    END IF;
    IF payload ->> 'arrived_on' IS NOT NULL
       AND (subject.arrived_on IS NULL
            OR least((payload ->> 'arrived_on')::date, (now() AT TIME ZONE 'Europe/Madrid')::date) < subject.arrived_on) THEN
      UPDATE app.people p
         SET arrived_on = least((payload ->> 'arrived_on')::date, (now() AT TIME ZONE 'Europe/Madrid')::date)
       WHERE p.id = person;
    END IF;
    IF channel IS NOT NULL AND subject.arrival_channel_id IS NULL THEN
      UPDATE app.people p SET arrival_channel_id = channel WHERE p.id = person;
    END IF;

    IF (intake.source = 'telegram' OR payload ? 'chat' OR payload ? 'joined_on')
       AND NOT EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = person AND c.left_on IS NULL) THEN
      INSERT INTO app.community_presence (person_id, joined_on, chat, joined_reported_by)
      VALUES (person, coalesce((payload ->> 'joined_on')::date, (now() AT TIME ZONE 'Europe/Madrid')::date),
              nullif(btrim(payload ->> 'chat'), ''), intake.reported_by);
    END IF;
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (person, CASE intake.source WHEN 'telegram' THEN 'reported'::app.event_kind
                                       WHEN 'manual' THEN 'reported'::app.event_kind
                                       ELSE 'imported'::app.event_kind END,
            jsonb_build_object('source', intake.source, 'intake_id', intake.id));
    IF coalesce(btrim(payload ->> 'note'), '') <> '' THEN
      INSERT INTO app.person_events (person_id, kind, body)
      VALUES (person, 'note', left(btrim(payload ->> 'note'), 4000));
    END IF;
    RETURN conflicts;
  END
  $_$;

-- A stage changed by hand may say when it happened: the staff app sets `app.happened_on` in its transaction, and the
-- stage change's event carries it (the event refuses a day in the future).
CREATE OR REPLACE FUNCTION private.person_timeline() RETURNS trigger
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
      INSERT INTO app.person_events (person_id, kind, data, happened_on)
      VALUES (NEW.id, 'stage_changed', jsonb_build_object('from', OLD.stage, 'to', NEW.stage),
              nullif(current_setting('app.happened_on', true), '')::date);
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

-- A merge keeps the earlier arrival day (a known one over an unknown one) and, if the survivor has none, the
-- duplicate's "where from".
CREATE OR REPLACE FUNCTION private.merge_people(survivor uuid, merged uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    kept app.people;
    gone app.people;
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF survivor = merged THEN
      RAISE EXCEPTION 'a person is not merged into themselves' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    -- Locked in id order, so two merges of the same pair never wait for each other.
    PERFORM 1 FROM app.people p WHERE p.id IN (survivor, merged) ORDER BY p.id FOR UPDATE;
    SELECT p.* INTO kept FROM app.people p WHERE p.id = survivor;
    SELECT p.* INTO gone FROM app.people p WHERE p.id = merged;
    IF kept.id IS NULL OR gone.id IS NULL OR kept.merged_into IS NOT NULL OR gone.merged_into IS NOT NULL
       OR kept.anonymised_at IS NOT NULL OR gone.anonymised_at IS NOT NULL THEN
      RAISE EXCEPTION 'both people must exist, and be neither merged nor anonymised' USING ERRCODE = 'restrict_violation';
    END IF;

    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (merged, 'merged', jsonb_build_object('into', survivor, 'snapshot', to_jsonb(gone) - 'name_folded',
              'identities', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value)), '[]')
                               FROM app.identities i WHERE i.person_id = merged)));
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (survivor, 'merged', jsonb_build_object('from', merged));

    UPDATE app.identities i SET person_id = survivor WHERE i.person_id = merged;
    INSERT INTO app.person_sources (person_id, source, first_seen_at, reported_by)
    SELECT survivor, s.source, s.first_seen_at, s.reported_by FROM app.person_sources s WHERE s.person_id = merged
    ON CONFLICT (person_id, source) DO UPDATE
      SET first_seen_at = least(app.person_sources.first_seen_at, EXCLUDED.first_seen_at);
    DELETE FROM app.person_sources s WHERE s.person_id = merged;
    -- One open period at most: the tombstone's open one closes into the survivor's if the survivor has its own.
    IF EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = survivor AND c.left_on IS NULL) THEN
      UPDATE app.community_presence c SET left_on = (now() AT TIME ZONE 'Europe/Madrid')::date
       WHERE c.person_id = merged AND c.left_on IS NULL;
    END IF;
    UPDATE app.community_presence c SET person_id = survivor WHERE c.person_id = merged;
    UPDATE app.intake_records i SET person_id = survivor WHERE i.person_id = merged;
    UPDATE app.intake_records i SET candidates = array_remove(i.candidates, merged)
     WHERE merged = ANY (i.candidates);

    UPDATE app.people p
       SET full_name = coalesce(p.full_name, gone.full_name),
           owner_id = coalesce(p.owner_id, gone.owner_id),
           next_action = coalesce(p.next_action, gone.next_action),
           next_action_due = CASE WHEN p.next_action IS NULL THEN gone.next_action_due ELSE p.next_action_due END,
           preferred_name = coalesce(p.preferred_name, gone.preferred_name),
           province = coalesce(p.province, gone.province),
           town = coalesce(p.town, gone.town),
           pronouns = coalesce(p.pronouns, gone.pronouns),
           availability = coalesce(p.availability, gone.availability),
           how_heard = coalesce(p.how_heard, gone.how_heard),
           languages = ARRAY(SELECT DISTINCT l FROM unnest(p.languages || gone.languages) l ORDER BY l),
           profile_completed_at = greatest(p.profile_completed_at, gone.profile_completed_at),
           arrived_on = least(p.arrived_on, gone.arrived_on),
           arrival_channel_id = coalesce(p.arrival_channel_id, gone.arrival_channel_id)
     WHERE p.id = survivor;
    UPDATE app.people p SET merged_into = survivor, owner_id = NULL, next_action = NULL, next_action_due = NULL
     WHERE p.id = merged;
  END
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
