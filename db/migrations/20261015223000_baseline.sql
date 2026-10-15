-- migrate:up

-- Migrations run as the database owner (pauseai_backoffice_owner). The runtime roles are created by the cluster's
-- Postgres provisioning (gitops, the halyard chart's extraRoles), own nothing and cannot bypass RLS (ADR-0002).
-- Migrations are forward-only: every down block is empty.

-- The grants below need the roles: without them this stops here, and nothing is applied.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(r.name, ', ') INTO missing
    FROM unnest(ARRAY['pauseai_backoffice_app', 'pauseai_backoffice_auth']) AS r(name)
   WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles p WHERE p.rolname = r.name);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '% missing: add them to the postgresql values first (gitops)', missing;
  END IF;
END
$$;

-- Only roles granted CONNECT explicitly may reach this database; other apps on the shared instance cannot.
DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
END
$$;

-- Nothing is reachable through the public schema; it only holds dbmate's bookkeeping.
REVOKE ALL ON SCHEMA public FROM PUBLIC;

-- Closed by default: functions created by the owner are not executable by PUBLIC. Every grant is explicit.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- `app` holds the tables; `private` holds helper functions and, from M1, the bot's internal state.
CREATE SCHEMA app;
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

-- The app role can look objects up in these schemas. Table and function privileges are granted one by one.
GRANT USAGE ON SCHEMA app, private TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
