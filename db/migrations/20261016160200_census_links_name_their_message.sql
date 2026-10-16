-- migrate:up

-- A census link names the message it was made with, when the team wrote one in Mensajes (PLAN M5): a census link
-- template and the version it had, both or neither, set when the link is made (its URL is shown only then, inside the
-- message), never after. "Sí, lo he enviado" then says it went out, and its contact attempt names the same message.
ALTER TABLE app.census_links
  ADD COLUMN template_id uuid REFERENCES app.message_templates (id),
  ADD COLUMN template_version integer CHECK (template_version > 0),
  ADD CONSTRAINT census_links_template_check CHECK ((template_id IS NULL) = (template_version IS NULL));
CREATE INDEX census_links_template_id_idx ON app.census_links (template_id);

-- A census link's message, of a version that template has had. Runs as the writer, onboarding staff, who read the
-- templates.
CREATE FUNCTION private.census_link_template() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.template_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.message_templates m
                        WHERE m.id = NEW.template_id AND m.purpose = 'census_link'
                          AND m.version >= NEW.template_version) THEN
      RAISE EXCEPTION 'A census link names a census link message and a version it has had'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER template BEFORE INSERT ON app.census_links
  FOR EACH ROW EXECUTE FUNCTION private.census_link_template();

GRANT SELECT (template_id, template_version), INSERT (template_id, template_version)
  ON app.census_links TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
