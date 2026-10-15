-- migrate:up

-- Intake (onboarding spec, intake sources and matching): every source (Airtable, the bot, quick-add, CSV) produces
-- intake records, and one matcher, here, turns each into a new person, an update to an existing one, or an item in the
-- Bandeja. Every import is idempotent. Staff, the bot and the Airtable sync reach the matcher only through the narrow
-- functions below, each of which checks its caller (ADR-0002, ADR-0004, ADR-0005).

CREATE TABLE app.imports (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  kind         text NOT NULL CHECK (kind IN ('airtable', 'csv')),
  started_by   uuid REFERENCES app.staff (user_id),           -- null for the scheduled sync
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  file_sha256  text CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  counts       jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(counts) = 'object')
);

CREATE TABLE app.intake_records (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  source       app.source_kind NOT NULL,
  -- What makes a re-import a no-op: the Airtable record id, a CSV row's hash, the bot's report id.
  external_id  text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  -- Only the mapped fields (ADR-0005: never the rest of Global's record): name, preferred_name, emails, phones,
  -- airtable_id, province, town, languages, how_heard, chat, note, stage, joined_on.
  payload      jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status       app.intake_status NOT NULL DEFAULT 'pending',
  person_id    uuid REFERENCES app.people (id),
  -- Possible duplicates waiting for a decision.
  candidates   uuid[] NOT NULL DEFAULT '{}',
  -- Values that disagree with the person's: {"field": {"current": …, "proposed": …}}. Never applied by themselves.
  conflicts    jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(conflicts) = 'object'),
  import_id    uuid REFERENCES app.imports (id),
  reported_by  uuid REFERENCES app.staff (user_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   uuid,
  UNIQUE (source, external_id)
);
COMMENT ON COLUMN app.intake_records.payload IS 'personal data';
COMMENT ON COLUMN app.intake_records.conflicts IS 'personal data';
CREATE INDEX intake_records_status_idx ON app.intake_records (status) WHERE status IN ('review', 'conflict');
CREATE INDEX intake_records_person_id_idx ON app.intake_records (person_id);

-- Every export of people, by an admin: what, when, how many (onboarding spec, views: every export is audited).
CREATE TABLE app.exports (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  kind        text NOT NULL CHECK (kind IN ('people_csv', 'person_json')),
  filter      jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(filter) = 'object'),
  row_count   integer NOT NULL CHECK (row_count >= 0),
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN app.exports.filter IS 'personal data';

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.imports
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.intake_records
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.intake_records
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.exports
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.exports
  FOR EACH ROW EXECUTE FUNCTION private.audit();

ALTER TABLE app.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.intake_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.exports ENABLE ROW LEVEL SECURITY;

-- Onboarding staff and admins see imports and intake records (Importar, Bandeja); they're written only by the
-- functions below.
GRANT SELECT ON app.imports, app.intake_records TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.imports FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_read ON app.intake_records FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));

-- Admins export, and see who exported what.
GRANT SELECT, INSERT (kind, filter, row_count) ON app.exports TO pauseai_backoffice_app;
CREATE POLICY admin_read ON app.exports FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')));
CREATE POLICY admin_insert ON app.exports FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin')));

-- What needs attention (onboarding spec, attention rules): computed on read, never stored, from the settings'
-- thresholds. One row per person who isn't a tombstone; `reasons` in the spec's order, empty when nothing is due.
CREATE VIEW app.people_attention WITH (security_invoker = true) AS
SELECT p.id AS person_id,
       array_remove(ARRAY[
         CASE WHEN p.stage = 'new' AND p.owner_id IS NULL THEN 'unassigned' END,
         CASE WHEN p.next_action_due <= (now() AT TIME ZONE 'Europe/Madrid')::date THEN 'action_due' END,
         CASE WHEN p.stage IN ('new', 'contacting', 'talking', 'welcomed') AND p.next_action IS NULL
              THEN 'no_next_step' END,
         CASE WHEN p.stage = 'contacting'
                   AND (SELECT max(e.created_at) FROM app.person_events e
                         WHERE e.person_id = p.id AND e.kind = 'contact_attempt')
                       < now() - make_interval(days => s.follow_up_days)
              THEN 'follow_up' END,
         CASE WHEN p.stage IN ('new', 'contacting', 'talking', 'welcomed', 'active')
                   AND EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NOT NULL)
                   AND NOT EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NULL)
              THEN 'left_community' END,
         CASE WHEN EXISTS (SELECT 1 FROM app.intake_records i
                            WHERE i.status = 'review' AND (p.id = ANY (i.candidates) OR i.person_id = p.id))
              THEN 'possible_duplicate' END
       ], NULL) AS reasons
  FROM app.people p
 CROSS JOIN app.settings s
 WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL;

GRANT SELECT ON app.people_attention TO pauseai_backoffice_app;

-- The matcher -----------------------------------------------------------------------------------------------------
-- Internal: these run as the owner, called only by the checked entry points further down. No runtime role may call
-- them directly.

-- A payload's identities, as `app.identities` stores them (the API normalised them; the table's checks refuse
-- anything else).
CREATE FUNCTION private.intake_identities(payload jsonb)
  RETURNS TABLE (kind app.identity_kind, value text)
  LANGUAGE sql IMMUTABLE
  SET search_path = ''
  AS $$
    SELECT 'email'::app.identity_kind, e FROM jsonb_array_elements_text(coalesce(payload -> 'emails', '[]')) e
    UNION
    SELECT 'phone'::app.identity_kind, p FROM jsonb_array_elements_text(coalesce(payload -> 'phones', '[]')) p
    UNION
    SELECT 'airtable'::app.identity_kind, payload ->> 'airtable_id' WHERE payload ? 'airtable_id'
  $$;

-- Who a person is now: a tombstone's survivor, followed to the end.
CREATE FUNCTION private.survivor(person uuid) RETURNS uuid
  LANGUAGE plpgsql STABLE
  SET search_path = ''
  AS $$
  DECLARE
    current uuid := person;
    next uuid;
  BEGIN
    FOR step IN 1..20 LOOP
      SELECT p.merged_into INTO next FROM app.people p WHERE p.id = current;
      IF next IS NULL THEN
        RETURN current;
      END IF;
      current := next;
    END LOOP;
    RAISE EXCEPTION 'merges of % go deeper than 20', person;
  END
  $$;

-- People whose name is like the payload's (onboarding spec, matching): pg_trgm's similarity of the folded names, a
-- little more when the province is the same too, at least the settings' threshold. Best first, at most five.
CREATE FUNCTION private.similar_people(name text, province text)
  RETURNS TABLE (person_id uuid, score numeric)
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
    WITH scored AS (
      SELECT p.id,
             extensions.similarity(p.name_folded, private.fold_name(similar_people.name))
             + CASE WHEN similar_people.province IS NOT NULL
                         AND private.fold_name(p.province) = private.fold_name(similar_people.province)
                    THEN 0.15 ELSE 0 END AS score
        FROM app.people p
       WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL
         AND coalesce(btrim(similar_people.name), '') <> ''
    )
    SELECT c.id, round(c.score::numeric, 2)
      FROM scored c CROSS JOIN app.settings s
     WHERE c.score >= s.match_threshold
     ORDER BY c.score DESC, c.id
     LIMIT 5
  $$;

-- Adds a payload to a person: its identities (one that another person holds is a conflict, never moved), the
-- source, empty profile fields filled, disagreeing ones recorded as conflicts (never applied), a join to the
-- community, and its note. Returns the conflicts.
CREATE FUNCTION private.intake_attach(intake app.intake_records, person uuid) RETURNS jsonb
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

    IF coalesce(btrim(payload ->> 'name'), '') <> ''
       AND private.fold_name(payload ->> 'name') <> subject.name_folded THEN
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

-- Makes a person from a payload: its name (required), profile, and the stage it asks for (`to_triage`, `new`,
-- `welcomed` or `active`, onboarding spec: existing members come in as those), then attaches the rest.
CREATE FUNCTION private.intake_create(intake app.intake_records) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    person uuid;
  BEGIN
    IF coalesce(btrim(intake.payload ->> 'name'), '') = '' THEN
      RAISE EXCEPTION 'a new person needs a name' USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO app.people (full_name, stage)
    VALUES (left(btrim(intake.payload ->> 'name'), 200),
            CASE WHEN intake.payload ->> 'stage' IN ('to_triage', 'new', 'welcomed', 'active')
                 THEN (intake.payload ->> 'stage')::app.stage ELSE 'new' END)
    RETURNING id INTO person;
    PERFORM private.intake_attach(intake, person);
    RETURN person;
  END
  $$;

-- Turns one intake record into its outcome (onboarding spec, matching):
-- - an identity someone already has attaches it to them (two people holding its identities: both are possible
--   duplicates, for a person to decide);
-- - otherwise `decision` says: 'attach' to `target` (the reporter recognised them), 'new', or 'discard';
-- - with no decision, a name like someone else's goes to the Bandeja as a possible duplicate, and anything else
--   makes a new person.
CREATE FUNCTION private.intake_process(intake_id uuid, decision text, target uuid) RETURNS app.intake_status
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    intake app.intake_records;
    exact uuid[];
    alike uuid[];
    person uuid;
    found_conflicts jsonb;
    outcome app.intake_status;
  BEGIN
    SELECT i.* INTO intake FROM app.intake_records i WHERE i.id = intake_id FOR UPDATE;
    IF intake.status NOT IN ('pending', 'review') THEN
      RETURN intake.status;
    END IF;
    IF decision = 'discard' THEN
      UPDATE app.intake_records i SET status = 'discarded', decided_at = now(),
             decided_by = private.current_user_id() WHERE i.id = intake_id;
      RETURN 'discarded';
    END IF;
    SELECT coalesce(array_agg(DISTINCT private.survivor(i.person_id)), '{}') INTO exact
      FROM private.intake_identities(intake.payload) x
      JOIN app.identities i ON i.kind = x.kind AND i.value = x.value;
    IF cardinality(exact) > 1 THEN
      UPDATE app.intake_records i SET status = 'review', candidates = exact WHERE i.id = intake_id;
      RETURN 'review';
    END IF;
    IF cardinality(exact) = 1 THEN
      person := exact[1];
    ELSIF decision = 'attach' THEN
      person := private.survivor(target);
      IF NOT EXISTS (SELECT 1 FROM app.people p WHERE p.id = person AND p.anonymised_at IS NULL) THEN
        RAISE EXCEPTION 'no person % to attach to', target USING ERRCODE = 'foreign_key_violation';
      END IF;
    ELSIF decision IS DISTINCT FROM 'new' THEN
      SELECT coalesce(array_agg(s.person_id), '{}') INTO alike
        FROM private.similar_people(intake.payload ->> 'name', intake.payload ->> 'province') s;
      IF cardinality(alike) > 0 THEN
        UPDATE app.intake_records i SET status = 'review', candidates = alike WHERE i.id = intake_id;
        RETURN 'review';
      END IF;
    END IF;

    IF person IS NULL THEN
      person := private.intake_create(intake);
      outcome := 'created';
      found_conflicts := '{}';
    ELSE
      found_conflicts := private.intake_attach(intake, person);
      outcome := CASE WHEN found_conflicts = '{}' THEN 'attached' ELSE 'conflict' END;
    END IF;
    UPDATE app.intake_records i
       SET status = outcome, person_id = person, candidates = '{}', conflicts = found_conflicts,
           decided_at = CASE WHEN outcome = 'conflict' THEN NULL ELSE now() END,
           decided_by = CASE WHEN outcome = 'conflict' THEN NULL ELSE private.current_user_id() END
     WHERE i.id = intake_id;
    RETURN outcome;
  END
  $$;

-- Entry points ----------------------------------------------------------------------------------------------------

-- A payload as the matcher takes it: an object whose name is text, whose emails and phones are arrays of text, and
-- whose keys are the mapped fields only (ADR-0005: nothing else of a source's record is kept).
CREATE FUNCTION private.check_payload(payload jsonb) RETURNS void
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
     WHERE k NOT IN ('name', 'preferred_name', 'emails', 'phones', 'airtable_id', 'province', 'town', 'languages',
                     'how_heard', 'chat', 'note', 'stage', 'joined_on');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'an intake payload takes no %', extra USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(coalesce(payload -> 'emails', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'phones', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'languages', '[]')) <> 'array' THEN
      RAISE EXCEPTION 'emails, phones and languages are arrays' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END
  $$;

-- Whether the actor may report and decide on intake: onboarding staff and admins, through the staff app or, if
-- `bot` is true, the bot too.
CREATE FUNCTION private.may_intake(bot boolean) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
    SELECT private.staff_can('admin', 'onboarding') OR (bot AND private.bot_can('admin', 'onboarding'))
  $$;

-- A report or quick-add (onboarding spec, intake sources): from the staff app ('manual'), or from the bot
-- ('telegram'), each only through its own channel. `external_id` makes it idempotent: the same report twice is one.
-- Returns the record, its status and the person it became or joined.
CREATE FUNCTION private.submit_intake(source app.source_kind, external_id text, payload jsonb,
                                      decision text DEFAULT NULL, target uuid DEFAULT NULL)
  RETURNS TABLE (intake_id uuid, status app.intake_status, person_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    made uuid;
  BEGIN
    IF NOT ((submit_intake.source = 'manual' AND private.staff_can('admin', 'onboarding'))
            OR (submit_intake.source = 'telegram' AND private.bot_can('admin', 'onboarding'))) THEN
      RAISE EXCEPTION 'not allowed to report through % here', submit_intake.source
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF decision IS NOT NULL AND decision NOT IN ('attach', 'new') THEN
      RAISE EXCEPTION 'unknown decision %', decision USING ERRCODE = 'invalid_parameter_value';
    END IF;
    PERFORM private.check_payload(payload);
    INSERT INTO app.intake_records (source, external_id, payload, reported_by)
    VALUES (submit_intake.source, submit_intake.external_id, payload, private.current_user_id())
    ON CONFLICT ON CONSTRAINT intake_records_source_external_id_key DO NOTHING
    RETURNING id INTO made;
    IF made IS NULL THEN
      SELECT i.id INTO made FROM app.intake_records i
       WHERE i.source = submit_intake.source AND i.external_id = submit_intake.external_id;
    ELSE
      PERFORM private.intake_process(made, decision, target);
    END IF;
    RETURN QUERY SELECT i.id, i.status, i.person_id FROM app.intake_records i WHERE i.id = made;
  END
  $$;

-- A decision in the Bandeja (onboarding spec, views), through the staff app: a possible duplicate is attached to a
-- candidate, made a new person, or discarded; a conflict's proposed values are applied, or the person's kept.
CREATE FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid DEFAULT NULL)
  RETURNS app.intake_status
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    intake app.intake_records;
    field text;
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT i.* INTO intake FROM app.intake_records i WHERE i.id = intake_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no intake record %', intake_id USING ERRCODE = 'no_data_found';
    END IF;
    IF intake.status = 'review' AND decision IN ('attach', 'new', 'discard') THEN
      IF decision = 'attach' AND NOT (target = ANY (intake.candidates)) THEN
        RAISE EXCEPTION 'attach to one of the candidates' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      RETURN private.intake_process(intake_id, decision, target);
    END IF;
    IF intake.status = 'conflict' AND decision IN ('apply', 'keep') THEN
      IF decision = 'apply' THEN
        FOR field IN SELECT k FROM jsonb_object_keys(intake.conflicts) k WHERE k <> 'identities' LOOP
          EXECUTE format('UPDATE app.people SET %I = $1 WHERE id = $2', field)
            USING intake.conflicts -> field ->> 'proposed', intake.person_id;
        END LOOP;
      END IF;
      UPDATE app.intake_records i SET status = 'attached', decided_at = now(),
             decided_by = private.current_user_id() WHERE i.id = intake_id;
      RETURN 'attached';
    END IF;
    RAISE EXCEPTION 'intake record % is %: % is not a decision for it', intake_id, intake.status, decision
      USING ERRCODE = 'restrict_violation';
  END
  $$;

-- A batch of records from one import (internal): an import run, then each record, idempotent by its external id. A
-- record seen before with the same payload changes nothing; with a changed payload, it is attached again to its
-- person (new values fill gaps or become conflicts).
CREATE FUNCTION private.import_batch(kind text, source app.source_kind, file_sha256 text, records jsonb)
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
                                       'conflict', 0, 'updated', 0);
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
      SELECT i.* INTO existing FROM app.intake_records i
       WHERE i.source = import_batch.source AND i.external_id = item ->> 'external_id' FOR UPDATE;
      IF FOUND AND existing.payload = item -> 'payload' THEN
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

-- A CSV import (onboarding spec, web and CSV), through the staff app: rows already mapped and normalised by the API,
-- each `{"payload": …}`, its external id the hash of its payload, so the same row twice is one. The API runs a dry
-- run in a transaction it rolls back.
CREATE FUNCTION private.import_csv(file_sha256 text, rows jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) > 5000 THEN
      RAISE EXCEPTION 'rows are an array of at most 5000' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN private.import_batch('csv', 'csv', file_sha256,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'external_id', encode(pg_catalog.sha256(convert_to((r -> 'payload')::text, 'UTF8')), 'hex'),
                'payload', r -> 'payload')), '[]')
         FROM jsonb_array_elements(rows) r));
  END
  $$;

-- The Airtable sync (ADR-0005), the ingest role's only function: one run at a time (a transaction-level advisory
-- lock; a second run returns {"skipped": true}), records `{"external_id": "rec…", "payload": …}`.
CREATE FUNCTION private.ingest_airtable(records jsonb) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('backoffice:airtable-sync')) THEN
      RETURN jsonb_build_object('skipped', true);
    END IF;
    IF jsonb_typeof(records) IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(records) r
                   WHERE NOT (r ->> 'external_id') ~ '^rec[A-Za-z0-9]{14}$') THEN
      RAISE EXCEPTION 'records need their Airtable record ids' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN private.import_batch('airtable', 'airtable', NULL, records);
  END
  $$;

-- Acting on a person, from the staff app or the bot -----------------------------------------------------------------

-- "Me lo quedo" (onboarding spec, views; ADR-0004): the actor becomes the owner of someone nobody owns. Whether it did.
CREATE FUNCTION private.claim_person(person uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE app.people p SET owner_id = private.current_user_id()
     WHERE p.id = person AND p.owner_id IS NULL AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       AND p.stage NOT IN ('left', 'discarded');
    RETURN FOUND;
  END
  $$;

-- Someone left the community (onboarding spec, intake: /baja): their open period closes on `left_on` (today by
-- default), or a closed one is recorded if none was open. Whether it did.
CREATE FUNCTION private.report_leave(person uuid, left_on date DEFAULT NULL) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    day date := coalesce(left_on, (now() AT TIME ZONE 'Europe/Madrid')::date);
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.people p WHERE p.id = person AND p.merged_into IS NULL
                                                 AND p.anonymised_at IS NULL) THEN
      RETURN false;
    END IF;
    UPDATE app.community_presence c SET left_on = greatest(day, coalesce(c.joined_on, day)),
           left_reported_by = private.current_user_id()
     WHERE c.person_id = person AND c.left_on IS NULL;
    IF NOT FOUND THEN
      INSERT INTO app.community_presence (person_id, left_on, left_reported_by)
      VALUES (person, day, private.current_user_id());
    END IF;
    RETURN true;
  END
  $$;

-- What the bot may show (ADR-0004): names, stages, owners and reasons, never contact details. One function for its
-- lists, so nothing else of a person can reach it:
-- - 'mine': the actor's people needing attention;
-- - 'unassigned': new people nobody owns, oldest first;
-- - 'search': by name (typo-tolerant) or an exact phone or email (normalised by the API);
-- - 'person': one person, by id (`query`).
CREATE FUNCTION private.bot_people(scope text, query text DEFAULT NULL, phones text[] DEFAULT '{}',
                                   emails text[] DEFAULT '{}')
  RETURNS TABLE (person_id uuid, name text, stage app.stage, owner_name text, reasons text[], in_community boolean,
                 created_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT p.id, coalesce(p.preferred_name, p.full_name), p.stage, s.display_name, a.reasons,
           EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NULL),
           p.created_at
      FROM app.people p
      JOIN app.people_attention a ON a.person_id = p.id
      LEFT JOIN app.staff s ON s.user_id = p.owner_id
     WHERE CASE scope
             WHEN 'mine' THEN p.owner_id = private.current_user_id() AND cardinality(a.reasons) > 0
             WHEN 'unassigned' THEN p.stage = 'new' AND p.owner_id IS NULL
             WHEN 'person' THEN p.id::text = query
             WHEN 'search' THEN
               EXISTS (SELECT 1 FROM app.identities i
                        WHERE i.person_id = p.id
                          AND ((i.kind = 'phone' AND i.value = ANY (phones))
                               OR (i.kind = 'email' AND i.value = ANY (emails))))
               OR (coalesce(btrim(query), '') <> ''
                   AND (p.name_folded LIKE '%' || private.fold_name(query) || '%'
                        OR extensions.similarity(p.name_folded, private.fold_name(query)) >= 0.35))
             ELSE false
           END
     ORDER BY CASE WHEN scope = 'search' AND coalesce(btrim(query), '') <> ''
                   THEN extensions.similarity(p.name_folded, private.fold_name(query)) END DESC NULLS LAST,
              p.created_at
     LIMIT 20;
  END
  $$;

-- Possible matches for an arrival the bot is told about (/alta), before it is saved: the people who hold one of its
-- identities, then those with a similar name. The same fields as bot_people.
CREATE FUNCTION private.bot_candidates(arrival_name text, province text, phones text[], emails text[])
  RETURNS TABLE (person_id uuid, name text, stage app.stage, owner_name text, exact boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    WITH matched AS (
      SELECT DISTINCT private.survivor(i.person_id) AS id, true AS exact
        FROM app.identities i
       WHERE (i.kind = 'phone' AND i.value = ANY (phones)) OR (i.kind = 'email' AND i.value = ANY (emails))
      UNION
      SELECT s.person_id, false FROM private.similar_people(arrival_name, province) s
    )
    SELECT p.id, coalesce(p.preferred_name, p.full_name), p.stage, st.display_name, bool_or(m.exact)
      FROM matched m
      JOIN app.people p ON p.id = m.id
      LEFT JOIN app.staff st ON st.user_id = p.owner_id
     GROUP BY p.id, st.display_name
     ORDER BY bool_or(m.exact) DESC, p.created_at
     LIMIT 5;
  END
  $$;

-- Merging (onboarding spec, merging), through the staff app: `merged` becomes a tombstone pointing at `survivor`,
-- which takes its identities, sources, presence, intake records, and its owner, next action and profile where its own
-- are empty. Timelines stay where they are written, and are read together (the survivor's and its tombstones'). Both
-- timelines record it, the tombstone's with a snapshot of what it held, for an admin to split by hand if ever needed.
CREATE FUNCTION private.merge_people(survivor uuid, merged uuid) RETURNS void
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
       SET owner_id = coalesce(p.owner_id, gone.owner_id),
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

REVOKE ALL ON FUNCTION private.intake_identities(jsonb), private.survivor(uuid), private.similar_people(text, text),
  private.intake_attach(app.intake_records, uuid), private.intake_create(app.intake_records),
  private.intake_process(uuid, text, uuid), private.check_payload(jsonb), private.may_intake(boolean),
  private.import_batch(text, app.source_kind, text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  private.submit_intake(app.source_kind, text, jsonb, text, uuid),
  private.resolve_intake(uuid, text, uuid),
  private.import_csv(text, jsonb),
  private.claim_person(uuid),
  private.report_leave(uuid, date),
  private.bot_people(text, text, text[], text[]),
  private.bot_candidates(text, text, text[], text[]),
  private.merge_people(uuid, uuid)
  TO pauseai_backoffice_app;
GRANT USAGE ON SCHEMA private TO pauseai_backoffice_ingest;
GRANT EXECUTE ON FUNCTION private.ingest_airtable(jsonb) TO pauseai_backoffice_ingest;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
