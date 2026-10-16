-- migrate:up

-- Arrivals without a name (PLAN R37): most of the bot's reports carry only a phone number (Dani, 2026-10-16), so a
-- person reported through the bot or the staff app may have no name until someone learns it.
-- - `full_name` may be missing (NULL), never blank; the apps show "Sin nombre".
-- - A new person still needs a name, or a phone or an email to find them by; Airtable, the CSV import and the census
--   still always name them.
-- - A later report or a merge fills the missing name (a census answer already sets it); a nameless person is never
--   matched on their name (`similar_people` scores a NULL name as NULL, which no threshold admits).

ALTER TABLE app.people ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE app.people DROP CONSTRAINT people_full_name_check;
ALTER TABLE app.people ADD CONSTRAINT people_full_name_check
  CHECK (full_name IS NULL OR (btrim(full_name) <> '' AND length(full_name) <= 200));

-- Migration intake's version, filling a missing name instead of skipping it.
CREATE OR REPLACE FUNCTION private.intake_attach(intake app.intake_records, person uuid) RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
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
  $$;

-- Migration intake's version: someone a person reports (the bot, the staff app) may come with only a phone or an
-- email; every other source names them.
CREATE OR REPLACE FUNCTION private.intake_create(intake app.intake_records) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    person uuid;
    named boolean := coalesce(btrim(intake.payload ->> 'name'), '') <> '';
  BEGIN
    IF NOT named
       AND NOT (intake.source IN ('telegram', 'manual')
                AND EXISTS (SELECT 1 FROM private.intake_identities(intake.payload) x
                             WHERE x.kind IN ('phone', 'email') AND btrim(x.value) <> '')) THEN
      RAISE EXCEPTION 'a new person needs a name, or a phone or an email' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO app.people (full_name, stage)
    VALUES (CASE WHEN named THEN left(btrim(intake.payload ->> 'name'), 200) END,
            CASE WHEN intake.payload ->> 'stage' IN ('to_triage', 'new', 'welcomed', 'active')
                 THEN (intake.payload ->> 'stage')::app.stage ELSE 'new' END)
    RETURNING id INTO person;
    PERFORM private.intake_attach(intake, person);
    RETURN person;
  END
  $$;

-- Migration intake's version, the survivor also taking the tombstone's name when it has none.
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
           profile_completed_at = greatest(p.profile_completed_at, gone.profile_completed_at)
     WHERE p.id = survivor;
    UPDATE app.people p SET merged_into = survivor, owner_id = NULL, next_action = NULL, next_action_due = NULL
     WHERE p.id = merged;
  END
  $$;

-- Migration people's version: a name, once known, is never taken away again (erasure replaces it instead).
CREATE OR REPLACE FUNCTION private.person_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF OLD.full_name IS NOT NULL AND NEW.full_name IS NULL THEN
      RAISE EXCEPTION 'a person''s name, once known, stays' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stage IN ('left', 'discarded') THEN
      NEW.next_action := NULL;
      NEW.next_action_due := NULL;
    END IF;
    RETURN NEW;
  END
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
