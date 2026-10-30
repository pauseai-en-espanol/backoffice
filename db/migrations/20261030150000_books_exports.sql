-- migrate:up

-- The books' CSV exports (ADR-0006 decision 9) are recorded as every export of personal data is: which report, its
-- range and filter, how many rows, by whom. Tesorería makes them too, so it may record its own kind, and only that;
-- reading the record stays the admins'.
ALTER TABLE app.exports DROP CONSTRAINT exports_kind_check;
ALTER TABLE app.exports ADD CONSTRAINT exports_kind_check
  CHECK (kind IN ('people_csv', 'person_json', 'contact_json', 'books_csv'));
CREATE POLICY tesoreria_insert ON app.exports FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('tesoreria')) AND kind = 'books_csv');

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
