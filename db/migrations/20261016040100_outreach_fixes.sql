-- migrate:up

-- Outreach's loose ends (security review of M3, PLAN R34 and R35):
-- - erasing a contact also takes their role, website, reason, sources, tags, hold reason and repo reference, which
--   identify them as surely as a name; and those columns stay out of the audit log from now on;
-- - once someone has written to a target, that history stays: it can't go back to pending, ready or skip, nor be
--   taken out of the campaign, so Siguiente never offers it again.

COMMENT ON COLUMN app.contacts.role IS 'personal data';
COMMENT ON COLUMN app.contacts.website IS 'personal data';
COMMENT ON COLUMN app.contacts.reason IS 'personal data';
COMMENT ON COLUMN app.contacts.sources IS 'personal data';
COMMENT ON COLUMN app.contacts.tags IS 'personal data';
COMMENT ON COLUMN app.contacts.hold_reason IS 'personal data';
COMMENT ON COLUMN app.contacts.external_ref IS 'personal data';

CREATE OR REPLACE FUNCTION private.target_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.status IN ('ready', 'sent') AND (TG_OP = 'UPDATE' OR NEW.status = 'ready')
       AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
       AND EXISTS (SELECT 1 FROM app.contacts c
                    WHERE c.id = NEW.contact_id AND (c.needs_review OR c.hold OR c.anonymised_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'contact not ready' USING ERRCODE = 'check_violation', HINT = 'needsReview';
    END IF;
    -- Someone wrote to them: that stays.
    IF TG_OP = 'UPDATE' AND OLD.sent_at IS NOT NULL AND NEW.status IN ('pending', 'ready', 'skip') THEN
      RAISE EXCEPTION 'target % was written to already', OLD.id USING ERRCODE = 'check_violation', HINT = 'sent';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      CASE NEW.status
        WHEN 'sent' THEN NEW.sent_at := coalesce(NEW.sent_at, now());
        WHEN 'replied' THEN NEW.replied_at := coalesce(NEW.replied_at, now());
        WHEN 'meeting' THEN NEW.meeting_at := coalesce(NEW.meeting_at, now());
        ELSE NULL;
      END CASE;
    END IF;
    RETURN NEW;
  END
  $$;

DROP POLICY outreach_delete ON app.campaign_targets;
CREATE POLICY outreach_delete ON app.campaign_targets FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')) AND status IN ('pending', 'ready', 'skip')
         AND sent_at IS NULL);

-- Erasure for a contact (migration outreach's version, plus the columns above). The contact is left to review, since
-- nothing is left to say why they mattered.
CREATE OR REPLACE FUNCTION private.anonymise_contact(contact uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    subject app.contacts;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT c.* INTO subject FROM app.contacts c WHERE c.id = contact FOR UPDATE;
    IF NOT FOUND OR subject.anonymised_at IS NOT NULL THEN
      RETURN false;
    END IF;
    UPDATE app.campaign_targets t SET notes = NULL, next_action = NULL, next_action_due = NULL
     WHERE t.contact_id = contact;
    UPDATE app.contacts c
       SET person_name = NULL, greeting_name = NULL, treatment = 'neutral', email = NULL, emails_extra = '{}',
           phone = NULL, notes = NULL, role = NULL, website = NULL, reason = NULL, sources = '{}', tags = '{}',
           external_ref = NULL, needs_review = true, hold = true, hold_reason = NULL, owner_id = NULL,
           anonymised_at = now()
     WHERE c.id = contact;
    -- Last, so the events the update above just wrote are redacted too.
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e SET body = NULL WHERE e.contact_id = contact;
    PERFORM set_config('app.redact', '', true);
    RETURN true;
  END
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
