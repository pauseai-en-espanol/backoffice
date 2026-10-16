-- migrate:up

-- The Telegram bot is the onboarding team's (Dani, 2026-10-16: "only people from onboarding should be able to
-- interact with the bot", and an admin without the onboarding role neither: ADR-0004). Until now it was open to
-- admins and onboarding staff alike. Now:
-- - only an active staff member with the onboarding role gets a link code or a link, in the database;
-- - losing that role, or being deactivated, unlinks the account and drops its unused codes;
-- - the bot's functions answer only the onboarding role (may_intake, submit_intake's Telegram branch).

-- An account's codes and links need it to be active staff with the onboarding role. The rows are locked, so a role
-- taken away at the same moment waits for the link, then unlinks it. SECURITY DEFINER: Better Auth's role, which
-- writes the codes and links, doesn't see the staff tables.
CREATE FUNCTION private.telegram_needs_onboarding() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    PERFORM 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
     WHERE s.user_id = NEW.user_id AND s.active AND r.role = 'onboarding'
       FOR SHARE OF s, r;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the Telegram bot is for the onboarding team' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
REVOKE ALL ON FUNCTION private.telegram_needs_onboarding() FROM PUBLIC;
CREATE TRIGGER needs_onboarding BEFORE INSERT ON auth.telegram_link_codes
  FOR EACH ROW EXECUTE FUNCTION private.telegram_needs_onboarding();
CREATE TRIGGER needs_onboarding BEFORE INSERT ON auth.telegram_links
  FOR EACH ROW EXECUTE FUNCTION private.telegram_needs_onboarding();

-- Losing the onboarding role or being deactivated unlinks Telegram, whoever does it: the staff app (an admin, as the
-- app role) or the owner. SECURITY DEFINER: the app role doesn't reach `auth`. The staff app also unlinks on
-- deactivation (endSessions); this holds without it.
CREATE FUNCTION private.unlink_telegram() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = OLD.user_id AND s.active AND r.role = 'onboarding') THEN
      DELETE FROM auth.telegram_links l WHERE l.user_id = OLD.user_id;
      DELETE FROM auth.telegram_link_codes c WHERE c.user_id = OLD.user_id;
    END IF;
    RETURN NULL;
  END
  $$;
REVOKE ALL ON FUNCTION private.unlink_telegram() FROM PUBLIC;
CREATE TRIGGER unlinks_telegram AFTER DELETE OR UPDATE ON app.staff_roles
  FOR EACH ROW WHEN (OLD.role = 'onboarding') EXECUTE FUNCTION private.unlink_telegram();
CREATE TRIGGER unlinks_telegram AFTER UPDATE OF active ON app.staff
  FOR EACH ROW WHEN (OLD.active AND NOT NEW.active) EXECUTE FUNCTION private.unlink_telegram();

-- The bot's functions (bot_people, bot_candidates, bot_summary, claim_person, report_leave) ask may_intake(true):
-- through the bot, the onboarding role alone; through the staff app, unchanged.
CREATE OR REPLACE FUNCTION private.may_intake(bot boolean) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
    SELECT private.staff_can('admin', 'onboarding') OR (bot AND private.bot_can('onboarding'))
  $$;

-- A report through the bot needs the onboarding role; through the staff app, unchanged.
CREATE OR REPLACE FUNCTION private.submit_intake(source app.source_kind, external_id text, payload jsonb,
                                                 decision text DEFAULT NULL, target uuid DEFAULT NULL)
  RETURNS TABLE (intake_id uuid, status app.intake_status, person_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    made uuid;
  BEGIN
    IF NOT ((submit_intake.source = 'manual' AND private.staff_can('admin', 'onboarding'))
            OR (submit_intake.source = 'telegram' AND private.bot_can('onboarding'))) THEN
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

-- Links and codes of accounts the rule now leaves out (an admin without the onboarding role) go.
DELETE FROM auth.telegram_links l
 WHERE NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = l.user_id AND s.active AND r.role = 'onboarding');
DELETE FROM auth.telegram_link_codes c
 WHERE NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = c.user_id AND s.active AND r.role = 'onboarding');

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
