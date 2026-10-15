-- migrate:up

-- Actor context (ADR-0002). withActor sets these at the start of every transaction with set_config(..., true), so
-- they never outlive it. Unset means "no actor", and every policy denies.

CREATE FUNCTION private.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = ''
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- 2 only for a session that passed the second factor, or a linked Telegram account acting through the bot (whose
-- link was made from such a session, ADR-0004). 0 when unset.
CREATE FUNCTION private.current_aal() RETURNS integer
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = ''
  AS $$ SELECT coalesce(nullif(current_setting('app.aal', true), '')::integer, 0) $$;

-- The channel a request came through: 'web' (the staff app) or 'bot' (the Telegram bot, ADR-0004). Anything else,
-- unset included, is no channel, which no policy admits.
CREATE FUNCTION private.current_channel() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  SET search_path = ''
  AS $$ SELECT CASE current_setting('app.channel', true) WHEN 'web' THEN 'web' WHEN 'bot' THEN 'bot' END $$;

GRANT EXECUTE ON FUNCTION private.current_user_id(), private.current_aal(), private.current_channel()
  TO pauseai_backoffice_app;

-- Sets actor columns and event timestamps from the session, so nobody can act in someone else's name or backdate
-- anything (data model spec, conventions). Attached BEFORE INSERT [OR UPDATE] FOR EACH ROW, with the stamped columns
-- as arguments, e.g. private.stamp('created_by', 'created_at', 'updated_by', 'updated_at'):
-- - On insert, every argument is set: *_by and actor_id to private.current_user_id(), *_at to the transaction time.
-- - On update, updated_by and updated_at are set again, and every other argument keeps its stored value.
-- Whatever the caller sent is overwritten. Without an actor the actor columns are null, so a NOT NULL one refuses the
-- write. Columns set on a later transition (accepted_by, deactivated_at, …) belong to the trigger for that transition.
CREATE FUNCTION private.stamp() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    col text;
    fresh jsonb := to_jsonb(NEW);
    stamped jsonb := '{}';
  BEGIN
    IF TG_NARGS = 0 THEN
      RAISE EXCEPTION 'private.stamp on %.% needs the columns to stamp', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF NOT fresh ? col OR NOT (col LIKE '%\_at' OR col LIKE '%\_by' OR col = 'actor_id') THEN
        RAISE EXCEPTION 'private.stamp on %.%: % is not an actor column or event timestamp of the table',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, col
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      stamped := stamped || jsonb_build_object(col,
        CASE
          WHEN TG_OP = 'UPDATE' AND col NOT IN ('updated_by', 'updated_at') THEN to_jsonb(OLD) -> col
          WHEN col LIKE '%\_at' THEN to_jsonb(now())
          ELSE to_jsonb(private.current_user_id())
        END);
    END LOOP;
    RETURN jsonb_populate_record(NEW, stamped);
  END
  $$;

-- History is never changed: the audit log now, the timelines from M1 (data model spec). Attached as BEFORE UPDATE OR
-- DELETE (row) and BEFORE TRUNCATE (statement) triggers. The only exception is anonymisation (personal data spec,
-- rights), where the table owner sets app.redact = 'on' for the transaction inside the function that redacts. The
-- ownership check matters: any role can set app.redact, but only the owner may use it.
CREATE FUNCTION private.forbid_mutation() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF current_setting('app.redact', true) = 'on'
       AND (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)
         = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user) THEN
      IF TG_LEVEL = 'ROW' THEN
        RETURN coalesce(NEW, OLD);
      END IF;
      RETURN NULL;
    END IF;
    RAISE EXCEPTION '%.% is append-only: % is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'restrict_violation';
  END
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
