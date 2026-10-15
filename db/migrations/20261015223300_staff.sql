-- migrate:up

-- Staff (ADR-0002; data model spec, M0 tables): the people who sign in to the backoffice, and what each may do. A
-- staff member is a Better Auth account made staff by accepting an invitation (or, for the first admin, by the
-- owner's SQL in docs/runbooks/first-admin.md). Roles combine. Staff are deactivated, never deleted: their id stays
-- on everything they did.

CREATE TYPE app.staff_role AS ENUM ('admin', 'onboarding', 'outreach');

CREATE TABLE app.staff (
  user_id         uuid PRIMARY KEY REFERENCES auth.users (id),  -- the account can't be deleted while staff
  display_name    text NOT NULL CHECK (btrim(display_name) <> '' AND length(display_name) <= 200),
  active          boolean NOT NULL DEFAULT true,
  invited_by      uuid REFERENCES app.staff (user_id),           -- null for the first admin
  created_at      timestamptz NOT NULL DEFAULT now(),
  deactivated_at  timestamptz,
  deactivated_by  uuid,                                          -- null when the owner deactivated them
  CHECK (active = (deactivated_at IS NULL))
);
COMMENT ON COLUMN app.staff.display_name IS 'personal data';

CREATE TABLE app.staff_roles (
  user_id     uuid NOT NULL REFERENCES app.staff (user_id),
  role        app.staff_role NOT NULL,
  created_by  uuid,                                              -- null when the owner added it
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

-- Policy helpers (ADR-0002) ---------------------------------------------------------------------------------------

-- Whether the actor is an active staff member holding one of `roles`, acting through the given channel. SECURITY
-- DEFINER so policies on staff and staff_roles can use them without recursing into their own RLS. Policies call them
-- as `(SELECT private.staff_can(...))`, which Postgres evaluates once per statement.
--
-- staff_can: the staff app, after the second factor. Every policy uses it.
-- bot_can: the Telegram bot (ADR-0004). A policy names it only on purpose, so a table is closed to the bot until
-- someone opens it; the catalog test lists every policy that does.
CREATE FUNCTION private.staff_can(VARIADIC roles app.staff_role[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT private.current_channel() IS NOT DISTINCT FROM 'web'
       AND private.current_aal() = 2
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = private.current_user_id() AND s.active AND r.role = ANY (roles))
  $$;

CREATE FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT private.current_channel() IS NOT DISTINCT FROM 'bot'
       AND private.current_aal() = 2
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = private.current_user_id() AND s.active AND r.role = ANY (roles))
  $$;

GRANT EXECUTE ON FUNCTION private.staff_can(app.staff_role[]), private.bot_can(app.staff_role[])
  TO pauseai_backoffice_app;

-- Triggers --------------------------------------------------------------------------------------------------------

-- Deactivating stamps when and by whom; reactivating clears both. Nothing else may set them.
CREATE FUNCTION private.staff_activation() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.active IS NOT DISTINCT FROM OLD.active THEN
      NEW.deactivated_at := OLD.deactivated_at;
      NEW.deactivated_by := OLD.deactivated_by;
    ELSIF NEW.active THEN
      NEW.deactivated_at := NULL;
      NEW.deactivated_by := NULL;
    ELSE
      NEW.deactivated_at := now();
      NEW.deactivated_by := private.current_user_id();
    END IF;
    RETURN NEW;
  END
  $$;

-- Access never depends on nobody (BRIEF, roles): once there is an admin, the last active one can't be deactivated
-- or lose the role. SECURITY DEFINER because it must count every admin, including when the actor has just
-- deactivated themselves and RLS would show them nothing. It only reads.
CREATE FUNCTION private.keep_an_admin() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.active AND r.role = 'admin') THEN
      RAISE EXCEPTION 'the last active admin can''t be removed: make someone else admin first'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NULL;
  END
  $$;

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.staff
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');
CREATE TRIGGER activation BEFORE INSERT OR UPDATE ON app.staff
  FOR EACH ROW EXECUTE FUNCTION private.staff_activation();
CREATE TRIGGER keep_an_admin AFTER UPDATE OF active ON app.staff
  FOR EACH ROW WHEN (OLD.active AND NOT NEW.active) EXECUTE FUNCTION private.keep_an_admin();

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.staff_roles
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER keep_an_admin AFTER DELETE ON app.staff_roles
  FOR EACH ROW WHEN (OLD.role = 'admin') EXECUTE FUNCTION private.keep_an_admin();

-- Grants and policies ---------------------------------------------------------------------------------------------

ALTER TABLE app.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.staff_roles ENABLE ROW LEVEL SECURITY;

-- Every staff member sees the team (to assign people to each other); admins rename, deactivate and reactivate. Staff
-- rows are made only by accepting an invitation (private.accept_invitation), never inserted or deleted here.
GRANT SELECT, UPDATE (display_name, active) ON app.staff TO pauseai_backoffice_app;
CREATE POLICY staff_read ON app.staff FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding', 'outreach')));
CREATE POLICY admin_update ON app.staff FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')))
  WITH CHECK ((SELECT private.staff_can('admin')));

-- Every staff member sees who holds which role; admins add and remove roles. A role change is a delete and an insert.
GRANT SELECT, DELETE ON app.staff_roles TO pauseai_backoffice_app;
GRANT INSERT (user_id, role) ON app.staff_roles TO pauseai_backoffice_app;
CREATE POLICY staff_read ON app.staff_roles FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding', 'outreach')));
CREATE POLICY admin_insert ON app.staff_roles FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin')));
CREATE POLICY admin_delete ON app.staff_roles FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
