-- migrate:up

-- Passkeys (PLAN D22; ADR-0003 §2): an enrolled account's optional way in, the device checking who holds it
-- (fingerprint, face or PIN) in place of the password and the code. The table Better Auth's passkey plugin generates
-- for apps/api/src/auth/schema.ts (the API's schema test checks it), in `auth` with the others, for
-- pauseai_backoffice_auth alone (ADR-0002).

CREATE TABLE auth.passkeys (
  id uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
  name text,
  public_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  credential_id text NOT NULL,
  counter integer NOT NULL,
  device_type text NOT NULL,
  backed_up boolean NOT NULL,
  transports text,
  created_at timestamptz,
  aaguid text
);

CREATE INDEX passkeys_user_id_idx ON auth.passkeys (user_id);
CREATE INDEX passkeys_credential_id_idx ON auth.passkeys (credential_id);

-- What its owner called it ("Portátil"): personal data (data model spec, conventions). No audit trigger, as the other
-- tables in `auth`.
COMMENT ON COLUMN auth.passkeys.name IS 'personal data';

-- A passkey belongs only to an account with its second factor, which stays the way back in, and the API lets only a
-- signed-in (aal2) session add one. A passkey's sign-in makes an aal2 session, which aal2_needs_second_factor already
-- refuses an account without its factor. The owner's reset of a lost authenticator deletes the factor and the
-- passkeys, holding the account's row: an insert locks it too (SHARE, which waits for the reset's UPDATE), then finds
-- the factor gone and is refused. Runs as the caller (pauseai_backoffice_auth); no grant, no definer.
CREATE FUNCTION private.passkey_needs_second_factor() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    PERFORM 1 FROM auth.users u WHERE u.id = NEW.user_id AND u.two_factor_enabled FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a passkey needs its account''s second factor' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER passkey_needs_second_factor BEFORE INSERT OR UPDATE OF user_id ON auth.passkeys
  FOR EACH ROW EXECUTE FUNCTION private.passkey_needs_second_factor();

GRANT SELECT, INSERT, UPDATE, DELETE ON auth.passkeys TO pauseai_backoffice_auth;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
