-- migrate:up

-- The census (onboarding spec §7, M2): the form every member fills in, through a generic link or a personal one; the
-- lists of skills and areas to help in that admins edit; consents with their wording's version; personal links; and a
-- person's erasure (personal data spec, rights). The public forms app reaches the database only through
-- private.census_form and private.submit_census, as pauseai_backoffice_public, which can do nothing else
-- (ADR-0002 §7).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pauseai_backoffice_public') THEN
    RAISE EXCEPTION 'pauseai_backoffice_public missing: add it to the postgresql values first (gitops)';
  END IF;
END
$$;

-- Skills and areas to help in: edited by admins in settings, never in code. They start as placeholders, to be
-- replaced before the census goes out. "Otra" is free text on the form, not an option.
CREATE TABLE app.census_options (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  kind        text NOT NULL CHECK (kind IN ('skill', 'interest')),
  label       text NOT NULL CHECK (btrim(label) <> '' AND length(label) <= 80),
  active      boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, label)
);
INSERT INTO app.census_options (kind, label, position) VALUES
  ('skill', 'Diseño', 1), ('skill', 'Redes sociales', 2), ('skill', 'Programación', 3), ('skill', 'Escritura', 4),
  ('interest', 'Comunicación', 1), ('interest', 'Eventos', 2), ('interest', 'Política', 3),
  ('interest', 'Divulgación', 4);

-- A person's chosen options.
CREATE TABLE app.person_options (
  person_id   uuid NOT NULL REFERENCES app.people (id),
  option_id   uuid NOT NULL REFERENCES app.census_options (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, option_id)
);

ALTER TABLE app.people
  ADD COLUMN skills_other text CHECK (length(skills_other) <= 300),
  ADD COLUMN interests_other text CHECK (length(interests_other) <= 300);
COMMENT ON COLUMN app.people.skills_other IS 'personal data';
COMMENT ON COLUMN app.people.interests_other IS 'personal data';

-- Consents, as a history: each answer with its date, where it came from, and the version of the wording the person
-- saw (personal data spec, notice and rights). The current one is the latest of each kind. Append-only.
CREATE TABLE app.consents (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id        uuid NOT NULL REFERENCES app.people (id),
  kind             text NOT NULL CHECK (kind IN ('email', 'whatsapp', 'privacy')),
  granted          boolean NOT NULL,
  wording_version  text NOT NULL CHECK (wording_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  source           app.source_kind NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consents_person_id_idx ON app.consents (person_id, kind, created_at DESC);

-- Personal links: one person's way to update their own profile for 30 days. Only the token's SHA-256 is stored; the
-- token travels in the link's fragment (onboarding spec §7.2).
CREATE TABLE app.census_links (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  person_id   uuid NOT NULL REFERENCES app.people (id),
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz NOT NULL,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- When a person confirmed they sent it (through WhatsApp, from their own number), and when it was first used.
  sent_at     timestamptz,
  sent_by     uuid,
  used_at     timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days')
);
CREATE INDEX census_links_person_id_idx ON app.census_links (person_id);

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.census_options
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.census_options
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.person_options
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.person_options
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT ON app.consents
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');
CREATE TRIGGER forbid_mutation BEFORE UPDATE OR DELETE ON app.consents
  FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.consents
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.consents
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.census_links
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.census_links
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Only sent_at and sent_by change, and only once: the rest of a link is fixed; used_at is the form's to set.
CREATE FUNCTION private.census_link_sent() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF (to_jsonb(NEW) - ARRAY['sent_at', 'sent_by', 'used_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['sent_at', 'sent_by', 'used_at']) THEN
      RAISE EXCEPTION 'a census link changes only when it is sent or used' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
      IF OLD.sent_at IS NOT NULL THEN
        RAISE EXCEPTION 'census link % was sent already', OLD.id USING ERRCODE = 'restrict_violation';
      END IF;
      NEW.sent_at := now();
      NEW.sent_by := private.current_user_id();
    ELSE
      NEW.sent_by := OLD.sent_by;
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER sent BEFORE UPDATE ON app.census_links
  FOR EACH ROW EXECUTE FUNCTION private.census_link_sent();

ALTER TABLE app.census_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.person_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.census_links ENABLE ROW LEVEL SECURITY;

-- Every staff member reads the lists; admins edit them (an option in use is deactivated, never deleted).
GRANT SELECT, INSERT (kind, label, active, position), UPDATE (label, active, position)
  ON app.census_options TO pauseai_backoffice_app;
CREATE POLICY staff_read ON app.census_options FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding', 'outreach')));
CREATE POLICY admin_insert ON app.census_options FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin')));
CREATE POLICY admin_update ON app.census_options FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')))
  WITH CHECK ((SELECT private.staff_can('admin')));

-- Onboarding staff and admins read a person's options and consents, and set options by hand; consents come only from
-- the person, through the form.
GRANT SELECT, INSERT (person_id, option_id), DELETE ON app.person_options TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.person_options FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_insert ON app.person_options FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_delete ON app.person_options FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
GRANT SELECT ON app.consents TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.consents FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));

-- Onboarding staff make personal links (the API keeps the token, shows it once) and mark them sent.
GRANT SELECT (id, person_id, expires_at, created_by, created_at, sent_at, sent_by, used_at),
      INSERT (person_id, token_hash, expires_at), UPDATE (sent_at)
  ON app.census_links TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.census_links FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_insert ON app.census_links FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_send ON app.census_links FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')) AND sent_at IS NULL)
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));

-- Staff edit the free-text "other" answers like any profile field.
GRANT UPDATE (skills_other, interests_other) ON app.people TO pauseai_backoffice_app;

-- The form's side ---------------------------------------------------------------------------------------------------

-- The form's lists, and, for a personal link that is still valid, how to greet its person (their preferred or first
-- name, nothing else). The public role's only read.
CREATE FUNCTION private.census_form(token_hash text DEFAULT NULL)
  RETURNS TABLE (options jsonb, greeting text, link text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'label', o.label)
                                      ORDER BY o.kind, o.position, o.label), '[]')
              FROM app.census_options o WHERE o.active),
           (SELECT coalesce(p.preferred_name, split_part(p.full_name, ' ', 1))
              FROM app.census_links l JOIN app.people p ON p.id = l.person_id
             WHERE l.token_hash = census_form.token_hash AND l.expires_at > now()
               AND p.merged_into IS NULL AND p.anonymised_at IS NULL),
           CASE WHEN census_form.token_hash IS NULL THEN 'generic'
                WHEN EXISTS (SELECT 1 FROM app.census_links l
                              WHERE l.token_hash = census_form.token_hash AND l.expires_at > now()) THEN 'personal'
                ELSE 'invalid' END
  $$;

-- A census answer's fields, as the form sends them (the API checked their shapes and normalised the email and
-- phone): anything else is refused.
CREATE FUNCTION private.check_census(answer jsonb) RETURNS void
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
     WHERE k NOT IN ('name', 'preferred_name', 'email', 'phone', 'province', 'town', 'languages', 'options',
                     'skills_other', 'interests_other', 'availability', 'how_heard', 'pronouns', 'consent_email',
                     'consent_whatsapp', 'consent_privacy', 'age_ok', 'wording_version');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'a census answer takes no %', extra USING ERRCODE = 'invalid_parameter_value';
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

-- What a person's own answer sets (internal): profile fields, options (only active ones), consents, and the time
-- the profile was completed; then a timeline event.
CREATE FUNCTION private.census_apply(person uuid, answer jsonb, link text) RETURNS void
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
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
    INSERT INTO app.consents (person_id, kind, granted, wording_version, source)
    SELECT person, k.kind, coalesce((answer ->> ('consent_' || k.kind))::boolean, false), answer ->> 'wording_version',
           'census'
      FROM unnest(ARRAY['email', 'whatsapp', 'privacy']) AS k(kind);
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (person, 'form_submitted', jsonb_build_object('link', link));
  END
  $$;

-- A census answer (onboarding spec §7.2), the public role's one write:
-- - through a personal link that is still valid, the person updates their own profile directly, and adds an email
--   or phone nobody else holds;
-- - through the generic link, the answer is matched by its email or phone, and can't overwrite anything: it makes a
--   new person in `to_triage`, or waits in the Bandeja for a person to apply it to the one it matched, since anyone
--   can type anyone's number. Returns 'updated', 'created', 'review' or 'invalid' (a personal link that isn't valid).
CREATE FUNCTION private.submit_census(token_hash text, answer jsonb) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    link app.census_links;
    person uuid;
    intake uuid;
    outcome app.intake_status;
    identity record;
    matched uuid[];
  BEGIN
    PERFORM private.check_census(answer);
    IF submit_census.token_hash IS NOT NULL THEN
      SELECT l.* INTO link FROM app.census_links l
        JOIN app.people p ON p.id = l.person_id
       WHERE l.token_hash = submit_census.token_hash AND l.expires_at > now()
         AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       FOR UPDATE OF l;
      IF NOT FOUND THEN
        RETURN 'invalid';
      END IF;
      person := link.person_id;
      PERFORM private.census_apply(person, answer, 'personal');
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
      UPDATE app.census_links l SET used_at = coalesce(l.used_at, now()) WHERE l.id = link.id;
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
    -- (a conflict to apply, or, matching two people, a duplicate to decide first); one that matches nobody makes a new
    -- person.
    SELECT coalesce(array_agg(DISTINCT private.survivor(i.person_id)), '{}') INTO matched
      FROM app.identities i
     WHERE (i.kind = 'email' AND i.value = answer ->> 'email') OR (i.kind = 'phone' AND i.value = answer ->> 'phone');
    IF cardinality(matched) > 0 THEN
      UPDATE app.intake_records r
         SET status = CASE WHEN cardinality(matched) = 1 THEN 'conflict'::app.intake_status ELSE 'review' END,
             person_id = CASE WHEN cardinality(matched) = 1 THEN matched[1] END,
             candidates = CASE WHEN cardinality(matched) > 1 THEN matched ELSE '{}' END,
             conflicts = jsonb_build_object('census', answer - 'age_ok')
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

-- The Bandeja's decisions, now with census answers (migration intake's version, plus these): a census answer that
-- matched someone through the generic link is applied, after a person checked it is theirs, as their own answer
-- would be ('apply'), or dropped ('keep'); one that matched two people is first attached to one of them, and then
-- waits to be applied to them.
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

-- Rights (personal data spec): erasure anonymises. The person stays, for the counts by stage, but their name becomes
-- "Persona anonimizada", every other profile field, identity, option, link and presence's chat goes, the bodies and
-- data of their timeline are redacted (the only change that timeline ever takes), and their intake records forget their
-- payloads. Consents stay, as proof of what was agreed, which no longer names anyone. Admins only, through the staff
-- app; the audit log records it, without personal data (PLAN R2).
CREATE FUNCTION private.anonymise_person(person uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    subject app.people;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.* INTO subject FROM app.people p WHERE p.id = person FOR UPDATE;
    IF NOT FOUND OR subject.anonymised_at IS NOT NULL THEN
      RETURN false;
    END IF;
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.person_events e SET body = NULL, data = '{}'
     WHERE e.person_id = person OR e.person_id IN (SELECT t.id FROM app.people t WHERE t.merged_into = person);
    PERFORM set_config('app.redact', '', true);
    DELETE FROM app.identities i WHERE i.person_id = person;
    DELETE FROM app.person_options o WHERE o.person_id = person;
    DELETE FROM app.census_links l WHERE l.person_id = person;
    UPDATE app.community_presence c SET chat = NULL WHERE c.person_id = person;
    UPDATE app.intake_records r SET payload = '{}', conflicts = '{}', candidates = '{}'
     WHERE r.person_id = person OR person = ANY (r.candidates);
    UPDATE app.people p
       SET full_name = 'Persona anonimizada', preferred_name = NULL, province = NULL, town = NULL, languages = '{}',
           pronouns = NULL, availability = NULL, how_heard = NULL, next_action = NULL, next_action_due = NULL,
           skills_other = NULL, interests_other = NULL, owner_id = NULL, anonymised_at = now()
     WHERE p.id = person;
    RETURN true;
  END
  $$;

REVOKE ALL ON FUNCTION private.check_census(jsonb), private.census_apply(uuid, jsonb, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO pauseai_backoffice_public;
GRANT EXECUTE ON FUNCTION private.census_form(text), private.submit_census(text, jsonb)
  TO pauseai_backoffice_public;
GRANT EXECUTE ON FUNCTION private.anonymise_person(uuid) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
