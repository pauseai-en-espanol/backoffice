-- migrate:up

-- The association's books, part three (ADR-0006 decision 7; accounting spec §1): receipts, a PDF or a photo attached
-- to an entry. The row is here, under RLS; the bytes are on the API's volume, encrypted with RECEIPTS_KEY and the
-- receipt's id as associated data, named by that id, and served only after this row is read through withActor. The
-- API writes the file first, then the row, so the id is the API's own. A posted entry's receipts are kept with it,
-- and more can be added while its year is open; a draft's are tesorería's to remove.
CREATE TABLE app.receipts (
  id            uuid PRIMARY KEY,
  entry_id      uuid NOT NULL REFERENCES app.journal_entries (id),
  -- What the uploader called it, shown and offered back on download; it may name someone.
  file_name     text NOT NULL CHECK (btrim(file_name) <> '' AND length(file_name) <= 255),
  -- Recognised by the API from the file's first bytes, never from what the browser claimed.
  content_type  text NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size     integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  -- Of the bytes as uploaded, checked again after each decryption.
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN app.receipts.file_name IS 'personal data';
CREATE INDEX receipts_entry_idx ON app.receipts (entry_id);

-- Nothing is attached to an entry dated in a closed year, and a posted entry's receipts are never removed.
CREATE FUNCTION private.receipt_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF EXISTS (SELECT 1 FROM app.journal_entries e WHERE e.id = OLD.entry_id AND e.status = 'posted') THEN
        RAISE EXCEPTION 'a posted entry''s receipts are kept with it' USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;
    IF EXISTS (SELECT 1 FROM app.journal_entries e JOIN app.fiscal_years y ON y.year = e.fiscal_year
                WHERE e.id = NEW.entry_id AND y.status = 'closed') THEN
      RAISE EXCEPTION 'nothing is written dated in a closed year' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER rules BEFORE INSERT OR DELETE ON app.receipts
  FOR EACH ROW EXECUTE FUNCTION private.receipt_rules();
CREATE TRIGGER stamp BEFORE INSERT ON app.receipts
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.receipts
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Tesorería attaches and removes them, admins read them (and so download them), through the staff app; nobody else.
-- Never changed: a wrong one is removed from a draft, or another attached.
ALTER TABLE app.receipts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (id, entry_id, file_name, content_type, byte_size, sha256), DELETE
  ON app.receipts TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.receipts FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.receipts FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.receipts FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

-- Which of these files on the volume have no receipt (ADR-0006 decision 7, as amended): the API asks as it starts,
-- with no actor, and sets those files aside (never served, never deleted on its own), and puts back any set aside
-- whose row has come back with a restore. SECURITY DEFINER to see every row without an actor; it takes ids and
-- returns ids, among those it was given, and nothing else: whether a receipt with an id the caller already holds
-- exists. No channel to check: nothing about anyone passes through it.
CREATE FUNCTION private.receipts_without_row(ids uuid[]) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT i.id FROM unnest(ids) AS i(id)
     WHERE NOT EXISTS (SELECT 1 FROM app.receipts r WHERE r.id = i.id)
  $$;
GRANT EXECUTE ON FUNCTION private.receipts_without_row(uuid[]) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
