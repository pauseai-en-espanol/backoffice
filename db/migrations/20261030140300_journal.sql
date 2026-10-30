-- migrate:up

-- The association's books, part two (ADR-0006 decisions 3 and 4; accounting spec §1, §3, §7): fiscal years, journal
-- entries and their lines. Double entry underneath, simple forms on top: each of the staff app's forms (Ingreso,
-- Gasto, Traspaso, Asiento manual) writes a balanced entry, and every report is a view of posted entries. Amounts are
-- whole cents, euros only.
--
-- The rules are the database's, each with a test (packages/db/tests/accounting.spec.ts) and a mutation
-- (scripts/mutations/accounting.json):
-- - a posted entry balances (debits equal credits, both more than zero) and has two lines or more;
-- - a posted entry and its lines never change and are never deleted: a reversing entry, which names the one it
--   reverses and mirrors its lines, corrects it, and an entry is reversed at most once;
-- - a posted entry takes the next number in its year, without gaps: the journal's order;
-- - nothing is written dated in a closed year; tesorería closes a year once the assembly has approved its accounts,
--   with the assembly's date, and the database posts the closing and opening entries in the same step;
-- - drafts are tesorería's to change or delete; only posted entries count.
CREATE TYPE app.fiscal_year_status AS ENUM ('open', 'closed');
CREATE TYPE app.entry_kind AS ENUM ('income', 'expense', 'transfer', 'manual', 'reversal', 'opening', 'closing');
CREATE TYPE app.entry_status AS ENUM ('draft', 'posted');

-- A calendar year (statutes, art. 30): open until tesorería closes it, then closed for good.
CREATE TABLE app.fiscal_years (
  year         integer PRIMARY KEY CHECK (year BETWEEN 2000 AND 2999),
  status       app.fiscal_year_status NOT NULL DEFAULT 'open',
  -- The ordinary assembly that approved the year's accounts (statutes, art. 8, 12): after the year ends.
  assembly_on  date CHECK (assembly_on > make_date(year, 12, 31)),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_by    uuid,
  closed_at    timestamptz,
  CHECK ((status = 'closed') = (assembly_on IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_by IS NOT NULL))
);

CREATE TABLE app.journal_entries (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_date       date NOT NULL,
  fiscal_year      integer NOT NULL GENERATED ALWAYS AS (extract(year FROM entry_date)::integer) STORED
                     REFERENCES app.fiscal_years (year),
  -- Set when posted, the next in its year (private.journal_entry_rules).
  number           integer CHECK (number > 0),
  -- The concept, as tesorería writes it: it may name whoever was paid or reimbursed.
  description      text NOT NULL CHECK (btrim(description) <> '' AND length(description) <= 500),
  -- Which form wrote it, or the database's own opening and closing entries.
  kind             app.entry_kind NOT NULL,
  status           app.entry_status NOT NULL DEFAULT 'draft',
  -- A reversing entry names the one it corrects, which it may do once (the unique constraint).
  reverses         uuid UNIQUE REFERENCES app.journal_entries (id),
  counterparty_id  uuid REFERENCES app.counterparties (id),
  project_id       uuid REFERENCES app.projects (id),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  posted_by        uuid,
  posted_at        timestamptz,
  UNIQUE (fiscal_year, number),
  CHECK ((status = 'posted') = (number IS NOT NULL)),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL)),
  CHECK ((status = 'posted') = (posted_by IS NOT NULL)),
  CHECK ((kind = 'reversal') = (reverses IS NOT NULL)),
  CHECK (reverses <> id)
);
COMMENT ON COLUMN app.journal_entries.description IS 'personal data';
CREATE INDEX journal_entries_date_idx ON app.journal_entries (entry_date);

-- Each line debits or credits one account, never both, by more than zero and less than a thousand million euros. A
-- draft's lines are replaced, never edited: delete and insert.
CREATE TABLE app.journal_lines (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  entry_id      uuid NOT NULL REFERENCES app.journal_entries (id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES app.ledger_accounts (id),
  debit_cents   bigint NOT NULL DEFAULT 0 CHECK (debit_cents BETWEEN 0 AND 99999999999),
  credit_cents  bigint NOT NULL DEFAULT 0 CHECK (credit_cents BETWEEN 0 AND 99999999999),
  project_id    uuid REFERENCES app.projects (id),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_cents > 0) <> (credit_cents > 0))
);
CREATE INDEX journal_lines_entry_idx ON app.journal_lines (entry_id);
CREATE INDEX journal_lines_account_idx ON app.journal_lines (account_id);

-- Rules ------------------------------------------------------------------------------------------------------------

-- A fiscal year opens right after the last one (the first may be any), so the books have no hole between years. A
-- closed year never changes. Closing (open to closed, with the assembly's date, by tesorería) needs every earlier
-- year closed, no drafts left, and the assembly after the year and not in the future; in the same step it posts the
-- closing entry (income and expenses to the year's result, dated 31 December), opens the next year if it isn't open
-- yet, and posts its opening entry with the balances carried forward (dated 1 January, numbered next in that year).
-- The first year has no opening entry: the association had no assets when it was founded (statutes, art. 29). Runs
-- as the caller, under RLS: only tesorería, which writes every table it touches, gets this far.
CREATE FUNCTION private.fiscal_year_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    result_account uuid;
    entry uuid;
    account uuid;
    balance bigint;
    total bigint := 0;
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF EXISTS (SELECT 1 FROM app.fiscal_years)
         AND NEW.year IS DISTINCT FROM (SELECT max(y.year) + 1 FROM app.fiscal_years y) THEN
        RAISE EXCEPTION 'a fiscal year opens right after the last one'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'fiscal_years_consecutive';
      END IF;
      RETURN NEW;
    END IF;

    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'fiscal year % is closed for good', OLD.year USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status = 'open' THEN
      RETURN NEW;
    END IF;

    -- Closing. The table's checks want the assembly's date, after the year; it can't be in the future either.
    IF NEW.assembly_on > current_date THEN
      RAISE EXCEPTION 'a year closes after the assembly that approved it has met'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'fiscal_years_assembly_on';
    END IF;
    IF EXISTS (SELECT 1 FROM app.fiscal_years y WHERE y.year < OLD.year AND y.status = 'open') THEN
      RAISE EXCEPTION 'the years before % close first', OLD.year
        USING ERRCODE = 'check_violation', CONSTRAINT = 'fiscal_years_in_order';
    END IF;
    IF EXISTS (SELECT 1 FROM app.journal_entries e WHERE e.fiscal_year = OLD.year AND e.status = 'draft') THEN
      RAISE EXCEPTION 'a year with drafts doesn''t close: post or delete them'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'fiscal_years_drafts';
    END IF;
    SELECT a.id INTO result_account FROM app.ledger_accounts a WHERE a.year_result;
    IF result_account IS NULL THEN
      RAISE EXCEPTION 'the chart has no account for the year''s result'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'fiscal_years_result_account';
    END IF;

    -- The closing entry: each income and expense account back to zero, the difference to the year's result.
    entry := NULL;
    FOR account, balance IN
      SELECT l.account_id, sum(l.debit_cents - l.credit_cents)
        FROM app.journal_lines l
        JOIN app.journal_entries e ON e.id = l.entry_id
        JOIN app.ledger_accounts a ON a.id = l.account_id
       WHERE e.fiscal_year = OLD.year AND e.status = 'posted' AND a.kind IN ('income', 'expense')
       GROUP BY l.account_id
      HAVING sum(l.debit_cents - l.credit_cents) <> 0
    LOOP
      IF entry IS NULL THEN
        INSERT INTO app.journal_entries (entry_date, description, kind)
        VALUES (make_date(OLD.year, 12, 31), 'Regularización del ejercicio ' || OLD.year, 'closing')
        RETURNING id INTO entry;
      END IF;
      INSERT INTO app.journal_lines (entry_id, account_id, debit_cents, credit_cents)
      VALUES (entry, account, greatest(-balance, 0), greatest(balance, 0));
      total := total + balance;
    END LOOP;
    IF entry IS NOT NULL THEN
      IF total <> 0 THEN
        INSERT INTO app.journal_lines (entry_id, account_id, debit_cents, credit_cents)
        VALUES (entry, result_account, greatest(total, 0), greatest(-total, 0));
      END IF;
      UPDATE app.journal_entries SET status = 'posted' WHERE id = entry;
    END IF;

    -- The next year, with what the balance sheet's accounts hold carried forward.
    IF NOT EXISTS (SELECT 1 FROM app.fiscal_years y WHERE y.year = OLD.year + 1) THEN
      INSERT INTO app.fiscal_years (year) VALUES (OLD.year + 1);
    END IF;
    entry := NULL;
    FOR account, balance IN
      SELECT l.account_id, sum(l.debit_cents - l.credit_cents)
        FROM app.journal_lines l
        JOIN app.journal_entries e ON e.id = l.entry_id
        JOIN app.ledger_accounts a ON a.id = l.account_id
       WHERE e.fiscal_year = OLD.year AND e.status = 'posted' AND a.kind IN ('asset', 'liability', 'equity')
       GROUP BY l.account_id
      HAVING sum(l.debit_cents - l.credit_cents) <> 0
    LOOP
      IF entry IS NULL THEN
        INSERT INTO app.journal_entries (entry_date, description, kind)
        VALUES (make_date(OLD.year + 1, 1, 1), 'Apertura del ejercicio ' || (OLD.year + 1), 'opening')
        RETURNING id INTO entry;
      END IF;
      INSERT INTO app.journal_lines (entry_id, account_id, debit_cents, credit_cents)
      VALUES (entry, account, greatest(balance, 0), greatest(-balance, 0));
    END LOOP;
    IF entry IS NOT NULL THEN
      UPDATE app.journal_entries SET status = 'posted' WHERE id = entry;
    END IF;

    NEW.closed_at := now();
    NEW.closed_by := private.current_user_id();
    RETURN NEW;
  END
  $$;

-- Nothing is written dated in a closed year: no entry made there, nor a draft moved there. What is there is posted
-- (a year with drafts doesn't close), and posted entries never change.
CREATE FUNCTION private.closed_years_refuse() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM app.fiscal_years y
                WHERE y.year = extract(year FROM NEW.entry_date)::integer AND y.status = 'closed') THEN
      RAISE EXCEPTION 'nothing is written dated in a closed year' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;

-- An entry is written as a draft, and changed or deleted only as one. Posting it (draft to posted) checks that it
-- balances, and a reversal that it mirrors the posted entry it reverses (each line's debit the other's credit), no
-- earlier than it; then gives it the next number in its year, with the year's row locked so two postings at once
-- queue rather than take the same number, and stamps who posted it and when. From then on it never changes.
CREATE FUNCTION private.journal_entry_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    entry_year integer;
    debits bigint;
    credits bigint;
    line_count integer;
    original app.journal_entries;
  BEGIN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'a posted entry is never deleted: reverse it' USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
      RAISE EXCEPTION 'a posted entry never changes: reverse it' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'an entry is written as a draft, then posted' USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.number := NULL;
    NEW.posted_by := NULL;
    NEW.posted_at := NULL;
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;

    SELECT coalesce(sum(l.debit_cents), 0), coalesce(sum(l.credit_cents), 0), count(*)
      INTO debits, credits, line_count
      FROM app.journal_lines l WHERE l.entry_id = NEW.id;
    -- Both sides more than zero follows: every line has one side more than zero.
    IF line_count < 2 OR debits <> credits THEN
      RAISE EXCEPTION 'a posted entry balances, with two lines or more'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entries_balanced';
    END IF;

    IF NEW.reverses IS NOT NULL THEN
      SELECT * INTO original FROM app.journal_entries e WHERE e.id = NEW.reverses;
      IF original.status IS DISTINCT FROM 'posted' OR original.kind IN ('reversal', 'opening', 'closing')
         OR NEW.entry_date < original.entry_date THEN
        RAISE EXCEPTION 'a reversal corrects a posted entry of a form, on its date or later'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entries_reversal';
      END IF;
      IF EXISTS (
        (SELECT l.account_id, l.project_id, l.debit_cents, l.credit_cents
           FROM app.journal_lines l WHERE l.entry_id = NEW.id
         EXCEPT ALL
         SELECT l.account_id, l.project_id, l.credit_cents, l.debit_cents
           FROM app.journal_lines l WHERE l.entry_id = original.id)
        UNION ALL
        (SELECT l.account_id, l.project_id, l.credit_cents, l.debit_cents
           FROM app.journal_lines l WHERE l.entry_id = original.id
         EXCEPT ALL
         SELECT l.account_id, l.project_id, l.debit_cents, l.credit_cents
           FROM app.journal_lines l WHERE l.entry_id = NEW.id)) THEN
        RAISE EXCEPTION 'a reversal mirrors the lines of the entry it reverses'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_entries_reversal';
      END IF;
    END IF;

    entry_year := extract(year FROM NEW.entry_date)::integer;
    PERFORM 1 FROM app.fiscal_years y WHERE y.year = entry_year FOR UPDATE;
    SELECT coalesce(max(e.number), 0) + 1 INTO NEW.number
      FROM app.journal_entries e WHERE e.fiscal_year = entry_year;
    NEW.posted_by := private.current_user_id();
    NEW.posted_at := now();
    RETURN NEW;
  END
  $$;

-- A posted entry's lines never change, even for the owner, and a line names an active account with no sub-accounts
-- (the chart's groups add up their sub-accounts, and hold no lines of their own). After the row, so the policies
-- refuse first whoever may not write lines at all, as private.private_rules does.
CREATE FUNCTION private.journal_line_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    entries uuid[] := '{}';
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      entries := entries || OLD.entry_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      entries := entries || NEW.entry_id;
    END IF;
    IF EXISTS (SELECT 1 FROM app.journal_entries e WHERE e.id = ANY (entries) AND e.status = 'posted') THEN
      RAISE EXCEPTION 'a posted entry''s lines never change: reverse it' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP <> 'DELETE'
       AND NOT EXISTS (SELECT 1 FROM app.ledger_accounts a
                        WHERE a.id = NEW.account_id AND a.active
                          AND NOT EXISTS (SELECT 1 FROM app.ledger_accounts c WHERE c.parent_code = a.code)) THEN
      RAISE EXCEPTION 'a line names an active account with no sub-accounts'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'journal_lines_account';
    END IF;
    RETURN NULL;
  END
  $$;

-- An account that already has lines gets no sub-accounts: its lines would sit in a group.
CREATE FUNCTION private.ledger_account_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM app.journal_lines l JOIN app.ledger_accounts p ON p.id = l.account_id
                WHERE p.code = NEW.parent_code) THEN
      RAISE EXCEPTION 'an account with lines gets no sub-accounts'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_accounts_parent';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER rules BEFORE INSERT OR UPDATE ON app.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION private.fiscal_year_rules();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER closed_year BEFORE INSERT OR UPDATE ON app.journal_entries
  FOR EACH ROW EXECUTE FUNCTION private.closed_years_refuse();
CREATE TRIGGER rules BEFORE INSERT OR UPDATE OR DELETE ON app.journal_entries
  FOR EACH ROW EXECUTE FUNCTION private.journal_entry_rules();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.journal_entries
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.journal_entries
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER rules AFTER INSERT OR UPDATE OR DELETE ON app.journal_lines
  FOR EACH ROW EXECUTE FUNCTION private.journal_line_rules();
CREATE TRIGGER stamp BEFORE INSERT ON app.journal_lines
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.journal_lines
  FOR EACH ROW EXECUTE FUNCTION private.audit();

CREATE TRIGGER rules BEFORE INSERT ON app.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION private.ledger_account_rules();

-- Grants and policies ------------------------------------------------------------------------------------------------

-- Tesorería writes, admins read, through the staff app; nobody else, the bot included. A year is opened by its
-- number and closed by its status and the assembly's date, never deleted. An entry's kind and the entry it reverses
-- are fixed once written; its number and who posted it are the database's. The opening and closing entries are made
-- only by closing a year (the trigger above, as tesorería): no one writes them by hand.
ALTER TABLE app.fiscal_years ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (year), UPDATE (status, assembly_on) ON app.fiscal_years TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.fiscal_years FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.fiscal_years FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_update ON app.fiscal_years FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));

ALTER TABLE app.journal_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (entry_date, description, kind, reverses, counterparty_id, project_id),
  UPDATE (entry_date, description, counterparty_id, project_id, status), DELETE
  ON app.journal_entries TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.journal_entries FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.journal_entries FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria'))
              AND (kind NOT IN ('opening', 'closing') OR pg_trigger_depth() > 0));
CREATE POLICY tesoreria_update ON app.journal_entries FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.journal_entries FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

ALTER TABLE app.journal_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (entry_id, account_id, debit_cents, credit_cents, project_id), DELETE
  ON app.journal_lines TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.journal_lines FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.journal_lines FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.journal_lines FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
