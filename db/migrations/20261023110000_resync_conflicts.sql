-- migrate:up

-- A record a source sends again, changed (PLAN R78; Dani, 2026-10-23: "bandeja is very weird … there is no comparison
-- and no anchor to understand or make the call"). It was attached to its person again whole, and when anything differed
-- it waited in the Bandeja as a conflict without saying what: the differences were never kept, so the Bandeja showed
-- nothing to compare and "Usar lo que ha llegado" had nothing to use. And a value someone had corrected by hand was
-- proposed back at every change, however small (R74's country, say, which every Airtable record gains).
-- - Now only what the source changed is attached again (a field it didn't change is left as the person has it), and
--   what differs is kept with the record, as a first arrival's is.
-- - The conflicts already waiting with nothing kept are said again: each field the record brings that the person has
--   otherwise (as an arrival compares them: their name, preferred name, place, how they heard), or, with nothing that
--   differs, settled as attached.

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
    changed app.intake_records;
    found_conflicts jsonb;
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
          -- Only what the source changed is attached again, so a value someone corrected by hand isn't proposed back at
          -- every sync; and what differs is kept, for the Bandeja to show and apply.
          SELECT i.* INTO changed FROM app.intake_records i WHERE i.id = existing.id;
          changed.payload := (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}')
                                FROM jsonb_each(item -> 'payload') AS e(key, value)
                               WHERE existing.payload -> e.key IS DISTINCT FROM e.value);
          found_conflicts := private.intake_attach(changed, private.survivor(existing.person_id));
          IF found_conflicts <> '{}' THEN
            UPDATE app.intake_records i
               SET status = 'conflict', conflicts = i.conflicts || found_conflicts, decided_at = NULL,
                   decided_by = NULL
             WHERE i.id = existing.id;
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

UPDATE app.intake_records r
   SET conflicts = d.found
  FROM (SELECT r2.id,
               (SELECT coalesce(jsonb_object_agg(x.field,
                                                 jsonb_build_object('current', x.held, 'proposed', x.proposed)),
                                '{}')
                  FROM (VALUES ('full_name', p.full_name, nullif(btrim(r2.payload ->> 'name'), '')),
                               ('preferred_name', p.preferred_name, nullif(btrim(r2.payload ->> 'preferred_name'), '')),
                               ('province', p.province, nullif(btrim(r2.payload ->> 'province'), '')),
                               ('town', p.town, nullif(btrim(r2.payload ->> 'town'), '')),
                               ('country', p.country, nullif(btrim(r2.payload ->> 'country'), '')),
                               ('how_heard', p.how_heard, nullif(btrim(r2.payload ->> 'how_heard'), '')))
                       AS x(field, held, proposed)
                 WHERE x.held IS NOT NULL AND x.proposed IS NOT NULL
                   AND private.fold_name(x.held) <> private.fold_name(x.proposed)) AS found
          FROM app.intake_records r2
          JOIN app.people p ON p.id = private.survivor(r2.person_id)
         WHERE r2.status = 'conflict' AND r2.conflicts = '{}' AND r2.source <> 'census') d
 WHERE r.id = d.id;

UPDATE app.intake_records r SET status = 'attached', decided_at = now()
 WHERE r.status = 'conflict' AND r.conflicts = '{}' AND r.source <> 'census';

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
