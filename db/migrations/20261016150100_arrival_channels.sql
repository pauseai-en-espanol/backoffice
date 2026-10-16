-- migrate:up

-- Where people come from, "Llegó por" (PLAN M5, step 3; Dani, 2026-10-16: "Email, Whatsapp, Discord for now"): a list
-- admins edit in Ajustes, like the census's, never free text, so the Panel can count it. Not to be confused with a
-- person's sources (app.person_sources), which say how their record was entered: the bot, by hand, Global's form, a
-- CSV, the census ("Entró por").
--
-- `key` names the entries the backoffice itself picks (the bot's reports come from WhatsApp, Global's sign-ups from its
-- form): fixed here, never editable, so renaming an entry in Ajustes doesn't break the defaults. An entry in use is
-- deactivated, never deleted.
CREATE TABLE app.arrival_channels (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  key         text UNIQUE CHECK (key ~ '^[a-z_]{1,30}$'),
  label       text NOT NULL UNIQUE CHECK (btrim(label) <> '' AND length(label) <= 80),
  active      boolean NOT NULL DEFAULT true,
  position    integer NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.arrival_channels (key, label, position) VALUES
  ('whatsapp', 'WhatsApp', 1), ('email', 'Email', 2), ('discord', 'Discord', 3),
  ('airtable', 'Formulario de PauseAI Global', 4), ('other', 'Otro', 5);

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.arrival_channels
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.arrival_channels
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Onboarding staff and admins read the list (they choose from it); admins edit it.
ALTER TABLE app.arrival_channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (label, active, position), UPDATE (label, active, position)
  ON app.arrival_channels TO pauseai_backoffice_app;
CREATE POLICY onboarding_read ON app.arrival_channels FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding')));
CREATE POLICY admin_insert ON app.arrival_channels FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin')));
CREATE POLICY admin_update ON app.arrival_channels FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')))
  WITH CHECK ((SELECT private.staff_can('admin')));

-- An intake's "where from", by an entry's id (the staff app's choice), key (the bot's and the sync's) or label (a
-- CSV's column; case and accents aside): the active entry it names, or NULL. Runs inside the intake functions, as
-- their owner.
CREATE FUNCTION private.arrival_channel(word text) RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = ''
  AS $$
    SELECT c.id FROM app.arrival_channels c
     WHERE c.active AND coalesce(btrim(word), '') <> ''
       AND (c.id::text = lower(btrim(word)) OR c.key = lower(btrim(word))
            OR private.fold_name(c.label) = private.fold_name(word))
     ORDER BY (c.key = lower(btrim(word))) DESC NULLS LAST, c.position
     LIMIT 1
  $$;
REVOKE ALL ON FUNCTION private.arrival_channel(text) FROM PUBLIC;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
