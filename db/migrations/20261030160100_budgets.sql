-- migrate:up

-- A budget per year (accounting spec §6, step 2): what tesorería expects to come in and go out, by income or expense
-- account, a group of the chart (62, "Servicios exteriores") or one of its accounts; the staff app shows what came in
-- and went out against it, from posted entries. Set while the year is open: a closed year's budget never changes, as
-- nothing dated in it does.
--
-- The rules, each with a test (packages/db/tests/bank.spec.ts) and a mutation (scripts/mutations/bank.json):
-- - a line is of an income or expense account, once a year, for more than zero;
-- - no line of the same year sits above or below another in the chart, so each euro is budgeted once (the year's row
--   locked meanwhile, so two lines at once queue rather than both pass);
-- - nothing changes in a closed year.
CREATE TABLE app.budget_lines (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  fiscal_year   integer NOT NULL REFERENCES app.fiscal_years (year),
  account_id    uuid NOT NULL REFERENCES app.ledger_accounts (id),
  amount_cents  bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 99999999999),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, account_id)
);
CREATE INDEX budget_lines_account_idx ON app.budget_lines (account_id);

CREATE FUNCTION private.budget_line_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    years integer[] := '{}';
  BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      years := years || OLD.fiscal_year;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      years := years || NEW.fiscal_year;
    END IF;
    IF EXISTS (SELECT 1 FROM app.fiscal_years y WHERE y.year = ANY (years) AND y.status = 'closed') THEN
      RAISE EXCEPTION 'nothing is written dated in a closed year' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM app.ledger_accounts a
                    WHERE a.id = NEW.account_id AND a.kind IN ('income', 'expense')) THEN
      RAISE EXCEPTION 'a budget line is of an income or expense account'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'budget_lines_account';
    END IF;
    PERFORM 1 FROM app.fiscal_years y WHERE y.year = NEW.fiscal_year FOR UPDATE;
    IF EXISTS (
      WITH RECURSIVE above AS (
        SELECT a.code, a.parent_code FROM app.ledger_accounts a WHERE a.id = NEW.account_id
        UNION ALL
        SELECT p.code, p.parent_code FROM app.ledger_accounts p JOIN above ON p.code = above.parent_code
      ), below AS (
        SELECT a.code FROM app.ledger_accounts a WHERE a.id = NEW.account_id
        UNION ALL
        SELECT c.code FROM app.ledger_accounts c JOIN below ON c.parent_code = below.code
      )
      SELECT 1 FROM app.budget_lines b JOIN app.ledger_accounts a ON a.id = b.account_id
       WHERE b.fiscal_year = NEW.fiscal_year AND b.id <> NEW.id
         AND (a.code IN (SELECT above.code FROM above) OR a.code IN (SELECT below.code FROM below))) THEN
      RAISE EXCEPTION 'a budget line sits neither above nor below another of its year'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'budget_lines_nested';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER rules BEFORE INSERT OR UPDATE OR DELETE ON app.budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.budget_line_rules();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.budget_lines
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Tesorería sets the budget, admins read it, through the staff app; nobody else. A line's year and account are fixed
-- once written: another account is another line.
ALTER TABLE app.budget_lines ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (fiscal_year, account_id, amount_cents), UPDATE (amount_cents), DELETE
  ON app.budget_lines TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.budget_lines FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.budget_lines FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_update ON app.budget_lines FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.budget_lines FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
