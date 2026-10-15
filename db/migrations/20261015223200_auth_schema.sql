-- migrate:up

-- Better Auth's tables (ADR-0002, ADR-0003): accounts, password hashes, TOTP secrets and backup codes, sessions,
-- verification tokens and the rate limiter's counters. They live in a schema of their own, owned like everything else
-- by pauseai_backoffice_owner, and only pauseai_backoffice_auth is granted on them, so no query run as another role
-- can reach a credential. Grants keep them apart, not RLS.
--
-- The tables are the ones Better Auth 1.7 generates for apps/api/src/auth/schema.ts (as in aiontheballot, with the
-- schema added and one column per line); an API database test checks it finds nothing left to create or add.

CREATE SCHEMA auth;
COMMENT ON SCHEMA auth IS 'Better Auth''s tables: only pauseai_backoffice_auth reaches them (ADR-0002)';

CREATE TABLE auth.users (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL,
  image text,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  two_factor_enabled boolean
);

-- `aal`: 2 only for a session created by a TOTP or backup-code verification (Better Auth's database hook in
-- apps/api/src/auth/auth.ts writes it on every insert); the API sets app.aal from it. Every other session, such as the
-- one a password alone opens so that a new account can enrol, is 1 for life.
CREATE TABLE auth.sessions (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  aal integer NOT NULL
);
COMMENT ON COLUMN auth.sessions.aal IS
  '2 only for a session created by a TOTP or backup-code verification; the API sets app.aal from it';

CREATE TABLE auth.accounts (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE auth.verifications (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE auth.two_factors (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  secret text NOT NULL,
  backup_codes text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  verified boolean,
  failed_verification_count integer,
  locked_until timestamptz
);

CREATE TABLE auth.rate_limits (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

CREATE INDEX sessions_user_id_idx ON auth.sessions (user_id);
CREATE INDEX accounts_user_id_idx ON auth.accounts (user_id);
CREATE INDEX verifications_identifier_idx ON auth.verifications (identifier);
CREATE INDEX two_factors_secret_idx ON auth.two_factors (secret);
CREATE INDEX two_factors_user_id_idx ON auth.two_factors (user_id);

-- Personal data (data model spec, conventions). These tables have no audit trigger, so none of it is copied
-- elsewhere. Better Auth deletes an expired session when it next meets it; the daily session-cleanup job deletes the
-- rest (expired sessions and verifications, day-old rate-limit rows).
COMMENT ON COLUMN auth.users.name IS 'personal data';
COMMENT ON COLUMN auth.users.email IS 'personal data';
COMMENT ON COLUMN auth.users.image IS 'personal data';
COMMENT ON COLUMN auth.sessions.ip_address IS 'personal data';
COMMENT ON COLUMN auth.sessions.user_agent IS 'personal data';
COMMENT ON COLUMN auth.rate_limits.key IS 'personal data';

-- An aal2 session exists only for an account that has a second factor (as aiontheballot PLAN R156). The owner's reset
-- of a lost authenticator deletes the account's factor and its sessions in one transaction; a code checked a moment
-- before could otherwise still insert its session after the reset, an aal2 session for an account with no factor.
-- The insert locks the factor's row (KEY SHARE, as a foreign key would): it waits for a reset deleting it, then finds
-- it gone and is refused. Only existence is checked, not `verified`: enrolment's own code creates its aal2 session
-- before Better Auth marks the factor verified. Runs as the caller (pauseai_backoffice_auth); no grant, no definer.
CREATE FUNCTION private.session_needs_second_factor() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    PERFORM 1 FROM auth.two_factors f WHERE f.user_id = NEW.user_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'an aal2 session needs its account''s second factor' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER aal2_needs_second_factor BEFORE INSERT OR UPDATE OF aal ON auth.sessions
  FOR EACH ROW WHEN (NEW.aal = 2) EXECUTE FUNCTION private.session_needs_second_factor();

-- Closed by default: nothing for PUBLIC, and for Better Auth's role only what it reads and writes.
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO pauseai_backoffice_auth;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON auth.users, auth.sessions, auth.accounts, auth.verifications, auth.two_factors, auth.rate_limits
  TO pauseai_backoffice_auth;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
