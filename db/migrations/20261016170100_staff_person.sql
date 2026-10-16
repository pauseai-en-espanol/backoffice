-- migrate:up
-- A team account linked to its own person record (PLAN M5, step 5: "Staff linked to their person"), as the data model
-- foresaw (`staff.person_id`). An admin links it, helped by a suggestion: the person whose email is the account's.
-- The link grants nothing: no policy reads it, so it changes no one's access. One account, one person, and only
-- someone still there (never a tombstone, nor someone erased). The person outlives the account: deactivating keeps
-- both. A merge moves the link to the survivor, and refuses two records each linked to an account; erasure unlinks.
ALTER TABLE app.staff
  ADD COLUMN person_id uuid
    CONSTRAINT staff_person_id_key UNIQUE
    CONSTRAINT staff_person_id_fkey REFERENCES app.people (id);

COMMENT ON COLUMN app.staff.person_id IS 'The staff member''s own person record (PLAN M5): grants nothing';
-- Admins change it like the name and the active flag: the admin_update policy decides who, column grants what.
GRANT UPDATE (person_id) ON app.staff TO pauseai_backoffice_app;

-- Only someone still there. As the caller: an admin linking sees the person through onboarding_read, and the
-- merge (the owner) sees everyone; a person the caller can't see is refused too.
CREATE FUNCTION private.staff_person_is_live() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.person_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM app.people p
          WHERE p.id = NEW.person_id AND p.merged_into IS NULL AND p.anonymised_at IS NULL) THEN
      RAISE EXCEPTION 'a team account links only to someone still there' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;
REVOKE ALL ON FUNCTION private.staff_person_is_live() FROM PUBLIC;
CREATE TRIGGER person_is_live BEFORE INSERT OR UPDATE OF person_id ON app.staff
  FOR EACH ROW EXECUTE FUNCTION private.staff_person_is_live();

-- The suggestion: for each account without a person, the person (still there, not linked to another account) with
-- an email identity equal to the account's sign-in email. Admins only. SECURITY DEFINER: the app role doesn't reach
-- `auth`, and the function returns ids only, never the email.
CREATE FUNCTION private.staff_person_suggestions() RETURNS TABLE (user_id uuid, person_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT DISTINCT s.user_id, p.id
      FROM app.staff s
      JOIN auth.users u ON u.id = s.user_id
      JOIN app.identities i ON i.kind = 'email' AND lower(i.value) = lower(btrim(u.email))
      JOIN app.people p ON p.id = i.person_id AND p.merged_into IS NULL AND p.anonymised_at IS NULL
     WHERE s.person_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM app.staff o WHERE o.person_id = p.id)
     ORDER BY s.user_id, p.id;
  END
  $$;
REVOKE ALL ON FUNCTION private.staff_person_suggestions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.staff_person_suggestions() TO pauseai_backoffice_app;

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
       SET full_name = 'Persona anonimizada', preferred_name = NULL, province = NULL, town = NULL, languages = '{}',
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
