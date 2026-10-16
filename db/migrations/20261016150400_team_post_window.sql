-- migrate:up
-- The team group hears of arrivals within a window admins set in Ajustes, a week by default (Dani, 2026-10-16: "maybe
-- make it configurable and by default a week?"). Someone who arrived before it, or on a day nobody knows, was entered
-- after the fact and isn't announced. Both ways a post goes out obey it: the sweep (the Airtable sync, CSV imports),
-- through team_unposted, and the instant post (the bot, Añadir), whose reserved row (message_id still empty) no longer
-- counts as a post already made in team_card. A post already sent keeps being updated, whatever the arrival day.
ALTER TABLE app.settings
  ADD COLUMN team_post_days integer NOT NULL DEFAULT 7
    CONSTRAINT settings_team_post_days_check CHECK (team_post_days BETWEEN 1 AND 60);

COMMENT ON COLUMN app.settings.team_post_days IS
  'Days back an arrival may be to be posted to the team group (ADR-0004, notifications)';
-- Admins change it like the other settings: the admin_update policy decides who, column grants what.
GRANT UPDATE (team_post_days) ON app.settings TO pauseai_backoffice_app;

CREATE OR REPLACE FUNCTION private.team_card(person uuid)
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
       AND ((p.created_at > now() - interval '48 hours'
             AND p.arrived_on >= (now() AT TIME ZONE 'Europe/Madrid')::date
                                  - (SELECT s.team_post_days FROM app.settings s))
            OR EXISTS (SELECT 1 FROM private.telegram_posts t
                        WHERE t.person_id = p.id AND t.message_id IS NOT NULL))
  $$;

CREATE OR REPLACE FUNCTION private.team_unposted(chat bigint) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT p.id
      FROM app.people p
     WHERE p.created_at > now() - interval '48 hours' AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       AND p.arrived_on >= (now() AT TIME ZONE 'Europe/Madrid')::date
                            - (SELECT s.team_post_days FROM app.settings s)
       AND NOT EXISTS (SELECT 1 FROM private.telegram_posts t WHERE t.person_id = p.id AND t.chat_id = chat)
     ORDER BY p.created_at
     LIMIT 20
  $$;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
