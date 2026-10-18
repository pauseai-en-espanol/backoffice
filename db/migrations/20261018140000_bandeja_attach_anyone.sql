-- migrate:up

-- A possible duplicate in the Bandeja is attached to whoever a person finds is the same, not only to the candidates
-- the matcher offered (PLAN R60; Dani, 2026-10-18: "duplicates currently are hard to manage ... when you search by hand
-- only the original shows"): the staff app's "Buscar a otra persona" finds them by name, phone or email. Anyone still
-- in the backoffice: intake_process refuses an erased person, and a merged one stands for its survivor. A census
-- answer is still attached only to one of its candidates (R22: anyone can type anyone's number).

-- Migration erasure_and_census_fixes's version, with that.
CREATE OR REPLACE FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid DEFAULT NULL)
  RETURNS app.intake_status
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $_$
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
      IF decision = 'attach'
         AND (target IS NULL OR (intake.source = 'census' AND NOT (target = ANY (intake.candidates)))) THEN
        RAISE EXCEPTION 'attach to someone; a census answer, to one of its candidates'
          USING ERRCODE = 'invalid_parameter_value';
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
  $_$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
