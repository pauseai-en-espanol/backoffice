-- migrate:up

-- The contract step of migration organisation_notes (PLAN R50): each organisation's old notes field became its first
-- note, and nothing has written or read the column since. It goes.

ALTER TABLE app.organisations DROP COLUMN notes;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
