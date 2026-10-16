-- migrate:up

-- The messages newcomers receive by WhatsApp, written by the team in the staff app's Mensajes, not in code (PLAN M5;
-- Dani, 2026-10-16: "it should be a template that we craft somewhere (not code)"). Each has a purpose: the welcome
-- (the person page's "Abrir WhatsApp") or the census link (the Censo queue's), and a purpose may have several, picked
-- when the message is opened. The code keeps only a neutral fallback, for a purpose with none in use.
--
-- A message's placeholders are its purpose's: {nombre} and {yo}, and {enlace} for the census link, which needs it;
-- any other brace is refused, so a typo never reaches a newcomer as "{nombe}". A message that uses {nombre} says, in
-- body_nameless, how it reads for someone saved without a name (PLAN R37); one that doesn't needs no second version.
-- Its version goes up with every change to what it says, and what went out records the version (as outreach's
-- letters, PLAN R27). Retired (active = false) rather than deleted: the history names it.
CREATE TYPE app.message_purpose AS ENUM ('welcome', 'census_link');

CREATE TABLE app.message_templates (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  purpose        app.message_purpose NOT NULL,
  title          text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 80),
  body           text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 2000),
  body_nameless  text CHECK (btrim(body_nameless) <> '' AND length(body_nameless) <= 2000),
  active         boolean NOT NULL DEFAULT true,
  version        integer NOT NULL DEFAULT 1,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purpose, title),
  CONSTRAINT message_templates_placeholders_check CHECK (
    regexp_replace(body || E'\n' || coalesce(body_nameless, ''),
                   CASE purpose WHEN 'census_link' THEN '\{(nombre|yo|enlace)\}' ELSE '\{(nombre|yo)\}' END,
                   '', 'g') !~ '[{}]'),
  CONSTRAINT message_templates_link_check CHECK (
    purpose <> 'census_link'
    OR (strpos(body, '{enlace}') > 0 AND (body_nameless IS NULL OR strpos(body_nameless, '{enlace}') > 0))),
  CONSTRAINT message_templates_nameless_check CHECK (
    CASE WHEN strpos(body, '{nombre}') > 0
         THEN body_nameless IS NOT NULL AND strpos(body_nameless, '{nombre}') = 0
         ELSE body_nameless IS NULL END)
);

CREATE FUNCTION private.message_template_version() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.body_nameless IS DISTINCT FROM OLD.body_nameless THEN
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.message_templates
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER version BEFORE UPDATE ON app.message_templates
  FOR EACH ROW EXECUTE FUNCTION private.message_template_version();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.message_templates
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- The onboarding team writes them (it sends them) and admins too, through the staff app; the bot nothing. Never
-- deleted, and the purpose and version aren't anyone's to change.
ALTER TABLE app.message_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (purpose, title, body, body_nameless, active), UPDATE (title, body, body_nameless, active)
  ON app.message_templates TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.message_templates FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_insert ON app.message_templates FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY onboarding_update ON app.message_templates FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')))
  WITH CHECK ((SELECT private.staff_can('admin', 'onboarding')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
