-- migrate:up

-- The bank (ADR-0006 decision 2; accounting spec §6, step 2): the statements tesorería downloads from the bank and
-- imports as Norma 43 files, and each of their lines matched to the entry that records it. The app never reaches the
-- bank: what it knows of it is what someone imports. A line is what the bank said and never changes; only its match
-- does, and matching is a person's: the staff app suggests, tesorería confirms.
--
-- The rules, each with a test (packages/db/tests/bank.spec.ts) and a mutation (scripts/mutations/bank.json):
-- - a statement is of a treasury account, and its lines are of the same account;
-- - a line is imported once: an overlapping statement brings only what is new (its fingerprint, per account);
-- - a line never changes but for its match, and a matched line is never deleted;
-- - a match names a posted entry of a form, not corrected, that moves the line's account by the line's amount, and
--   an entry matches one line of an account at most;
-- - nothing is written dated in a closed year: no line imported there, no match made or undone there.

-- An import: of which treasury account, the period and balances the bank wrote in the file, and the file's hash.
CREATE TABLE app.bank_statements (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  account_id     uuid NOT NULL REFERENCES app.ledger_accounts (id),
  sha256         text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  starts_on      date NOT NULL,
  ends_on        date NOT NULL,
  -- Signed: negative when the account was overdrawn.
  opening_cents  bigint NOT NULL CHECK (abs(opening_cents) <= 99999999999),
  closing_cents  bigint NOT NULL CHECK (abs(closing_cents) <= 99999999999),
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, account_id),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX bank_statements_account_idx ON app.bank_statements (account_id, ends_on);

CREATE TABLE app.bank_statement_lines (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  statement_id    uuid NOT NULL,
  account_id      uuid NOT NULL,
  -- The day of the operation, and its value day.
  booked_on       date NOT NULL,
  value_on        date NOT NULL,
  -- Norma 43's common concept (transfers, cards, fees...), which the staff app names.
  common_concept  text NOT NULL CHECK (common_concept ~ '^[0-9]{2}$'),
  -- In positive, out negative, never zero.
  amount_cents    bigint NOT NULL CHECK (amount_cents <> 0 AND abs(amount_cents) <= 99999999999),
  -- What the bank wrote: its concept lines and its references, which name whoever paid or was paid.
  description     text NOT NULL CHECK (length(description) <= 1000),
  reference       text NOT NULL CHECK (length(reference) <= 200),
  -- The line's records as the bank wrote them, with how many identical ones came before it in its statement, hashed
  -- by the API: the same movement in two overlapping statements has the same fingerprint.
  fingerprint     text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  entry_id        uuid REFERENCES app.journal_entries (id),
  matched_by      uuid,
  matched_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (statement_id, account_id) REFERENCES app.bank_statements (id, account_id) ON DELETE CASCADE,
  UNIQUE (account_id, fingerprint),
  UNIQUE (account_id, entry_id),
  CHECK ((entry_id IS NULL) = (matched_at IS NULL)),
  CHECK ((entry_id IS NULL) = (matched_by IS NULL))
);
COMMENT ON COLUMN app.bank_statement_lines.description IS 'personal data';
COMMENT ON COLUMN app.bank_statement_lines.reference IS 'personal data';
CREATE INDEX bank_statement_lines_statement_idx ON app.bank_statement_lines (statement_id);
CREATE INDEX bank_statement_lines_entry_idx ON app.bank_statement_lines (entry_id);

-- Rules ------------------------------------------------------------------------------------------------------------

-- A statement is of a treasury account: where money actually is. After the row, so the policies refuse first whoever
-- may not import at all (and so may not see the chart), as private.journal_line_rules does.
CREATE FUNCTION private.bank_statement_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.ledger_accounts a WHERE a.id = NEW.account_id AND a.treasury) THEN
      RAISE EXCEPTION 'a statement is of a treasury account'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bank_statements_account';
    END IF;
    RETURN NULL;
  END
  $$;

-- A line never changes but for its match, which is stamped; a matched one is never deleted (with its statement or
-- otherwise); nothing dated in a closed year is imported, matched or unmatched. A match names a posted entry of a
-- form (not a reversal, nor the database's opening or closing), not corrected by a reversal, whose lines move the
-- line's account by exactly the line's amount. Posted entries never change, so a match stays true; one whose entry is
-- corrected later stays as it was, and the staff app asks for the corrected one.
CREATE FUNCTION private.bank_line_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    day date;
    moved bigint;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      day := NEW.booked_on;
    ELSE
      day := OLD.booked_on;
    END IF;
    IF TG_OP = 'DELETE' AND OLD.entry_id IS NOT NULL THEN
      RAISE EXCEPTION 'a matched bank line is never deleted: undo its match first'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'UPDATE'
       AND (NEW.statement_id, NEW.account_id, NEW.booked_on, NEW.value_on, NEW.common_concept, NEW.amount_cents,
            NEW.description, NEW.reference, NEW.fingerprint)
           IS DISTINCT FROM
           (OLD.statement_id, OLD.account_id, OLD.booked_on, OLD.value_on, OLD.common_concept, OLD.amount_cents,
            OLD.description, OLD.reference, OLD.fingerprint) THEN
      RAISE EXCEPTION 'a bank line is what the bank said: only its match changes'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM app.fiscal_years y
                WHERE y.year = extract(year FROM day)::integer AND y.status = 'closed') THEN
      RAISE EXCEPTION 'nothing is written dated in a closed year' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.entry_id IS NOT DISTINCT FROM OLD.entry_id THEN
      NEW.matched_by := OLD.matched_by;
      NEW.matched_at := OLD.matched_at;
      RETURN NEW;
    END IF;
    IF NEW.entry_id IS NULL THEN
      NEW.matched_by := NULL;
      NEW.matched_at := NULL;
      RETURN NEW;
    END IF;
    SELECT sum(l.debit_cents - l.credit_cents) INTO moved
      FROM app.journal_lines l
      JOIN app.journal_entries e ON e.id = l.entry_id
     WHERE e.id = NEW.entry_id AND l.account_id = NEW.account_id
       AND e.status = 'posted' AND e.kind IN ('income', 'expense', 'transfer', 'manual')
       AND NOT EXISTS (SELECT 1 FROM app.journal_entries r WHERE r.reverses = e.id);
    IF moved IS DISTINCT FROM NEW.amount_cents THEN
      RAISE EXCEPTION 'a bank line matches a posted entry, not corrected, that moves its account by its amount'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bank_statement_lines_match';
    END IF;
    NEW.matched_by := private.current_user_id();
    NEW.matched_at := now();
    RETURN NEW;
  END
  $$;

CREATE TRIGGER rules AFTER INSERT ON app.bank_statements
  FOR EACH ROW EXECUTE FUNCTION private.bank_statement_rules();
CREATE TRIGGER stamp BEFORE INSERT ON app.bank_statements
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.bank_statements
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER rules BEFORE INSERT OR UPDATE OR DELETE ON app.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION private.bank_line_rules();
CREATE TRIGGER stamp BEFORE INSERT ON app.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Grants and policies ------------------------------------------------------------------------------------------------

-- Tesorería imports and matches, admins read, through the staff app; nobody else, the bot included. A statement is
-- imported or deleted whole (an import undone: its lines go with it, unless one is matched), never changed; a line's
-- match is all that changes.
ALTER TABLE app.bank_statements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (account_id, sha256, starts_on, ends_on, opening_cents, closing_cents), DELETE
  ON app.bank_statements TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.bank_statements FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.bank_statements FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.bank_statements FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

ALTER TABLE app.bank_statement_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT,
  INSERT (statement_id, account_id, booked_on, value_on, common_concept, amount_cents, description, reference,
          fingerprint),
  UPDATE (entry_id)
  ON app.bank_statement_lines TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.bank_statement_lines FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.bank_statement_lines FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_update ON app.bank_statement_lines FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
