-- migrate:up

-- The bot's search finds a phone by part of its digits (PLAN R82), as Personas does since R72: a stored phone with
-- them in it, however the number was written, so a foreign one without its country code ("857 756 3987") or the end
-- of one finds its person. Six digits at least, here too, so a short run of them lists nobody in particular. The bot
-- still shows only names, stages, owners and reasons, never the number (ADR-0004). A new argument changes the
-- function's signature, so it is made again, with the same grant.

DROP FUNCTION private.bot_people(text, text, text[], text[]);

CREATE FUNCTION private.bot_people(scope text, query text DEFAULT NULL, phones text[] DEFAULT '{}',
                                   emails text[] DEFAULT '{}', digits text DEFAULT NULL)
  RETURNS TABLE (person_id uuid, name text, stage app.stage, owner_name text, reasons text[], in_community boolean,
                 created_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT p.id, coalesce(p.preferred_name, p.full_name), p.stage, s.display_name, a.reasons,
           EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NULL),
           p.created_at
      FROM app.people p
      JOIN app.people_attention a ON a.person_id = p.id
      LEFT JOIN app.staff s ON s.user_id = p.owner_id
     WHERE CASE scope
             WHEN 'mine' THEN p.owner_id = private.current_user_id() AND cardinality(a.reasons) > 0
             WHEN 'unassigned' THEN 'unassigned' = ANY (a.reasons)
             WHEN 'person' THEN p.id::text = query
             WHEN 'search' THEN
               EXISTS (SELECT 1 FROM app.identities i
                        WHERE i.person_id = p.id
                          AND ((i.kind = 'phone' AND i.value = ANY (phones))
                               OR (i.kind = 'email' AND i.value = ANY (emails))
                               -- A stored phone is E.164, a `+` and its digits: one with these digits in it.
                               OR (i.kind = 'phone' AND digits ~ '^[0-9]{6,}$' AND strpos(i.value, digits) > 0)))
               OR (coalesce(btrim(query), '') <> ''
                   AND (p.name_folded LIKE '%' || private.fold_name(query) || '%'
                        OR extensions.similarity(p.name_folded, private.fold_name(query)) >= 0.35))
             ELSE false
           END
     ORDER BY CASE WHEN scope = 'search' AND coalesce(btrim(query), '') <> ''
                   THEN extensions.similarity(p.name_folded, private.fold_name(query)) END DESC NULLS LAST,
              p.arrived_on, p.created_at
     LIMIT 20;
  END
  $$;

REVOKE ALL ON FUNCTION private.bot_people(text, text, text[], text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bot_people(text, text, text[], text[], text) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
