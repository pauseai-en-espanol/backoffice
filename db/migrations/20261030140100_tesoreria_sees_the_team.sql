-- migrate:up

-- Tesorería is on the team (ADR-0006 decision 5): like every staff member it sees who is on it and with which roles,
-- which is how the staff app knows who is signed in (/api/session) and who posted an entry. Nothing else outside the
-- books opens to it: not people, outreach, the census's lists or the settings.
ALTER POLICY staff_read ON app.staff
  USING ((SELECT private.staff_can('admin', 'onboarding', 'outreach', 'tesoreria')));
ALTER POLICY staff_read ON app.staff_roles
  USING ((SELECT private.staff_can('admin', 'onboarding', 'outreach', 'tesoreria')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
