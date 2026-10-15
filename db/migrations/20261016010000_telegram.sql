-- migrate:up

-- The Telegram bot (ADR-0004; data model spec, bot tables): which Telegram account is which staff member, the one-time
-- codes that link them, and the bot's own state. Links and codes are credentials: in `auth`, reached only by
-- pauseai_backoffice_auth, like Better Auth's tables. The bot's state is internal: in `private`, reached only by
-- pauseai_backoffice_app, with exactly what the bot does to each table.

-- A Telegram account linked to a staff member's account, from a session with the second factor. One each way: a
-- Telegram account stands for one staff member, and a staff member has one Telegram account.
CREATE TABLE auth.telegram_links (
  user_id           uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  telegram_user_id  bigint NOT NULL UNIQUE CHECK (telegram_user_id > 0),
  linked_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN auth.telegram_links.telegram_user_id IS 'personal data';

-- A one-time code for linking, made by "Conectar Telegram" in the staff app and sent back by `/start <code>`: kept only
-- as its SHA-256 (hex), for at most 10 minutes, used once.
CREATE TABLE auth.telegram_link_codes (
  code_hash   text NOT NULL PRIMARY KEY CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes'),
  CHECK (used_at IS NULL OR used_at <= expires_at)
);
CREATE INDEX telegram_link_codes_user_id_idx ON auth.telegram_link_codes (user_id);

-- Better Auth's role links and unlinks (a link is replaced, never edited), and marks a code used.
GRANT SELECT, INSERT, DELETE ON auth.telegram_links TO pauseai_backoffice_auth;
GRANT SELECT, INSERT, DELETE, UPDATE (used_at) ON auth.telegram_link_codes TO pauseai_backoffice_auth;

-- Each update Telegram delivered, so a redelivery is processed once. Kept a week (the dialog-cleanup job).
CREATE TABLE private.telegram_updates (
  update_id    bigint NOT NULL PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- A conversation in progress with a staff member (an /alta that still needs a phone, a /baja to confirm): what the
-- bot read so far, which may include contact details until the arrival is saved. Gone after an hour.
CREATE TABLE private.telegram_dialogs (
  telegram_user_id  bigint NOT NULL PRIMARY KEY,
  user_id           uuid NOT NULL,
  state             jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  expires_at        timestamptz NOT NULL
);
COMMENT ON COLUMN private.telegram_dialogs.state IS 'personal data';

-- The team group's message about each arrival (D11), so a claim can edit it to show who. `message_id` is empty while
-- the message is being sent: the row is the claim to send it, so two senders never post the same arrival twice.
CREATE TABLE private.telegram_posts (
  person_id   uuid NOT NULL REFERENCES app.people (id),
  chat_id     bigint NOT NULL,
  message_id  bigint,
  posted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, chat_id)
);

GRANT SELECT, INSERT, DELETE ON private.telegram_updates TO pauseai_backoffice_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.telegram_dialogs TO pauseai_backoffice_app;
GRANT SELECT, INSERT, DELETE, UPDATE (message_id) ON private.telegram_posts TO pauseai_backoffice_app;

-- What a staff member's digest and /mios count (onboarding spec, notifications): the unassigned queue, and the people
-- who arrived yesterday (Madrid's day). Through the bot or the staff app, for onboarding staff and admins.
CREATE FUNCTION private.bot_summary()
  RETURNS TABLE (unassigned integer, arrived_yesterday integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT (SELECT count(*)::int FROM app.people p
             WHERE p.stage = 'new' AND p.owner_id IS NULL AND p.merged_into IS NULL AND p.anonymised_at IS NULL),
           (SELECT count(*)::int FROM app.people p
             WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL
               AND (p.created_at AT TIME ZONE 'Europe/Madrid')::date
                   = (now() AT TIME ZONE 'Europe/Madrid')::date - 1);
  END
  $$;

-- The team group's card for an arrival (ADR-0004, notifications): what a post in the group shows, which is its name,
-- province, sources, stage and owner, never contact details. Without an actor: the bot posts arrivals from every
-- source, the hourly Airtable sync's included, which has no person behind it. So it answers only for someone the
-- group may be told about: who arrived in the last 48 hours, or who already has a post (whose claim edits it).
CREATE FUNCTION private.team_card(person uuid)
  RETURNS TABLE (person_id uuid, name text, province text, sources text[], stage app.stage, owner_name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT p.id, coalesce(p.preferred_name, p.full_name), p.province,
           ARRAY(SELECT s.source::text FROM app.person_sources s WHERE s.person_id = p.id ORDER BY s.first_seen_at),
           p.stage, st.display_name
      FROM app.people p
      LEFT JOIN app.staff st ON st.user_id = p.owner_id
     WHERE p.id = team_card.person AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       AND (p.created_at > now() - interval '48 hours'
            OR EXISTS (SELECT 1 FROM private.telegram_posts t WHERE t.person_id = p.id))
  $$;

-- Arrivals of the last 48 hours not yet posted to `chat`, oldest first: the team group's queue. Ids only.
CREATE FUNCTION private.team_unposted(chat bigint)
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT p.id
      FROM app.people p
     WHERE p.created_at > now() - interval '48 hours' AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM private.telegram_posts t WHERE t.person_id = p.id AND t.chat_id = chat)
     ORDER BY p.created_at
     LIMIT 20
  $$;

REVOKE ALL ON FUNCTION private.bot_summary(), private.team_card(uuid), private.team_unposted(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bot_summary(), private.team_card(uuid), private.team_unposted(bigint)
  TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
