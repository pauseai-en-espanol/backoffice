-- migrate:up

-- A contact attempt names the message that went out, when it came from one the team wrote in Mensajes (PLAN M5):
-- `templateId` with `templateVersion` in its data, both or neither, a version that template has had (as an outreach
-- letter records the version it was written from, PLAN R27). Runs as the writer, onboarding staff, who read the
-- templates; any other writer names none.
CREATE FUNCTION private.attempt_template() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT (NEW.data ? 'templateId' OR NEW.data ? 'templateVersion') THEN
      RETURN NEW;
    END IF;
    -- One test at a time: the version is cast only once it is known to be a whole number.
    IF jsonb_typeof(NEW.data -> 'templateId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(NEW.data -> 'templateVersion') IS DISTINCT FROM 'number'
       OR (NEW.data ->> 'templateVersion') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'A message that went out names a template and a version it has had'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.message_templates m
                    WHERE m.id::text = NEW.data ->> 'templateId'
                      AND m.version >= (NEW.data ->> 'templateVersion')::integer) THEN
      RAISE EXCEPTION 'A message that went out names a template and a version it has had'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER attempt_template BEFORE INSERT ON app.person_events
  FOR EACH ROW WHEN (NEW.kind = 'contact_attempt') EXECUTE FUNCTION private.attempt_template();

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
