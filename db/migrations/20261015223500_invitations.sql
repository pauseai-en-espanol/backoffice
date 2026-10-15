-- migrate:up

-- Invitations (ADR-0002; data model spec, M0 tables): staff accounts are invite-only. Admins invite someone by email
-- with a set of roles; the email carries a random token, of which only the SHA-256 is stored. An invitation is pending
-- while it is neither accepted nor revoked, hasn't expired, and the admin who made it is still an active admin.

CREATE TABLE app.invitations (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  email        text NOT NULL CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  roles        app.staff_role[] NOT NULL CHECK (cardinality(roles) > 0 AND array_position(roles, NULL) IS NULL),
  token_hash   text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),  -- hex SHA-256; the token is never stored
  expires_at   timestamptz NOT NULL,
  created_by   uuid NOT NULL REFERENCES app.staff (user_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  accepted_by  uuid REFERENCES app.staff (user_id),
  revoked_at   timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '30 days'),
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
COMMENT ON COLUMN app.invitations.email IS 'personal data';
CREATE INDEX invitations_created_by_idx ON app.invitations (created_by);

-- A pending invitation changes once: it is revoked, or accepted before it expires. Nothing else about it changes, and
-- a decided one never changes again. The time (and, on acceptance, the actor) come from the session.
CREATE FUNCTION private.invitation_transition() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    decision text[] := ARRAY['accepted_at', 'accepted_by', 'revoked_at'];
  BEGIN
    IF OLD.accepted_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invitation % is already decided', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    IF (to_jsonb(NEW) - decision) IS DISTINCT FROM (to_jsonb(OLD) - decision) THEN
      RAISE EXCEPTION 'invitation %: only revoking or accepting it is allowed', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.revoked_at IS NOT NULL AND NEW.accepted_at IS NULL AND NEW.accepted_by IS NULL THEN
      NEW.revoked_at := now();
    ELSIF NEW.revoked_at IS NULL AND (NEW.accepted_at IS NOT NULL OR NEW.accepted_by IS NOT NULL) THEN
      IF OLD.expires_at <= now() THEN
        RAISE EXCEPTION 'invitation % has expired', OLD.id USING ERRCODE = 'restrict_violation';
      END IF;
      NEW.accepted_at := now();
      NEW.accepted_by := private.current_user_id();
    ELSE
      RAISE EXCEPTION 'invitation %: revoke it or accept it', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER transition BEFORE UPDATE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION private.invitation_transition();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.invitations
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Only admins see invitations (they hold emails). They invite, revoke pending invitations, and delete the ones no
-- longer pending, so an email is kept only while it is needed; the audit log keeps the invitation's id, never its
-- email.
ALTER TABLE app.invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, DELETE ON app.invitations TO pauseai_backoffice_app;
GRANT INSERT (email, roles, token_hash, expires_at), UPDATE (revoked_at) ON app.invitations TO pauseai_backoffice_app;
CREATE POLICY admin_read ON app.invitations FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')));
CREATE POLICY admin_insert ON app.invitations FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin')));
CREATE POLICY admin_revoke ON app.invitations FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')) AND accepted_at IS NULL AND revoked_at IS NULL)
  WITH CHECK ((SELECT private.staff_can('admin')));
CREATE POLICY admin_delete ON app.invitations FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')) AND (accepted_at IS NOT NULL OR revoked_at IS NOT NULL
                                                   OR expires_at <= now()));

-- Looking an invitation up and accepting it (as aiontheballot R114). The API never sees an invitation it can't name
-- by its token, and the app role reads no account's email, so two narrow SECURITY DEFINER functions do the reading.
-- Both take the token's SHA-256 (hex), never the token itself, which so stays out of the database's logs.
--
-- private.pending_invitation: the email and roles of a pending invitation, and nothing for any other token, so the
-- acceptance page can say what is offered and create the account with that email. Whoever holds the link may know.
-- private.accept_invitation: accepts it for the actor, through the staff app only, and only if the actor's account
-- has the invited email, verified. It makes the account staff (or active again, if it was deactivated), adds the
-- roles, and marks the invitation accepted through its transition trigger. Every policy wants aal2, so the new staff
-- member reaches nothing until they have enrolled their second factor. It answers whether it did.

CREATE FUNCTION private.pending_invitation(token_hash text)
  RETURNS TABLE (email text, roles app.staff_role[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT i.email, i.roles
      FROM app.invitations i
     WHERE i.token_hash = pending_invitation.token_hash
       AND i.accepted_at IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > now()
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = i.created_by AND s.active AND r.role = 'admin')
  $$;

CREATE FUNCTION private.accept_invitation(token_hash text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    actor uuid := private.current_user_id();
    invitation app.invitations;
    account_name text;
  BEGIN
    IF actor IS NULL OR accept_invitation.token_hash IS NULL
       OR private.current_channel() IS DISTINCT FROM 'web' THEN
      RETURN false;
    END IF;
    SELECT i.* INTO invitation
      FROM app.invitations i
     WHERE i.token_hash = accept_invitation.token_hash
       AND i.accepted_at IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > now()
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = i.created_by AND s.active AND r.role = 'admin')
       FOR UPDATE OF i;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    SELECT btrim(u.name) INTO account_name
      FROM auth.users u
     WHERE u.id = actor AND u.email_verified AND lower(u.email) = invitation.email;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    INSERT INTO app.staff AS s (user_id, display_name, invited_by)
    VALUES (actor, left(account_name, 200), invitation.created_by)
    ON CONFLICT (user_id) DO UPDATE SET active = true WHERE NOT s.active;
    -- Holding a role already is no reason to refuse: the invitation is still accepted, once.
    INSERT INTO app.staff_roles (user_id, role)
    SELECT actor, r.role FROM unnest(invitation.roles) AS r(role)
    ON CONFLICT DO NOTHING;
    UPDATE app.invitations i SET accepted_at = now(), accepted_by = actor WHERE i.id = invitation.id;
    RETURN true;
  END
  $$;

REVOKE ALL ON FUNCTION private.pending_invitation(text), private.accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pending_invitation(text), private.accept_invitation(text)
  TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
