-- migrate:up

-- The audit log (ADR-0002; data model spec): an append-only record of every write to `app`, by whom and through which
-- channel. Admins read it; nobody can change or remove an entry. Every table gets the audit trigger unless the catalog
-- test lists it as an exception, with a reason.
--
-- It never holds members' data (PLAN R2): columns commented 'personal data' are never copied, only named, so
-- anonymising a person never has to rewrite the log, and reading the log doesn't show anyone's details.

CREATE TABLE app.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    uuid,                                       -- null when written without an actor (the owner, a job)
  channel     text CHECK (channel IN ('web', 'bot')),     -- null without one
  action      text NOT NULL,                              -- 'insert', 'update' or 'delete' for table writes
  table_name  text NOT NULL,
  row_id      text NOT NULL,                              -- the primary key: its value, or a JSON object when composite
  diff        jsonb,                                      -- see private.audit()
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_at_idx ON app.audit_log (at DESC);
CREATE INDEX audit_log_row_idx ON app.audit_log (table_name, row_id);

-- Logs one row write. SECURITY DEFINER so runtime roles need no grant on audit_log. Attached AFTER INSERT OR UPDATE
-- OR DELETE FOR EACH ROW. The diff is {"new": row} on insert, {"old": row} on delete, and on update
-- {"old": changed, "new": changed}, of the changed columns only:
-- - columns commented 'personal data' are never copied: their names go in "personal" when they change;
-- - an update that changes nothing is not logged.
CREATE FUNCTION private.audit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
  DECLARE
    before jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    after jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    subject jsonb := coalesce(after, before);
    hidden text[];
    key_columns text[];
    changed text[];
    diff jsonb;
  BEGIN
    SELECT coalesce(array_agg(a.attname::text), '{}') INTO hidden
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_description d
        ON d.objoid = a.attrelid AND d.objsubid = a.attnum AND d.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
     WHERE a.attrelid = TG_RELID AND d.description = 'personal data';

    SELECT array_agg(a.attname::text ORDER BY k.ord) INTO key_columns
      FROM pg_catalog.pg_index i
     CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
     WHERE i.indrelid = TG_RELID AND i.indisprimary;
    IF key_columns IS NULL THEN
      RAISE EXCEPTION 'private.audit on %.%: the table needs a primary key', TG_TABLE_SCHEMA, TG_TABLE_NAME;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      SELECT coalesce(array_agg(n.key ORDER BY n.key), '{}') INTO changed
        FROM jsonb_each(after) n
       WHERE n.value IS DISTINCT FROM before -> n.key;
      IF cardinality(changed) = 0 THEN
        RETURN NULL;
      END IF;
      diff := jsonb_build_object(
        'old', (SELECT coalesce(jsonb_object_agg(o.key, o.value), '{}') FROM jsonb_each(before) o
                 WHERE o.key = ANY (changed) AND NOT o.key = ANY (hidden)),
        'new', (SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}') FROM jsonb_each(after) n
                 WHERE n.key = ANY (changed) AND NOT n.key = ANY (hidden)));
      IF changed && hidden THEN
        diff := diff || jsonb_build_object('personal',
          (SELECT to_jsonb(array_agg(c ORDER BY c)) FROM unnest(changed) c WHERE c = ANY (hidden)));
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      diff := jsonb_build_object('new', after - hidden);
    ELSE
      diff := jsonb_build_object('old', before - hidden);
    END IF;

    INSERT INTO app.audit_log (actor_id, channel, action, table_name, row_id, diff)
    VALUES (
      private.current_user_id(),
      private.current_channel(),
      lower(TG_OP),
      TG_TABLE_NAME,
      CASE WHEN cardinality(key_columns) = 1 THEN subject ->> key_columns[1]
           ELSE (SELECT jsonb_object_agg(c, subject -> c) FROM unnest(key_columns) c)::text END,
      diff);
    RETURN NULL;
  END
  $$;

-- The log itself: append-only, with its actor taken from the session like every other actor column.
CREATE TRIGGER forbid_mutation BEFORE UPDATE OR DELETE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER stamp BEFORE INSERT ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id');

ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON app.audit_log TO pauseai_backoffice_app;
CREATE POLICY admin_read ON app.audit_log FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')));

-- The tables so far.
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.staff
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.staff_roles
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
