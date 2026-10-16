-- migrate:up

-- A Telegram link code outlived what should end it (security review, 2026-10-16): a password reset, the owner's
-- authenticator reset and deactivation removed the link but not the unused codes, so whoever held the session could
-- keep a fresh code and link the bot after the reset, at aal2, with no second factor. Now:
-- - a code belongs to the signed-in session that made it, and goes when that session ends (every one of those paths
--   ends the sessions);
-- - a link needs the account's second factor, in the database, as an aal2 session does (ADR-0004).

-- Codes last ten minutes and none says which session made it: none is kept.
DELETE FROM auth.telegram_link_codes;
ALTER TABLE auth.telegram_link_codes
  ADD COLUMN session_id uuid NOT NULL REFERENCES auth.sessions (id) ON DELETE CASCADE;
CREATE INDEX telegram_link_codes_session_id_idx ON auth.telegram_link_codes (session_id);

-- The session is the account's own, signed in with its second factor.
CREATE FUNCTION private.link_code_needs_session() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    PERFORM 1 FROM auth.sessions s
     WHERE s.id = NEW.session_id AND s.user_id = NEW.user_id AND s.aal = 2 AND s.expires_at > now()
       FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a link code needs its account''s signed-in session' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
REVOKE ALL ON FUNCTION private.link_code_needs_session() FROM PUBLIC;
CREATE TRIGGER needs_session BEFORE INSERT ON auth.telegram_link_codes
  FOR EACH ROW EXECUTE FUNCTION private.link_code_needs_session();

-- The account still has its second factor; locked, so the owner's reset can't remove it halfway through a link.
CREATE FUNCTION private.link_needs_second_factor() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    PERFORM 1 FROM auth.users u WHERE u.id = NEW.user_id AND u.two_factor_enabled FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a Telegram link needs its account''s second factor' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;
REVOKE ALL ON FUNCTION private.link_needs_second_factor() FROM PUBLIC;
CREATE TRIGGER needs_second_factor BEFORE INSERT ON auth.telegram_links
  FOR EACH ROW EXECUTE FUNCTION private.link_needs_second_factor();

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
