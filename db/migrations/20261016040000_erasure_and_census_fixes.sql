-- migrate:up

-- Erasure that holds, and the census's loose ends (security review of M2, PLAN R30 to R33):
-- - an erased person's intake records keep only a hash of their external id, so the hourly Airtable sync or the same
--   CSV again recognises them and brings nothing back, instead of re-attaching the record to "Persona anonimizada";
-- - erasure covers every duplicate merged into the person, and no longer wipes another arrival's record that only
--   named them as a candidate;
-- - an erased person is frozen: nothing adds identities, sources, options, presence, links or consents to them, and
--   their row doesn't change again;
-- - a census answer applied from the Bandeja brings its email and phone (those nobody holds) and the census source,
--   and its consents keep the time the person gave them, not the time staff applied them;
-- - a personal link is the person's latest only (a new one replaces it), and follows a merge to the survivor;
-- - a census answer that matched two people is attached to one of them, then applied or dropped.

-- An erased record's external id: a hash a later sync or import of the same record can still be recognised by.
CREATE FUNCTION private.erased_ref(source app.source_kind, external_id text) RETURNS text
  LANGUAGE sql IMMUTABLE
  SET search_path = ''
  AS $$
    SELECT 'erased:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(source::text || ':' || external_id,
                                                                                    'UTF8')), 'hex')
  $$;

-- An external id names a record in someone else's system (Global's Airtable): it identifies the person there.
COMMENT ON COLUMN app.intake_records.external_id IS 'personal data';

-- Erased people are frozen ------------------------------------------------------------------------------------------

CREATE FUNCTION private.refuse_anonymised_person() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    RAISE EXCEPTION 'person % was erased', OLD.id USING ERRCODE = 'restrict_violation';
  END
  $$;

CREATE FUNCTION private.refuse_anonymised_detail() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM app.people p WHERE p.id = NEW.person_id AND p.anonymised_at IS NOT NULL) THEN
      RAISE EXCEPTION 'person % was erased', NEW.person_id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER erased BEFORE UPDATE ON app.people
  FOR EACH ROW WHEN (OLD.anonymised_at IS NOT NULL) EXECUTE FUNCTION private.refuse_anonymised_person();
CREATE TRIGGER erased BEFORE INSERT OR UPDATE ON app.identities
  FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();
CREATE TRIGGER erased BEFORE INSERT ON app.person_sources
  FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();
CREATE TRIGGER erased BEFORE INSERT ON app.person_options
  FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();
CREATE TRIGGER erased BEFORE INSERT OR UPDATE ON app.community_presence
  FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();
CREATE TRIGGER erased BEFORE INSERT ON app.census_links
  FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();
CREATE TRIGGER erased BEFORE INSERT ON app.consents
  FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();

-- Imports skip what was erased ---------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.import_batch(kind text, source app.source_kind, file_sha256 text, records jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    run uuid;
    item jsonb;
    made uuid;
    existing app.intake_records;
    outcome app.intake_status;
    tally jsonb := jsonb_build_object('received', 0, 'unchanged', 0, 'created', 0, 'attached', 0, 'review', 0,
                                       'conflict', 0, 'updated', 0, 'erased', 0);
  BEGIN
    IF jsonb_typeof(records) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'records are an array' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO app.imports (kind, started_by, file_sha256)
    VALUES (import_batch.kind, private.current_user_id(), import_batch.file_sha256)
    RETURNING id INTO run;
    FOR item IN SELECT * FROM jsonb_array_elements(records) LOOP
      tally := jsonb_set(tally, '{received}', to_jsonb((tally ->> 'received')::int + 1));
      PERFORM private.check_payload(item -> 'payload');
      -- A record of someone erased: counted, never brought back.
      IF EXISTS (SELECT 1 FROM app.intake_records i
                  WHERE i.source = import_batch.source
                    AND i.external_id = private.erased_ref(import_batch.source, item ->> 'external_id')) THEN
        tally := jsonb_set(tally, '{erased}', to_jsonb((tally ->> 'erased')::int + 1));
        CONTINUE;
      END IF;
      SELECT i.* INTO existing FROM app.intake_records i
       WHERE i.source = import_batch.source AND i.external_id = item ->> 'external_id' FOR UPDATE;
      IF FOUND AND existing.person_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM app.people p
                      WHERE p.id = private.survivor(existing.person_id) AND p.anonymised_at IS NOT NULL) THEN
        tally := jsonb_set(tally, '{erased}', to_jsonb((tally ->> 'erased')::int + 1));
        CONTINUE;
      ELSIF FOUND AND existing.payload = item -> 'payload' THEN
        tally := jsonb_set(tally, '{unchanged}', to_jsonb((tally ->> 'unchanged')::int + 1));
        CONTINUE;
      ELSIF FOUND THEN
        UPDATE app.intake_records i SET payload = item -> 'payload', import_id = run WHERE i.id = existing.id;
        tally := jsonb_set(tally, '{updated}', to_jsonb((tally ->> 'updated')::int + 1));
        IF existing.person_id IS NOT NULL THEN
          SELECT i.* INTO existing FROM app.intake_records i WHERE i.id = existing.id;
          IF private.intake_attach(existing, existing.person_id) <> '{}' THEN
            UPDATE app.intake_records i SET status = 'conflict' WHERE i.id = existing.id;
          END IF;
        END IF;
        CONTINUE;
      END IF;
      INSERT INTO app.intake_records (source, external_id, payload, import_id, reported_by)
      VALUES (import_batch.source, item ->> 'external_id', item -> 'payload', run, private.current_user_id())
      RETURNING id INTO made;
      outcome := private.intake_process(made, NULL, NULL);
      tally := jsonb_set(tally, ARRAY[outcome::text], to_jsonb(coalesce((tally ->> outcome::text)::int, 0) + 1));
    END LOOP;
    UPDATE app.imports i SET finished_at = now(), counts = tally WHERE i.id = run;
    RETURN tally || jsonb_build_object('import_id', run);
  END
  $$;

-- Erasure, again (migration census's version, plus the above) ---------------------------------------------------------

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
       SET full_name = 'Persona anonimizada', preferred_name = NULL, province = NULL, town = NULL, languages = '{}',
           pronouns = NULL, availability = NULL, how_heard = NULL, next_action = NULL, next_action_due = NULL,
           skills_other = NULL, interests_other = NULL, owner_id = NULL, anonymised_at = now()
     WHERE p.id = ANY (chain) AND p.anonymised_at IS NULL;
    -- Last, so the events the update above just wrote are redacted too.
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.person_events e SET body = NULL, data = '{}' WHERE e.person_id = ANY (chain);
    PERFORM set_config('app.redact', '', true);
    RETURN true;
  END
  $$;

-- The census -----------------------------------------------------------------------------------------------------------

-- When the person gave a consent: their answer's time, which staff may apply later.
ALTER TABLE app.consents ADD COLUMN given_at timestamptz NOT NULL DEFAULT now();

-- A personal link's person, if the link is still good: not expired, the person's latest (a new link replaces it),
-- followed through a merge to the survivor, who isn't erased. Internal: census_form and submit_census use it.
CREATE FUNCTION private.census_link_person(token_hash text)
  RETURNS TABLE (link_id uuid, person_id uuid)
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
    SELECT l.id, private.survivor(l.person_id)
      FROM app.census_links l
     WHERE l.token_hash = census_link_person.token_hash AND l.expires_at > now()
       AND NOT EXISTS (SELECT 1 FROM app.census_links n
                        WHERE n.person_id = l.person_id AND (n.created_at, n.id) > (l.created_at, l.id))
       AND EXISTS (SELECT 1 FROM app.people p
                    WHERE p.id = private.survivor(l.person_id) AND p.anonymised_at IS NULL)
  $$;

CREATE OR REPLACE FUNCTION private.census_form(token_hash text DEFAULT NULL)
  RETURNS TABLE (options jsonb, greeting text, link text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'label', o.label)
                                      ORDER BY o.kind, o.position, o.label), '[]')
              FROM app.census_options o WHERE o.active),
           (SELECT coalesce(p.preferred_name, split_part(p.full_name, ' ', 1))
              FROM private.census_link_person(census_form.token_hash) k JOIN app.people p ON p.id = k.person_id),
           CASE WHEN census_form.token_hash IS NULL THEN 'generic'
                WHEN EXISTS (SELECT 1 FROM private.census_link_person(census_form.token_hash)) THEN 'personal'
                ELSE 'invalid' END
  $$;

-- What a person's own answer sets (migration census's version, plus): the email and phone it brings that nobody else
-- holds, the census as a source, and consents given when the person answered (`answered_at`, kept with an answer that
-- waits in the Bandeja).
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

    INSERT INTO app.intake_records (source, external_id, payload, reported_by)
    VALUES ('census', 'censo:' || pg_catalog.gen_random_uuid()::text,
            jsonb_strip_nulls(jsonb_build_object(
              'name', btrim(answer ->> 'name'),
              'preferred_name', nullif(btrim(answer ->> 'preferred_name'), ''),
              'emails', CASE WHEN coalesce(answer ->> 'email', '') <> '' THEN jsonb_build_array(answer ->> 'email') END,
              'phones', CASE WHEN coalesce(answer ->> 'phone', '') <> '' THEN jsonb_build_array(answer ->> 'phone') END,
              'province', nullif(btrim(answer ->> 'province'), ''),
              'town', nullif(btrim(answer ->> 'town'), ''),
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

-- The Bandeja's decisions (migration census's version, plus): a census answer that matched two people is attached to
-- one of them by a person, and then waits to be applied to them or dropped; it can't make a new person, since both
-- already hold its email or phone.
CREATE OR REPLACE FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid DEFAULT NULL)
  RETURNS app.intake_status
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    intake app.intake_records;
    field text;
    census jsonb;
    outcome app.intake_status;
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT i.* INTO intake FROM app.intake_records i WHERE i.id = intake_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no intake record %', intake_id USING ERRCODE = 'no_data_found';
    END IF;
    census := intake.conflicts -> 'census';
    IF intake.status = 'review' AND census IS NOT NULL AND decision IN ('attach', 'new') THEN
      IF decision = 'new' THEN
        RAISE EXCEPTION 'a census answer that matched two people is attached to one of them, or discarded'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF target IS NULL OR NOT (target = ANY (intake.candidates)) THEN
        RAISE EXCEPTION 'attach to one of the candidates' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      UPDATE app.intake_records i
         SET status = 'conflict', person_id = private.survivor(target), candidates = '{}'
       WHERE i.id = intake_id;
      RETURN 'conflict';
    END IF;
    IF intake.status = 'review' AND decision IN ('attach', 'new', 'discard') THEN
      IF decision = 'attach' AND NOT (target = ANY (intake.candidates)) THEN
        RAISE EXCEPTION 'attach to one of the candidates' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      outcome := private.intake_process(intake_id, decision, target);
      IF census IS NOT NULL AND outcome IN ('attached', 'conflict', 'created') THEN
        UPDATE app.intake_records i
           SET status = 'conflict', conflicts = i.conflicts || jsonb_build_object('census', census),
               decided_at = NULL, decided_by = NULL
         WHERE i.id = intake_id;
        RETURN 'conflict';
      END IF;
      RETURN outcome;
    END IF;
    IF intake.status = 'conflict' AND decision IN ('apply', 'keep') THEN
      IF decision = 'apply' THEN
        FOR field IN SELECT k FROM jsonb_object_keys(intake.conflicts) k WHERE k NOT IN ('identities', 'census') LOOP
          EXECUTE format('UPDATE app.people SET %I = $1 WHERE id = $2', field)
            USING intake.conflicts -> field ->> 'proposed', intake.person_id;
        END LOOP;
        IF census IS NOT NULL THEN
          PERFORM private.census_apply(intake.person_id, census, 'generic');
        END IF;
      END IF;
      UPDATE app.intake_records i SET status = 'attached', conflicts = '{}', decided_at = now(),
             decided_by = private.current_user_id() WHERE i.id = intake_id;
      RETURN 'attached';
    END IF;
    RAISE EXCEPTION 'intake record % is %: % is not a decision for it', intake_id, intake.status, decision
      USING ERRCODE = 'restrict_violation';
  END
  $$;

REVOKE ALL ON FUNCTION private.erased_ref(app.source_kind, text), private.census_link_person(text) FROM PUBLIC;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
