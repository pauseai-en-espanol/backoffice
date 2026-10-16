-- migrate:up

-- "Solo yo" or "Equipo" (PLAN M5, step 6; Dani, 2026-10-17: "go with step 6"): every outreach contact,
-- organisation and note is the team's, as all were until now, or private to one staff member (`private_to`), who alone
-- sees it. Other outreach staff and admins don't, in the app or the API: the policies say so (ADR-0002). Rights
-- requests still reach private records, through admins' own functions, and an admin chooses who inherits a departed
-- member's, seeing how many, never what.
-- - A record only goes from private to the team (sharing), never back: what the team has seen stays the team's.
-- - What sits on a private contact or organisation (its timeline, its notes) is as private as it; a private note may
--   sit on a team record. A team contact belongs to a team organisation, or to none.
-- - Campaigns write to team contacts only.
-- - Sharing a contact says so on its timeline ('shared'); what was written while it was private stays private.

ALTER TYPE app.contact_event_kind ADD VALUE 'shared';

ALTER TABLE app.organisations ADD COLUMN private_to uuid REFERENCES app.staff (user_id);
ALTER TABLE app.contacts ADD COLUMN private_to uuid REFERENCES app.staff (user_id);
ALTER TABLE app.contact_events ADD COLUMN private_to uuid REFERENCES app.staff (user_id);
ALTER TABLE app.organisation_notes ADD COLUMN private_to uuid REFERENCES app.staff (user_id);
CREATE INDEX organisations_private_to_idx ON app.organisations (private_to) WHERE private_to IS NOT NULL;
CREATE INDEX contacts_private_to_idx ON app.contacts (private_to) WHERE private_to IS NOT NULL;
CREATE INDEX contact_events_private_to_idx ON app.contact_events (private_to) WHERE private_to IS NOT NULL;
CREATE INDEX organisation_notes_private_to_idx ON app.organisation_notes (private_to) WHERE private_to IS NOT NULL;

GRANT INSERT (private_to), UPDATE (private_to) ON app.organisations TO pauseai_backoffice_app;
GRANT INSERT (private_to), UPDATE (private_to) ON app.contacts TO pauseai_backoffice_app;
GRANT INSERT (private_to) ON app.contact_events TO pauseai_backoffice_app;
GRANT INSERT (private_to) ON app.organisation_notes TO pauseai_backoffice_app;

-- A team record stays the team's; a contact's organisation is one everyone who sees the contact may see. After the
-- row, so the policies have refused whoever may not write it first; run as the caller, whose policies hide others'
-- private organisations: one they can't see is refused like a private one.
CREATE FUNCTION private.private_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    holder uuid;
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.private_to IS NULL AND NEW.private_to IS NOT NULL THEN
      RAISE EXCEPTION 'a record the team has stays the team''s'
        USING ERRCODE = 'check_violation', HINT = 'shared';
    END IF;
    IF TG_TABLE_NAME = 'contacts' THEN
      IF NEW.organisation_id IS NOT NULL
         AND (TG_OP = 'INSERT' OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
              OR NEW.private_to IS DISTINCT FROM OLD.private_to) THEN
        SELECT o.private_to INTO holder FROM app.organisations o WHERE o.id = NEW.organisation_id;
        IF NOT FOUND OR (holder IS NOT NULL AND holder IS DISTINCT FROM NEW.private_to) THEN
          RAISE EXCEPTION 'the contact''s organisation is private'
            USING ERRCODE = 'check_violation', HINT = 'organisationPrivate';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
  END
  $$;
CREATE TRIGGER private_rules AFTER INSERT OR UPDATE OF private_to ON app.organisations
  FOR EACH ROW EXECUTE FUNCTION private.private_rules();
CREATE TRIGGER private_rules AFTER INSERT OR UPDATE OF private_to, organisation_id ON app.contacts
  FOR EACH ROW EXECUTE FUNCTION private.private_rules();

-- A campaign writes to team contacts only. After the row, as above: someone else's private contact, which the caller
-- can't see, is refused the same way.
CREATE FUNCTION private.target_shared() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.contacts c WHERE c.id = NEW.contact_id AND c.private_to IS NULL) THEN
      RAISE EXCEPTION 'a campaign writes to team contacts only' USING ERRCODE = 'check_violation', HINT = 'private';
    END IF;
    RETURN NULL;
  END
  $$;
CREATE TRIGGER shared AFTER INSERT ON app.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION private.target_shared();

-- What is written on a private contact or organisation is as private as it.
CREATE FUNCTION private.inherit_privacy() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    holder uuid;
  BEGIN
    IF TG_TABLE_NAME = 'contact_events' THEN
      SELECT c.private_to INTO holder FROM app.contacts c WHERE c.id = NEW.contact_id;
    ELSE
      SELECT o.private_to INTO holder FROM app.organisations o WHERE o.id = NEW.organisation_id;
    END IF;
    IF holder IS NOT NULL THEN
      NEW.private_to := holder;
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER privacy BEFORE INSERT ON app.contact_events
  FOR EACH ROW EXECUTE FUNCTION private.inherit_privacy();
CREATE TRIGGER privacy BEFORE INSERT ON app.organisation_notes
  FOR EACH ROW EXECUTE FUNCTION private.inherit_privacy();

-- A contact's timeline (migration outreach's version), plus its sharing with the team.
CREATE OR REPLACE FUNCTION private.contact_timeline() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, CASE WHEN NEW.external_ref IS NULL THEN 'created'::app.contact_event_kind ELSE 'imported' END,
              jsonb_build_object('stage', NEW.stage));
      RETURN NULL;
    END IF;
    IF OLD.private_to IS NOT NULL AND NEW.private_to IS NULL THEN
      INSERT INTO app.contact_events (contact_id, kind) VALUES (NEW.id, 'shared');
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, 'stage_changed', jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, 'owner_changed', jsonb_build_object('from', OLD.owner_id, 'to', NEW.owner_id));
    END IF;
    IF OLD.needs_review AND NOT NEW.needs_review THEN
      INSERT INTO app.contact_events (contact_id, kind) VALUES (NEW.id, 'reviewed');
    END IF;
    RETURN NULL;
  END
  $$;

-- Policies: outreach staff and admins, as before, and of the private records only their own person's. ------------

DROP POLICY outreach_read ON app.organisations;
CREATE POLICY outreach_read ON app.organisations FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach'))
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));
DROP POLICY outreach_insert ON app.organisations;
CREATE POLICY outreach_insert ON app.organisations FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));
DROP POLICY outreach_update ON app.organisations;
CREATE POLICY outreach_update ON app.organisations FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach'))
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));

DROP POLICY outreach_read ON app.contacts;
CREATE POLICY outreach_read ON app.contacts FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach'))
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));
DROP POLICY outreach_insert ON app.contacts;
CREATE POLICY outreach_insert ON app.contacts FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));
-- An anonymised contact stays as it was left.
DROP POLICY outreach_update ON app.contacts;
CREATE POLICY outreach_update ON app.contacts FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')) AND anonymised_at IS NULL
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));

-- An event or a note shows where its contact or organisation does, and a private one to its person alone.
DROP POLICY outreach_read ON app.contact_events;
CREATE POLICY outreach_read ON app.contact_events FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach'))
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id()))
         AND EXISTS (SELECT 1 FROM app.contacts c WHERE c.id = contact_id));
DROP POLICY outreach_insert ON app.contact_events;
CREATE POLICY outreach_insert ON app.contact_events FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND (kind = 'note' OR pg_catalog.pg_trigger_depth() > 0)
              AND (private_to IS NULL OR private_to = (SELECT private.current_user_id()))
              AND EXISTS (SELECT 1 FROM app.contacts c WHERE c.id = contact_id));

DROP POLICY outreach_read ON app.organisation_notes;
CREATE POLICY outreach_read ON app.organisation_notes FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach'))
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id()))
         AND EXISTS (SELECT 1 FROM app.organisations o WHERE o.id = organisation_id));
DROP POLICY outreach_insert ON app.organisation_notes;
CREATE POLICY outreach_insert ON app.organisation_notes FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')) AND body IS NOT NULL
              AND (private_to IS NULL OR private_to = (SELECT private.current_user_id()))
              AND EXISTS (SELECT 1 FROM app.organisations o WHERE o.id = organisation_id));

-- Rights requests (personal data spec, rights): admins find a person's contacts, private ones too, by an exact email,
-- phone or name, and export one; erasure (private.anonymise_contact) already reaches every contact by its id. ------

ALTER TABLE app.exports DROP CONSTRAINT exports_kind_check;
ALTER TABLE app.exports ADD CONSTRAINT exports_kind_check
  CHECK (kind IN ('people_csv', 'person_json', 'contact_json'));

CREATE FUNCTION private.rights_contacts(query text)
  RETURNS TABLE (id uuid, org_display text, person_name text, is_private boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    wanted text := lower(btrim(query));
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
      SELECT c.id, c.org_display, c.person_name, c.private_to IS NOT NULL
        FROM app.contacts c
       WHERE c.anonymised_at IS NULL AND wanted <> ''
         AND (c.email = wanted OR wanted = ANY (c.emails_extra) OR c.phone = btrim(query)
              OR lower(c.person_name) = wanted)
       ORDER BY c.org_display, c.person_name, c.id
       LIMIT 50;
  END
  $$;
REVOKE ALL ON FUNCTION private.rights_contacts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.rights_contacts(text) TO pauseai_backoffice_app;

-- Everything kept about a contact, private notes too, and the export recorded; nothing about who on the team did what.
CREATE FUNCTION private.export_contact(contact uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    result jsonb;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT jsonb_build_object(
             'contact', to_jsonb(c) - ARRAY['private_to', 'owner_id', 'created_by', 'updated_by'],
             'organisation', (SELECT jsonb_build_object('name', o.name, 'kind', o.kind)
                                FROM app.organisations o WHERE o.id = c.organisation_id),
             'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                             'campaign', ca.name, 'status', t.status, 'sentAt', t.sent_at,
                                             'repliedAt', t.replied_at, 'meetingAt', t.meeting_at,
                                             'nextAction', t.next_action, 'notes', t.notes)
                                           ORDER BY t.created_at)
                                      FROM app.campaign_targets t JOIN app.campaigns ca ON ca.id = t.campaign_id
                                     WHERE t.contact_id = c.id), '[]'::jsonb),
             'timeline', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                            'kind', e.kind, 'at', e.created_at, 'happenedOn', e.happened_on,
                                            'body', e.body, 'data', e.data)
                                          ORDER BY e.created_at, e.id)
                                     FROM app.contact_events e WHERE e.contact_id = c.id), '[]'::jsonb))
      INTO result
      FROM app.contacts c WHERE c.id = contact;
    IF result IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO app.exports (kind, filter, row_count)
    VALUES ('contact_json', jsonb_build_object('contact', contact), 1);
    RETURN result;
  END
  $$;
REVOKE ALL ON FUNCTION private.export_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.export_contact(uuid) TO pauseai_backoffice_app;

-- A departed member's private records: how many, for admins, never what; and who inherits them. -------------------

CREATE FUNCTION private.private_records()
  RETURNS TABLE (user_id uuid, contacts integer, organisations integer, notes integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
      SELECT r.user_id, r.contacts, r.organisations, r.notes
        FROM (SELECT s.user_id,
                     (SELECT count(*)::integer FROM app.contacts c WHERE c.private_to = s.user_id) AS contacts,
                     (SELECT count(*)::integer FROM app.organisations o WHERE o.private_to = s.user_id)
                       AS organisations,
                     (SELECT count(*)::integer FROM app.contact_events e
                       WHERE e.private_to = s.user_id AND e.kind = 'note')
                     + (SELECT count(*)::integer FROM app.organisation_notes n WHERE n.private_to = s.user_id)
                       AS notes
                FROM app.staff s WHERE NOT s.active) r
       WHERE r.contacts + r.organisations + r.notes > 0
       ORDER BY r.user_id;
  END
  $$;
REVOKE ALL ON FUNCTION private.private_records() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.private_records() TO pauseai_backoffice_app;

-- Hands a deactivated member's private records to an active member who works in outreach: how many moved.
CREATE FUNCTION private.hand_over_private(departed uuid, heir uuid) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    moved integer := 0;
    n integer;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.staff s WHERE s.user_id = departed AND NOT s.active) THEN
      RAISE EXCEPTION 'only a deactivated account''s records are handed over'
        USING ERRCODE = 'check_violation', HINT = 'stillActive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = heir AND s.active AND r.role IN ('admin', 'outreach')) THEN
      RAISE EXCEPTION 'the heir works in outreach, or administers'
        USING ERRCODE = 'check_violation', HINT = 'heir';
    END IF;
    -- Organisations first, so each contact's organisation is its new person's when the contact moves.
    UPDATE app.organisations o SET private_to = heir WHERE o.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    UPDATE app.contacts c SET private_to = heir WHERE c.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e SET private_to = heir WHERE e.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    UPDATE app.organisation_notes n2 SET private_to = heir WHERE n2.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    PERFORM set_config('app.redact', '', true);
    RETURN moved;
  END
  $$;
REVOKE ALL ON FUNCTION private.hand_over_private(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.hand_over_private(uuid, uuid) TO pauseai_backoffice_app;

-- Sharing one's private contact into a team contact that is the same person (outreach staff, its own person only):
-- the team contact keeps its details and takes the ones it lacks, the private timeline moves over still private to
-- its person, the private contact goes, and the team contact's timeline says it was shared.
CREATE FUNCTION private.merge_private_contact(private_contact uuid, team_contact uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    mine app.contacts;
  BEGIN
    IF NOT private.staff_can('admin', 'outreach') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT c.* INTO mine FROM app.contacts c
     WHERE c.id = private_contact AND c.private_to = private.current_user_id() AND c.anonymised_at IS NULL
       FOR UPDATE;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    PERFORM 1 FROM app.contacts c
     WHERE c.id = team_contact AND c.private_to IS NULL AND c.anonymised_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    UPDATE app.contacts c
       SET person_name = coalesce(c.person_name, mine.person_name),
           greeting_name = coalesce(c.greeting_name, mine.greeting_name),
           role = coalesce(c.role, mine.role),
           email = coalesce(c.email, mine.email),
           emails_extra = (SELECT coalesce(array_agg(x.address ORDER BY x.address), '{}')
                             FROM (SELECT DISTINCT a.address
                                     FROM unnest(c.emails_extra || mine.emails_extra || ARRAY[mine.email]) AS a(address)
                                    WHERE a.address IS NOT NULL
                                      AND a.address IS DISTINCT FROM coalesce(c.email, mine.email)
                                    LIMIT 10) x),
           phone = coalesce(c.phone, mine.phone),
           website = coalesce(c.website, mine.website),
           territory = coalesce(c.territory, mine.territory),
           scope = coalesce(c.scope, mine.scope),
           sector = coalesce(c.sector, mine.sector)
     WHERE c.id = team_contact;
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e SET contact_id = team_contact WHERE e.contact_id = private_contact;
    PERFORM set_config('app.redact', '', true);
    DELETE FROM app.contacts c WHERE c.id = private_contact;
    INSERT INTO app.contact_events (contact_id, kind, data)
    VALUES (team_contact, 'shared', jsonb_build_object('merged', true));
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION private.merge_private_contact(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.merge_private_contact(uuid, uuid) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
