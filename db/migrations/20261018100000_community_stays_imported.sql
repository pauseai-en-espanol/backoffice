-- migrate:up

-- The WhatsApp group's history, brought in through the CSV import (PLAN R56; Dani, 2026-10-18): who joined and who
-- left, and when, as the group's export tells it, for everyone in it, those who left included (D16).
-- - A CSV row may carry one stay in the community: "Entró el" (`joined_on`, a day, or null when nobody knows) and
--   "Salió el" (`left_on`, a day). Someone who left and came back is a row per stay; their phone makes them one person.
-- - A stay already recorded, from this file or an earlier export, is never recorded twice; a stay that has closed
--   since is never opened again by an older row that saw it open; a row that closes a stay closes the open one.
-- - The CSV import may save someone without a name, with a phone, an email or a Discord username, as the bot does
--   (R37): most of the group's numbers are in nobody's contacts. And may start them as Baja (`left`).
-- - Joins and leaves go into the history on their own day (`happened_on`), not on the day they were recorded.
-- Days, not times (Dani, 2026-10-18): the bot and the web report a day, and so does everything else that is dated.

-- A join or a leave says when it happened, like the attempts, notes and stage changes made by hand.
ALTER TABLE app.person_events DROP CONSTRAINT person_events_happened_on_check;
ALTER TABLE app.person_events ADD CONSTRAINT person_events_happened_on_check
  CHECK (happened_on IS NULL OR kind IN ('contact_attempt', 'note', 'stage_changed', 'joined', 'left'));

-- Migration people's version, with the stay's days as the events' own. A day still to come (the web takes any) keeps
-- the day it was written, as nothing happens in the future.
CREATE OR REPLACE FUNCTION private.presence_timeline() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.joined_on IS NOT NULL THEN
      INSERT INTO app.person_events (person_id, kind, data, happened_on)
      VALUES (NEW.person_id, 'joined', jsonb_build_object('on', NEW.joined_on, 'chat', NEW.chat),
              CASE WHEN NEW.joined_on <= today THEN NEW.joined_on END);
    END IF;
    IF NEW.left_on IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.left_on IS NULL) THEN
      INSERT INTO app.person_events (person_id, kind, data, happened_on)
      VALUES (NEW.person_id, 'left', jsonb_build_object('on', NEW.left_on),
              CASE WHEN NEW.left_on <= today THEN NEW.left_on END);
    END IF;
    RETURN NULL;
  END
  $$;

-- An intake may carry a stay: `joined_on` (YYYY-MM-DD, or null for "nobody knows") and `left_on` (YYYY-MM-DD), never
-- leaving before joining.
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
                     'languages', 'how_heard', 'chat', 'note', 'stage', 'joined_on', 'left_on', 'arrived_on',
                     'arrival');
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
    IF payload ? 'joined_on' AND jsonb_typeof(payload -> 'joined_on') <> 'null'
       AND (jsonb_typeof(payload -> 'joined_on') <> 'string' OR (payload ->> 'joined_on') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'joined_on is a date, YYYY-MM-DD, or null' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF payload ? 'left_on'
       AND (jsonb_typeof(payload -> 'left_on') <> 'string' OR (payload ->> 'left_on') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'left_on is a date, YYYY-MM-DD' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(payload -> 'joined_on') = 'string' AND payload ? 'left_on'
       AND (payload ->> 'left_on') COLLATE "C" < (payload ->> 'joined_on') COLLATE "C" THEN
      RAISE EXCEPTION 'nobody leaves before joining' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END
  $$;

-- Migration arrivals_dated_and_placed's version: the CSV import, like the bot and the staff app, saves someone with
-- only a phone, an email or a Discord username; Airtable and the census still always name them. An intake may start
-- someone as Baja too, for those the group's history says left.
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
       AND NOT (intake.source IN ('telegram', 'manual', 'csv')
                AND EXISTS (SELECT 1 FROM private.intake_identities(intake.payload) x
                             WHERE x.kind IN ('phone', 'email', 'discord') AND btrim(x.value) <> '')) THEN
      RAISE EXCEPTION 'a new person needs a name, or a phone, an email or a Discord username'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO app.people (full_name, stage, arrived_on, arrival_channel_id)
    VALUES (CASE WHEN named THEN left(btrim(intake.payload ->> 'name'), 200) END,
            CASE WHEN intake.payload ->> 'stage' IN ('new', 'welcomed', 'active', 'left')
                 THEN (intake.payload ->> 'stage')::app.stage ELSE 'new' END,
            CASE WHEN jsonb_typeof(intake.payload -> 'arrived_on') = 'null' THEN NULL
                 ELSE least(coalesce((intake.payload ->> 'arrived_on')::date, today), today) END,
            private.arrival_channel(intake.payload ->> 'arrival'))
    RETURNING id INTO person;
    PERFORM private.intake_attach(intake, person);
    RETURN person;
  END
  $$;

-- Migration arrivals_dated_and_placed's version, with the stays. An intake that carries none opens one as before
-- when it comes from the bot or names a chat (today, or its `joined_on`). One that carries `left_on` closes the open
-- stay, unless that stay began after it (an older stay, recorded apart), and is recorded once: a stay that left that
-- day is already there. One with `joined_on` and no `left_on` opens a stay, unless one is open, or the same stay
-- (by the day it began, or both unknown) has closed since.
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
    today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
    joined date := CASE WHEN jsonb_typeof(payload -> 'joined_on') = 'string'
                        THEN least((payload ->> 'joined_on')::date, today)
                        WHEN payload ? 'joined_on' THEN NULL
                        ELSE today END;
    gone date := least((payload ->> 'left_on')::date, today);
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

    IF payload ? 'left_on' THEN
      IF EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = person AND c.left_on = gone) THEN
        NULL;
      ELSIF EXISTS (SELECT 1 FROM app.community_presence c
                     WHERE c.person_id = person AND c.left_on IS NULL AND coalesce(c.joined_on, gone) <= gone) THEN
        UPDATE app.community_presence c SET left_on = gone, left_reported_by = intake.reported_by
         WHERE c.person_id = person AND c.left_on IS NULL;
      ELSE
        INSERT INTO app.community_presence (person_id, joined_on, left_on, chat, joined_reported_by, left_reported_by)
        VALUES (person, joined, gone, nullif(btrim(payload ->> 'chat'), ''), intake.reported_by, intake.reported_by);
      END IF;
    ELSIF (intake.source = 'telegram' OR payload ? 'chat' OR payload ? 'joined_on')
          AND NOT EXISTS (SELECT 1 FROM app.community_presence c
                           WHERE c.person_id = person
                             AND (c.left_on IS NULL
                                  OR (payload ? 'joined_on' AND c.joined_on IS NOT DISTINCT FROM joined))) THEN
      INSERT INTO app.community_presence (person_id, joined_on, chat, joined_reported_by)
      VALUES (person, joined, nullif(btrim(payload ->> 'chat'), ''), intake.reported_by);
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

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
