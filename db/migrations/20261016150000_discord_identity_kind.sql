-- migrate:up

-- A Discord username as a contact detail, next to phone and email (PLAN M5, step 3; Dani, 2026-10-16: Global's
-- Discord brings several arrivals a month). Its own migration: a new enum value can't be used in the transaction that
-- adds it, and the next migration's check uses it.
ALTER TYPE app.identity_kind ADD VALUE 'discord';

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
