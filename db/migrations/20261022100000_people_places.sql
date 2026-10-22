-- migrate:up

-- Where someone lives, and where they're from (PLAN R74; Dani, 2026-10-22: "what if the person is originally from a
-- place but they live elsewhere, also what about latam and even other countries, there is people from madrid in
-- germany or USA"). The community is Spain's, Spaniards abroad, Latin America's and Latin Americans abroad (BRIEF).
-- - `country`: where they live, its ISO 3166-1 code; `province` (now "Provincia o región") and `town` stay as they
--   were, free text, so a region abroad fits as well as one of Spain's provinces, which the apps offer by name.
-- - "De dónde es": `origin_country` and `origin_province`, optional, a place and nothing more.
-- All three are personal data, and go wherever province and town go: the intake payload and the census answer (one
-- of these keys more is refused no longer), a field an arrival fills when empty or proposes when it differs, a merge
-- (the survivor's first), erasure.
ALTER TABLE app.people
  ADD COLUMN country text CHECK (country ~ '^[A-Z]{2}$'),
  ADD COLUMN origin_country text CHECK (origin_country ~ '^[A-Z]{2}$'),
  ADD COLUMN origin_province text CHECK (btrim(origin_province) <> '' AND length(origin_province) <= 100);
COMMENT ON COLUMN app.people.country IS 'personal data';
COMMENT ON COLUMN app.people.origin_country IS 'personal data';
COMMENT ON COLUMN app.people.origin_province IS 'personal data';
GRANT UPDATE (country, origin_country, origin_province) ON app.people TO pauseai_backoffice_app;

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
                     'country', 'origin_country', 'origin_province', 'languages', 'how_heard', 'chat', 'note',
                     'stage', 'joined_on', 'left_on', 'arrived_on', 'arrival');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'an intake payload takes no %', extra USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(coalesce(payload -> 'emails', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'phones', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'discords', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'languages', '[]')) <> 'array' THEN
      RAISE EXCEPTION 'emails, phones, discords and languages are arrays' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF (payload ->> 'country') !~ '^[A-Z]{2}$' OR (payload ->> 'origin_country') !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'a country is its ISO 3166-1 code' USING ERRCODE = 'invalid_parameter_value';
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

CREATE OR REPLACE FUNCTION private.check_census(answer jsonb) RETURNS void
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = ''
  AS $$
  DECLARE
    extra text;
  BEGIN
    IF jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'a census answer is an object' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(k, ', ') INTO extra FROM jsonb_object_keys(answer) k
     WHERE k NOT IN ('name', 'preferred_name', 'email', 'phone', 'province', 'town', 'country', 'origin_country',
                     'origin_province', 'languages', 'options',
                     'skills_other', 'interests_other', 'availability', 'how_heard', 'pronouns', 'consent_email',
                     'consent_whatsapp', 'consent_privacy', 'age_ok', 'wording_version');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'a census answer takes no %', extra USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF nullif(answer ->> 'country', '') !~ '^[A-Z]{2}$' OR nullif(answer ->> 'origin_country', '') !~ '^[A-Z]{2}$' THEN
      RAISE EXCEPTION 'a country is its ISO 3166-1 code' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    -- Under 14, consent must come from a parent or guardian (LOPDGDD art. 7): the form refuses them before this.
    IF (answer ->> 'age_ok') IS DISTINCT FROM 'true' OR (answer ->> 'consent_privacy') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'the census needs the age confirmed and the privacy notice accepted'
        USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(btrim(answer ->> 'name'), '') = '' OR answer ->> 'wording_version' IS NULL THEN
      RAISE EXCEPTION 'the census needs a name and the wording version' USING ERRCODE = 'check_violation';
    END IF;
  END
  $$;

CREATE OR REPLACE FUNCTION private.census_apply(person uuid, answer jsonb, link text) RETURNS void
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    identity record;
    answered timestamptz := coalesce((answer ->> 'answered_at')::timestamptz, now());
  BEGIN
    UPDATE app.people p
       SET full_name = left(btrim(answer ->> 'name'), 200),
           preferred_name = nullif(left(btrim(answer ->> 'preferred_name'), 100), ''),
           province = nullif(left(btrim(answer ->> 'province'), 100), ''),
           town = nullif(left(btrim(answer ->> 'town'), 100), ''),
           country = nullif(answer ->> 'country', ''),
           origin_country = nullif(answer ->> 'origin_country', ''),
           origin_province = nullif(left(btrim(answer ->> 'origin_province'), 100), ''),
           languages = coalesce(ARRAY(SELECT left(btrim(l), 50)
                                        FROM jsonb_array_elements_text(coalesce(answer -> 'languages', '[]')) l
                                       WHERE btrim(l) <> '' LIMIT 20), '{}'),
           availability = (answer ->> 'availability')::app.availability,
           how_heard = nullif(left(btrim(answer ->> 'how_heard'), 500), ''),
           pronouns = nullif(left(btrim(answer ->> 'pronouns'), 50), ''),
           skills_other = nullif(left(btrim(answer ->> 'skills_other'), 300), ''),
           interests_other = nullif(left(btrim(answer ->> 'interests_other'), 300), ''),
           profile_completed_at = now()
     WHERE p.id = person;
    DELETE FROM app.person_options o WHERE o.person_id = person;
    INSERT INTO app.person_options (person_id, option_id)
    SELECT person, o.id FROM app.census_options o
     WHERE o.active AND o.id::text IN (SELECT jsonb_array_elements_text(coalesce(answer -> 'options', '[]')));
    FOR identity IN
      SELECT 'email'::app.identity_kind AS kind, answer ->> 'email' AS value WHERE coalesce(answer ->> 'email', '') <> ''
      UNION ALL
      SELECT 'phone', answer ->> 'phone' WHERE coalesce(answer ->> 'phone', '') <> ''
    LOOP
      INSERT INTO app.identities (person_id, kind, value, verified, source)
      VALUES (person, identity.kind, identity.value, false, 'census')
      ON CONFLICT (kind, value) DO NOTHING;
    END LOOP;
    INSERT INTO app.person_sources (person_id, source) VALUES (person, 'census') ON CONFLICT DO NOTHING;
    INSERT INTO app.consents (person_id, kind, granted, wording_version, source, given_at)
    SELECT person, k.kind, coalesce((answer ->> ('consent_' || k.kind))::boolean, false), answer ->> 'wording_version',
           'census', answered
      FROM unnest(ARRAY['email', 'whatsapp', 'privacy']) AS k(kind);
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (person, 'form_submitted', jsonb_build_object('link', link, 'answeredAt', answered));
  END
  $$;

CREATE OR REPLACE FUNCTION private.submit_census(token_hash text, answer jsonb) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    link record;
    person uuid;
    intake uuid;
    outcome app.intake_status;
    matched uuid[];
    kept jsonb;
  BEGIN
    PERFORM private.check_census(answer);
    IF submit_census.token_hash IS NOT NULL THEN
      SELECT k.* INTO link FROM private.census_link_person(submit_census.token_hash) k;
      IF NOT FOUND THEN
        RETURN 'invalid';
      END IF;
      PERFORM 1 FROM app.census_links l WHERE l.id = link.link_id FOR UPDATE;
      PERFORM private.census_apply(link.person_id, answer, 'personal');
      UPDATE app.census_links l SET used_at = coalesce(l.used_at, now()) WHERE l.id = link.link_id;
      RETURN 'updated';
    END IF;

    -- Two answers with the same new email or phone at once (a double click, a reload): the second waits here until the
    -- first is done, then finds the person it made and waits in the Bandeja, instead of failing on an identity it can't
    -- add twice. Email first, then phone, always, so two answers never wait on each other.
    IF coalesce(answer ->> 'email', '') <> '' THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('census email ' || (answer ->> 'email'), 0));
    END IF;
    IF coalesce(answer ->> 'phone', '') <> '' THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('census phone ' || (answer ->> 'phone'), 0));
    END IF;

    INSERT INTO app.intake_records (source, external_id, payload, reported_by)
    VALUES ('census', 'censo:' || pg_catalog.gen_random_uuid()::text,
            jsonb_strip_nulls(jsonb_build_object(
              'name', btrim(answer ->> 'name'),
              'preferred_name', nullif(btrim(answer ->> 'preferred_name'), ''),
              'emails', CASE WHEN coalesce(answer ->> 'email', '') <> '' THEN jsonb_build_array(answer ->> 'email') END,
              'phones', CASE WHEN coalesce(answer ->> 'phone', '') <> '' THEN jsonb_build_array(answer ->> 'phone') END,
              'province', nullif(btrim(answer ->> 'province'), ''),
              'town', nullif(btrim(answer ->> 'town'), ''),
              'country', nullif(answer ->> 'country', ''),
              'origin_country', nullif(answer ->> 'origin_country', ''),
              'origin_province', nullif(btrim(answer ->> 'origin_province'), ''),
              'stage', 'to_triage')),
            NULL)
    RETURNING id INTO intake;
    -- Anyone can type anyone's number: an answer that matches someone never applies itself, and waits in the Bandeja
    -- with the time it was given (a conflict to apply, or, matching two people, one to attach first); one that matches
    -- nobody makes a new person.
    SELECT coalesce(array_agg(DISTINCT private.survivor(i.person_id)), '{}') INTO matched
      FROM app.identities i
     WHERE (i.kind = 'email' AND i.value = answer ->> 'email') OR (i.kind = 'phone' AND i.value = answer ->> 'phone');
    IF cardinality(matched) > 0 THEN
      kept := (answer - 'age_ok') || jsonb_build_object('answered_at', now());
      UPDATE app.intake_records r
         SET status = CASE WHEN cardinality(matched) = 1 THEN 'conflict'::app.intake_status ELSE 'review' END,
             person_id = CASE WHEN cardinality(matched) = 1 THEN matched[1] END,
             candidates = CASE WHEN cardinality(matched) > 1 THEN matched ELSE '{}' END,
             conflicts = jsonb_build_object('census', kept)
       WHERE r.id = intake;
      RETURN 'review';
    END IF;
    outcome := private.intake_process(intake, 'new', NULL);
    SELECT r.person_id INTO person FROM app.intake_records r WHERE r.id = intake;
    IF outcome = 'created' AND person IS NOT NULL THEN
      PERFORM private.census_apply(person, answer, 'generic');
      RETURN 'created';
    END IF;
    RETURN 'review';
  END
  $$;

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
    FOREACH field IN ARRAY ARRAY['preferred_name', 'province', 'town', 'country', 'origin_country', 'origin_province',
                                 'how_heard'] LOOP
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
    -- One account, one person: two records each linked to an account are two people, or one with two accounts, for an
    -- admin to sort out by unlinking one first.
    IF EXISTS (SELECT 1 FROM app.staff s WHERE s.person_id = survivor)
       AND EXISTS (SELECT 1 FROM app.staff s WHERE s.person_id = merged) THEN
      RAISE EXCEPTION 'both people are linked to team accounts' USING ERRCODE = 'restrict_violation';
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
           country = coalesce(p.country, gone.country),
           origin_country = coalesce(p.origin_country, gone.origin_country),
           origin_province = coalesce(p.origin_province, gone.origin_province),
           pronouns = coalesce(p.pronouns, gone.pronouns),
           availability = coalesce(p.availability, gone.availability),
           how_heard = coalesce(p.how_heard, gone.how_heard),
           summary = coalesce(p.summary, gone.summary),
           languages = ARRAY(SELECT DISTINCT l FROM unnest(p.languages || gone.languages) l ORDER BY l),
           profile_completed_at = greatest(p.profile_completed_at, gone.profile_completed_at),
           arrived_on = least(p.arrived_on, gone.arrived_on),
           arrival_channel_id = coalesce(p.arrival_channel_id, gone.arrival_channel_id)
     WHERE p.id = survivor;
    -- The account follows its person to the survivor.
    UPDATE app.staff s SET person_id = survivor WHERE s.person_id = merged;
    UPDATE app.people p SET merged_into = survivor, owner_id = NULL, next_action = NULL, next_action_due = NULL
     WHERE p.id = merged;
  END
  $$;

CREATE OR REPLACE FUNCTION private.anonymise_person(person uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    subject app.people;
    chain uuid[];
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.* INTO subject FROM app.people p WHERE p.id = private.survivor(anonymise_person.person) FOR UPDATE;
    IF NOT FOUND OR subject.anonymised_at IS NOT NULL THEN
      RETURN false;
    END IF;
    -- The person and every duplicate merged into them, at any depth.
    WITH RECURSIVE merged (id) AS (
      SELECT subject.id
      UNION
      SELECT p.id FROM app.people p JOIN merged m ON p.merged_into = m.id)
    SELECT array_agg(m.id) INTO chain FROM merged m;
    PERFORM 1 FROM app.people p WHERE p.id = ANY (chain) FOR UPDATE;

    UPDATE app.community_presence c SET chat = NULL WHERE c.person_id = ANY (chain);
    DELETE FROM app.identities i WHERE i.person_id = ANY (chain);
    DELETE FROM app.person_options o WHERE o.person_id = ANY (chain);
    DELETE FROM app.census_links l WHERE l.person_id = ANY (chain);
    -- The account stays (it is someone's sign-in), but no longer names who they were.
    UPDATE app.staff s SET person_id = NULL WHERE s.person_id = ANY (chain);
    -- Their own records forget the payload, and keep only a hash of their external id (above).
    UPDATE app.intake_records r
       SET payload = '{}', conflicts = '{}', candidates = '{}',
           external_id = CASE WHEN r.external_id LIKE 'erased:%' THEN r.external_id
                              ELSE private.erased_ref(r.source, r.external_id) END
     WHERE r.person_id = ANY (chain);
    -- Someone else's arrival that only named them as a possible duplicate just stops naming them.
    UPDATE app.intake_records r
       SET candidates = ARRAY(SELECT c FROM unnest(r.candidates) AS c WHERE c <> ALL (chain))
     WHERE r.candidates && chain AND (r.person_id IS NULL OR NOT (r.person_id = ANY (chain)));
    UPDATE app.people p
       SET full_name = 'Persona anonimizada', preferred_name = NULL, province = NULL, town = NULL,
           country = NULL, origin_country = NULL, origin_province = NULL, languages = '{}',
           pronouns = NULL, availability = NULL, how_heard = NULL, next_action = NULL, next_action_due = NULL,
           skills_other = NULL, interests_other = NULL, summary = NULL, owner_id = NULL, anonymised_at = now()
     WHERE p.id = ANY (chain) AND p.anonymised_at IS NULL;
    -- Last, so the events the update above just wrote are redacted too.
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.person_events e SET body = NULL, data = '{}' WHERE e.person_id = ANY (chain);
    PERFORM set_config('app.redact', '', true);
    RETURN true;
  END
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
