-- migrate:up

-- The association's books, part one (ADR-0006; accounting spec §1, §5): the chart of accounts, who money came from or
-- went to, and the projects it was given for. Tesorería writes them; admins read them, so the books never depend on
-- one person (decision 5); onboarding, outreach and the bot see nothing (no policy names private.bot_can).
--
-- The chart is data, never code (decision 3): seeded below from the small non-profits' plan (PYMESFL, ICAC resolution
-- of 26 March 2013), only the groups the association uses, for a gestoría or a treasurer to confirm before the first
-- year closes (the spec's status). Tesorería adds sub-accounts (one per bank account, `5720001`) and retires lines,
-- and deletes only one never used (the journal's foreign keys refuse the rest).
CREATE TYPE app.account_kind AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');

CREATE TABLE app.ledger_accounts (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  code         text NOT NULL UNIQUE CHECK (code ~ '^[0-9]{2,10}$'),
  name         text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
  kind         app.account_kind NOT NULL,
  -- A sub-account extends its parent's code and shares its kind (the foreign key holds both).
  parent_code  text,
  -- Where money actually is (the spec's "cuenta de tesorería"): a bank account, with the association's IBAN (not
  -- personal data), or a cash box. The forms offer these to take money from or put it in.
  treasury     boolean NOT NULL DEFAULT false,
  iban         text CHECK (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  -- The account closing a year carries its income and expenses to (129, "Excedente del ejercicio"): set by this
  -- seed, so the database never names an account number.
  year_result  boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, kind),
  FOREIGN KEY (parent_code, kind) REFERENCES app.ledger_accounts (code, kind),
  CHECK (parent_code IS NULL OR (length(code) > length(parent_code) AND starts_with(code, parent_code))),
  CHECK (NOT treasury OR kind = 'asset'),
  CHECK (iban IS NULL OR treasury),
  CHECK (NOT year_result OR kind = 'equity')
);
CREATE UNIQUE INDEX ledger_accounts_year_result_idx ON app.ledger_accounts (year_result) WHERE year_result;

INSERT INTO app.ledger_accounts (code, name, kind, parent_code, year_result) VALUES
  ('10', 'Fondo social', 'equity', NULL, false),
  ('101', 'Fondo social', 'equity', '10', false),
  ('12', 'Excedentes pendientes de aplicación', 'equity', NULL, false),
  ('120', 'Remanente', 'equity', '12', false),
  ('121', 'Excedentes negativos de ejercicios anteriores', 'equity', '12', false),
  ('129', 'Excedente del ejercicio', 'equity', '12', true),
  ('57', 'Tesorería', 'asset', NULL, false),
  ('570', 'Caja, euros', 'asset', '57', false),
  ('572', 'Bancos e instituciones de crédito c/c vista, euros', 'asset', '57', false),
  ('62', 'Servicios exteriores', 'expense', NULL, false),
  ('621', 'Arrendamientos y cánones', 'expense', '62', false),
  ('622', 'Reparaciones y conservación', 'expense', '62', false),
  ('623', 'Servicios de profesionales independientes', 'expense', '62', false),
  ('624', 'Transportes', 'expense', '62', false),
  ('625', 'Primas de seguros', 'expense', '62', false),
  ('626', 'Servicios bancarios y similares', 'expense', '62', false),
  ('627', 'Publicidad, propaganda y relaciones públicas', 'expense', '62', false),
  ('628', 'Suministros', 'expense', '62', false),
  ('629', 'Otros servicios', 'expense', '62', false),
  ('65', 'Ayudas monetarias de la entidad y otros gastos de gestión', 'expense', NULL, false),
  ('650', 'Ayudas monetarias', 'expense', '65', false),
  ('653', 'Compensación de gastos por prestaciones de colaboración', 'expense', '65', false),
  ('654', 'Reembolsos de gastos al órgano de gobierno', 'expense', '65', false),
  ('659', 'Otras pérdidas en gestión corriente', 'expense', '65', false),
  ('72', 'Ingresos propios de la entidad', 'income', NULL, false),
  ('720', 'Cuotas de asociados y afiliados', 'income', '72', false),
  ('723', 'Ingresos de patrocinadores y colaboraciones', 'income', '72', false),
  ('74', 'Subvenciones, donaciones y legados', 'income', NULL, false),
  ('740', 'Subvenciones, donaciones y legados a la actividad', 'income', '74', false),
  -- Donations told apart from grants by their account (D24): the years before can be read back for the modelo 182
  -- once the association is of public utility.
  ('7400001', 'Subvenciones', 'income', '740', false),
  ('7400002', 'Donaciones', 'income', '740', false);

-- Who money came from or went to (decision 6): the module's own record, never linked to app.people, so erasing a
-- person never reaches the books, which the law requires the association to keep (personal data spec §9a). A donor's
-- tax ID and province are what the modelo 182 asks (D24), both optional, as the donor gives them.
CREATE TYPE app.counterparty_kind AS ENUM ('person', 'organisation');

CREATE TABLE app.counterparties (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  kind        app.counterparty_kind NOT NULL,
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  -- Upper case, without spaces or dashes: a Spanish NIF or NIE, or a foreign funder's own.
  tax_id      text CHECK (tax_id ~ '^[0-9A-Z]{1,20}$'),
  -- A Spanish province by name, or a region abroad, as people's own (migration people_places).
  province    text CHECK (btrim(province) <> '' AND length(province) <= 100),
  iban        text CHECK (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN app.counterparties.name IS 'personal data';
COMMENT ON COLUMN app.counterparties.tax_id IS 'personal data';
COMMENT ON COLUMN app.counterparties.province IS 'personal data';
COMMENT ON COLUMN app.counterparties.iban IS 'personal data';

-- Money given for a purpose (Global's funding, a grant), so its use can be reported to whoever gave it.
CREATE TABLE app.projects (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  name         text NOT NULL UNIQUE CHECK (btrim(name) <> '' AND length(name) <= 120),
  funder_id    uuid REFERENCES app.counterparties (id),
  description  text CHECK (btrim(description) <> '' AND length(description) <= 2000),
  active       boolean NOT NULL DEFAULT true,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.counterparties
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.counterparties
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.projects
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.projects
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Tesorería writes, admins read, through the staff app; nobody else. An account's code, kind and parent, and the
-- account a year closes to, are fixed once written; that one is never deleted either, or no year could close.
ALTER TABLE app.ledger_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (code, name, kind, parent_code, treasury, iban), UPDATE (name, treasury, iban, active), DELETE
  ON app.ledger_accounts TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.ledger_accounts FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.ledger_accounts FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_update ON app.ledger_accounts FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.ledger_accounts FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')) AND NOT year_result);

ALTER TABLE app.counterparties ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (kind, name, tax_id, province, iban), UPDATE (kind, name, tax_id, province, iban), DELETE
  ON app.counterparties TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.counterparties FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.counterparties FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_update ON app.counterparties FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.counterparties FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT (name, funder_id, description, active), UPDATE (name, funder_id, description, active), DELETE
  ON app.projects TO pauseai_backoffice_app;
CREATE POLICY books_read ON app.projects FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'tesoreria')));
CREATE POLICY tesoreria_insert ON app.projects FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_update ON app.projects FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')))
  WITH CHECK ((SELECT private.staff_can('tesoreria')));
CREATE POLICY tesoreria_delete ON app.projects FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('tesoreria')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
