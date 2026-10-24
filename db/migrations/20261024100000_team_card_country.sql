-- migrate:up

-- The team group's post says where someone lives (PLAN R81): their province or region and, since R74, their country
-- ("Dónde vive: Baviera, Alemania"), where it said only "Provincia". The card returns the country's code as well, and
-- nothing else is added: no town, no place of origin, never contact details (ADR-0004, notifications). A function's
-- columns can't change in place, so it is made again, with the same window and the same grant.

DROP FUNCTION private.team_card(uuid);

CREATE FUNCTION private.team_card(person uuid)
  RETURNS TABLE (person_id uuid, name text, province text, country text, sources text[], stage app.stage,
                 owner_name text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT p.id, coalesce(p.preferred_name, p.full_name), p.province, p.country,
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

REVOKE ALL ON FUNCTION private.team_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.team_card(uuid) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
