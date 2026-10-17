-- migrate:up

-- "Compartir también mis notas" (PLAN R52; Dani, 2026-10-17: "i want this option"): sharing one's private contact or
-- organisation with the team may take its history along, when its person ticks it: the notes and events it gathered
-- while it was private become the team's too. The API says so for that one transaction (app.share_history), and it
-- happens only as the record goes from private to the team, so a private note written on a team record later, on
-- purpose, stays private. Unticked, as before: what was written while private stays private.

-- As the record is shared: its timeline or notes, private to its person until now, become the team's. The owner's,
-- as the timelines are append-only (forbid_mutation lets only their owner change them, under app.redact).
CREATE FUNCTION private.share_history() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF current_setting('app.share_history', true) IS DISTINCT FROM 'on' THEN
      RETURN NULL;
    END IF;
    PERFORM set_config('app.redact', 'on', true);
    IF TG_TABLE_NAME = 'contacts' THEN
      UPDATE app.contact_events e SET private_to = NULL
       WHERE e.contact_id = NEW.id AND e.private_to = OLD.private_to;
    ELSE
      UPDATE app.organisation_notes n SET private_to = NULL
       WHERE n.organisation_id = NEW.id AND n.private_to = OLD.private_to;
    END IF;
    PERFORM set_config('app.redact', '', true);
    RETURN NULL;
  END
  $$;
REVOKE ALL ON FUNCTION private.share_history() FROM PUBLIC;
CREATE TRIGGER share_history AFTER UPDATE OF private_to ON app.contacts
  FOR EACH ROW WHEN (OLD.private_to IS NOT NULL AND NEW.private_to IS NULL)
  EXECUTE FUNCTION private.share_history();
CREATE TRIGGER share_history AFTER UPDATE OF private_to ON app.organisations
  FOR EACH ROW WHEN (OLD.private_to IS NOT NULL AND NEW.private_to IS NULL)
  EXECUTE FUNCTION private.share_history();

-- Merging one's private contact into the team's (migration private_records' version): what it moves over is the
-- team's too when its person ticks it.
CREATE OR REPLACE FUNCTION private.merge_private_contact(private_contact uuid, team_contact uuid) RETURNS boolean
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
    UPDATE app.contact_events e
       SET contact_id = team_contact,
           private_to = CASE WHEN current_setting('app.share_history', true) = 'on' THEN NULL ELSE e.private_to END
     WHERE e.contact_id = private_contact;
    PERFORM set_config('app.redact', '', true);
    DELETE FROM app.contacts c WHERE c.id = private_contact;
    INSERT INTO app.contact_events (contact_id, kind, data)
    VALUES (team_contact, 'shared', jsonb_build_object('merged', true));
    RETURN true;
  END
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
