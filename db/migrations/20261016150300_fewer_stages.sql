-- migrate:up

-- Fewer stages (PLAN M5, step 3; Dani, 2026-10-16: "por clasificar and new seem similar", "contactado, en
-- conversación and bienvenida hecha feel very similar"):
-- - `to_triage` (Por clasificar) folds into `new` (Nuevo). It only kept existing members out of "Sin asignar"; the
--   day they arrived does that now: "Sin asignar" is someone new, with nobody on them, who arrived in the last 30 days.
--   Someone whose arrival nobody knows (the members "Por clasificar" were, among them) is never "Sin asignar", nor
--   counted as arrived yesterday, nor posted to the team group.
-- - `talking` (En conversación) folds into `contacting`, now "En contacto": whether they replied is on each contact
--   attempt, so a reply no longer moves anyone, and "Toca seguimiento" is someone in contact whose latest attempt
--   wasn't answered, more than `follow_up_days` ago.
-- People in a folded stage move with it. Their history keeps the old names, and gets one more line saying the stages
-- were simplified; the move itself bypasses the row triggers (a column type change), so nobody's stamps change.
--
-- An attempt counts on the day it happened (its "Fecha") if it says, else the day it was written, in Madrid.

CREATE TYPE app.stage_v2 AS ENUM (
  'new', 'contacting', 'welcomed', 'active', 'dormant', 'unresponsive', 'left', 'discarded'
);

INSERT INTO app.person_events (person_id, kind, data)
SELECT p.id, 'stage_changed',
       jsonb_build_object('from', p.stage, 'to', CASE p.stage WHEN 'to_triage' THEN 'new' ELSE 'contacting' END,
                          'stages_folded', true)
  FROM app.people p
 WHERE p.stage IN ('to_triage', 'talking') AND p.merged_into IS NULL AND p.anonymised_at IS NULL;

DROP VIEW app.people_attention;
DROP FUNCTION private.bot_candidates(text, text, text[], text[]);
DROP FUNCTION private.bot_people(text, text, text[], text[]);
DROP FUNCTION private.team_card(uuid);
DROP INDEX app.people_stage_idx;
ALTER TABLE app.people ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE app.people ALTER COLUMN stage TYPE app.stage_v2
  USING (CASE stage::text WHEN 'to_triage' THEN 'new' WHEN 'talking' THEN 'contacting' ELSE stage::text END)::app.stage_v2;
DROP TYPE app.stage;
ALTER TYPE app.stage_v2 RENAME TO stage;
ALTER TABLE app.people ALTER COLUMN stage SET DEFAULT 'new';
CREATE INDEX people_stage_idx ON app.people (stage) WHERE merged_into IS NULL;

CREATE VIEW app.people_attention WITH (security_invoker = true) AS
  SELECT p.id AS person_id,
         array_remove(ARRAY[
           CASE WHEN p.stage = 'new' AND p.owner_id IS NULL
                     AND p.arrived_on >= (now() AT TIME ZONE 'Europe/Madrid')::date - 30
                THEN 'unassigned' END,
           CASE WHEN p.next_action_due <= (now() AT TIME ZONE 'Europe/Madrid')::date THEN 'action_due' END,
           CASE WHEN p.stage IN ('new', 'contacting', 'welcomed') AND p.next_action IS NULL THEN 'no_next_step' END,
           CASE WHEN p.stage = 'contacting' AND latest.outcome IS DISTINCT FROM 'replied'
                     AND latest.on_day < (now() AT TIME ZONE 'Europe/Madrid')::date - s.follow_up_days
                THEN 'follow_up' END,
           CASE WHEN p.stage IN ('new', 'contacting', 'welcomed', 'active')
                     AND EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NOT NULL)
                     AND NOT EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = p.id AND c.left_on IS NULL)
                THEN 'left_community' END,
           CASE WHEN EXISTS (SELECT 1 FROM app.intake_records i
                              WHERE i.status = 'review' AND (p.id = ANY (i.candidates) OR i.person_id = p.id))
                THEN 'possible_duplicate' END
         ], NULL) AS reasons
    FROM app.people p
    CROSS JOIN app.settings s
    LEFT JOIN LATERAL (
      SELECT coalesce(e.happened_on, (e.created_at AT TIME ZONE 'Europe/Madrid')::date) AS on_day,
             e.data ->> 'outcome' AS outcome
        FROM app.person_events e
       WHERE e.person_id = p.id AND e.kind = 'contact_attempt'
       ORDER BY 1 DESC, e.created_at DESC
       LIMIT 1) latest ON true
   WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL;
GRANT SELECT ON app.people_attention TO pauseai_backoffice_app;

-- An attempt moves someone new into contact, a reply brings back someone who had stopped answering, and enough
-- unanswered attempts since the last reply, over enough days, make them "Sin respuesta" (as before).
CREATE OR REPLACE FUNCTION private.contact_attempt_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  DECLARE
    current app.stage;
    attempts integer;
    first_on date;
    settings app.settings;
    replied record;
  BEGIN
    SELECT p.stage INTO current FROM app.people p WHERE p.id = NEW.person_id;
    IF NEW.data ->> 'outcome' = 'replied' THEN
      IF current IN ('new', 'unresponsive') THEN
        UPDATE app.people p SET stage = 'contacting' WHERE p.id = NEW.person_id;
      END IF;
      RETURN NULL;
    END IF;
    IF current = 'new' THEN
      UPDATE app.people p SET stage = 'contacting' WHERE p.id = NEW.person_id;
      RETURN NULL;
    END IF;
    IF current = 'contacting' THEN
      SELECT s.* INTO settings FROM app.settings s;
      SELECT coalesce(r.happened_on, (r.created_at AT TIME ZONE 'Europe/Madrid')::date) AS on_day, r.created_at
        INTO replied
        FROM app.person_events r
       WHERE r.person_id = NEW.person_id AND r.kind = 'contact_attempt' AND r.data ->> 'outcome' = 'replied'
       ORDER BY 1 DESC, r.created_at DESC
       LIMIT 1;
      SELECT count(*), min(coalesce(e.happened_on, (e.created_at AT TIME ZONE 'Europe/Madrid')::date))
        INTO attempts, first_on
        FROM app.person_events e
       WHERE e.person_id = NEW.person_id AND e.kind = 'contact_attempt'
         AND (replied.on_day IS NULL
              OR (coalesce(e.happened_on, (e.created_at AT TIME ZONE 'Europe/Madrid')::date), e.created_at)
                 > (replied.on_day, replied.created_at));
      IF attempts >= settings.unresponsive_attempts
         AND first_on <= (now() AT TIME ZONE 'Europe/Madrid')::date - settings.unresponsive_days THEN
        UPDATE app.people p SET stage = 'unresponsive' WHERE p.id = NEW.person_id;
      END IF;
    END IF;
    RETURN NULL;
  END
  $$;

-- The bot's functions, as before but for the new stage type; its "unassigned" is the rule's.
CREATE FUNCTION private.bot_candidates(arrival_name text, province text, phones text[], emails text[])
  RETURNS TABLE (person_id uuid, name text, stage app.stage, owner_name text, exact boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    WITH matched AS (
      SELECT DISTINCT private.survivor(i.person_id) AS id, true AS exact
        FROM app.identities i
       WHERE (i.kind = 'phone' AND i.value = ANY (phones)) OR (i.kind = 'email' AND i.value = ANY (emails))
      UNION
      SELECT s.person_id, false FROM private.similar_people(arrival_name, province) s
    )
    SELECT p.id, coalesce(p.preferred_name, p.full_name), p.stage, st.display_name, bool_or(m.exact)
      FROM matched m
      JOIN app.people p ON p.id = m.id
      LEFT JOIN app.staff st ON st.user_id = p.owner_id
     GROUP BY p.id, st.display_name
     ORDER BY bool_or(m.exact) DESC, p.created_at
     LIMIT 5;
  END
  $$;

CREATE FUNCTION private.bot_people(scope text, query text DEFAULT NULL, phones text[] DEFAULT '{}',
                                   emails text[] DEFAULT '{}')
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
                               OR (i.kind = 'email' AND i.value = ANY (emails))))
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

-- The digest's counts: the unassigned by the rule, and who arrived yesterday by the day they arrived.
CREATE OR REPLACE FUNCTION private.bot_summary() RETURNS TABLE (unassigned integer, arrived_yesterday integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT (SELECT count(*)::int FROM app.people_attention a WHERE 'unassigned' = ANY (a.reasons)),
           (SELECT count(*)::int FROM app.people p
             WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL
               AND p.arrived_on = (now() AT TIME ZONE 'Europe/Madrid')::date - 1);
  END
  $$;

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

-- The team group hears of arrivals, not of members entered after the fact: someone added in the last 48 hours who
-- arrived in the last two days.
CREATE OR REPLACE FUNCTION private.team_unposted(chat bigint) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT p.id
      FROM app.people p
     WHERE p.created_at > now() - interval '48 hours' AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       AND p.arrived_on >= (now() AT TIME ZONE 'Europe/Madrid')::date - 2
       AND NOT EXISTS (SELECT 1 FROM private.telegram_posts t WHERE t.person_id = p.id AND t.chat_id = chat)
     ORDER BY p.created_at
     LIMIT 20
  $$;

REVOKE ALL ON FUNCTION private.bot_candidates(text, text, text[], text[]),
  private.bot_people(text, text, text[], text[]), private.team_card(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.bot_candidates(text, text, text[], text[]),
  private.bot_people(text, text, text[], text[]), private.team_card(uuid) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
