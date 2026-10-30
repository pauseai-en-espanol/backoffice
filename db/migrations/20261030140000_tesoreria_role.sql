-- migrate:up

-- Tesorería, the staff role that keeps the association's books (D20, ADR-0006 decision 5): it records, admins read.
-- Its own migration: a new enum value can't be used in the transaction that adds it, and the next ones' policies
-- name it.
ALTER TYPE app.staff_role ADD VALUE 'tesoreria';

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
