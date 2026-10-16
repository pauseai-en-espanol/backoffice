-- migrate:up

-- Two generic census answers with the same new email or phone at once (PLAN, open from the review): the second
-- failed on the identity the first had just added. Now it waits for the first, and goes to the Bandeja.
-- submit_census as in migration erasure_and_census_fixes, plus the locks before the match.

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

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
