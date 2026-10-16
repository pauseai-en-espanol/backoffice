-- migrate:up

-- The Airtable sync's settings (ADR-0005; Dani, 2026-10-17: the link set in the web, by admins, not sealed in
-- gitops): Global's shared view link, whether the sync runs, and how its last run went. One row.
--
-- The link is a credential (anyone holding it reads every Spain signup), so it is stored encrypted, by the API, with a
-- key that never reaches Postgres (AES-256-GCM, the deployment's AIRTABLE_LINK_KEY): a backup or a dump holds no
-- usable link. And it is write-only: the app role may set or clear it but never select it, so no staff route can
-- return it, nor its ciphertext. Only the sync reads it, as the ingest role, through private.airtable_link, and only
-- while the sync is on. The audit log records that it changed, and who changed it, never the value: the column is
-- marked personal data, which private.audit leaves out.
--
-- Who set the link and when is the database's to say (a trigger), not the caller's; removing it turns the sync off.
-- A new link starts with no last run: the last one was another view's.
CREATE TABLE app.airtable_sync (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled           boolean NOT NULL DEFAULT false,
  link_ciphertext   text CHECK (link_ciphertext ~ '^v1\.[A-Za-z0-9_-]+$' AND length(link_ciphertext) <= 1000),
  link_set_by       uuid,
  link_set_at       timestamptz,
  last_run_at       timestamptz,
  last_run_failure  text CHECK (last_run_failure IN ('link', 'page', 'data', 'columns', 'key', 'database')),
  last_run_counts   jsonb CHECK (jsonb_typeof(last_run_counts) = 'object'),
  updated_by        uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT airtable_sync_link_check CHECK ((link_ciphertext IS NULL) = (link_set_at IS NULL)),
  CONSTRAINT airtable_sync_enabled_check CHECK (NOT enabled OR link_ciphertext IS NOT NULL),
  CONSTRAINT airtable_sync_run_check CHECK (
    CASE WHEN last_run_at IS NULL THEN last_run_failure IS NULL AND last_run_counts IS NULL
         ELSE (last_run_failure IS NULL) <> (last_run_counts IS NULL) END)
);
INSERT INTO app.airtable_sync DEFAULT VALUES;

COMMENT ON COLUMN app.airtable_sync.link_ciphertext IS 'personal data';

CREATE FUNCTION private.airtable_link_set() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.link_ciphertext IS NOT DISTINCT FROM OLD.link_ciphertext THEN
      NEW.link_set_by := OLD.link_set_by;
      NEW.link_set_at := OLD.link_set_at;
      RETURN NEW;
    END IF;
    IF NEW.link_ciphertext IS NULL THEN
      NEW.link_set_by := NULL;
      NEW.link_set_at := NULL;
      NEW.enabled := false;
    ELSE
      NEW.link_set_by := private.current_user_id();
      NEW.link_set_at := now();
    END IF;
    IF TG_OP = 'UPDATE' THEN
      NEW.last_run_at := NULL;
      NEW.last_run_failure := NULL;
      NEW.last_run_counts := NULL;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER link_set BEFORE INSERT OR UPDATE ON app.airtable_sync
  FOR EACH ROW EXECUTE FUNCTION private.airtable_link_set();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.airtable_sync
  FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.airtable_sync
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Admins set the link and turn the sync on or off, through the staff app; onboarding staff and admins read whether
-- it's on (Importar), every column but the link. The bot nothing.
ALTER TABLE app.airtable_sync ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, enabled, link_set_by, link_set_at, last_run_at, last_run_failure, last_run_counts, updated_by,
              updated_at),
      UPDATE (enabled, link_ciphertext)
  ON app.airtable_sync TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.airtable_sync FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY admin_update ON app.airtable_sync FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')))
  WITH CHECK ((SELECT private.staff_can('admin')));

-- The sync's two (ADR-0005), for the ingest role alone: the link to read, encrypted, only while the sync is on (NULL
-- when it's off or has none); and how a run went, a failure by its kind or the counts, never a message.
CREATE FUNCTION private.airtable_link() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT s.link_ciphertext FROM app.airtable_sync s WHERE s.enabled
  $$;

CREATE FUNCTION private.airtable_ran(failure text, counts jsonb) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF (failure IS NULL) = (counts IS NULL) THEN
      RAISE EXCEPTION 'a run either failed or counted' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    UPDATE app.airtable_sync s
       SET last_run_at = now(), last_run_failure = airtable_ran.failure, last_run_counts = airtable_ran.counts
     WHERE s.id;
  END
  $$;

REVOKE ALL ON FUNCTION private.airtable_link() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.airtable_ran(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.airtable_link() TO pauseai_backoffice_ingest;
GRANT EXECUTE ON FUNCTION private.airtable_ran(text, jsonb) TO pauseai_backoffice_ingest;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
