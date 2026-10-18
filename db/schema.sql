--
-- PostgreSQL database dump
--

\restrict schema

-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: pauseai_backoffice_owner
--

CREATE SCHEMA app;


ALTER SCHEMA app OWNER TO pauseai_backoffice_owner;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: pauseai_backoffice_owner
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO pauseai_backoffice_owner;

--
-- Name: SCHEMA auth; Type: COMMENT; Schema: -; Owner: pauseai_backoffice_owner
--

COMMENT ON SCHEMA auth IS 'Better Auth''s tables: only pauseai_backoffice_auth reaches them (ADR-0002)';


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: pauseai_backoffice_owner
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO pauseai_backoffice_owner;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: pauseai_backoffice_owner
--

CREATE SCHEMA private;


ALTER SCHEMA private OWNER TO pauseai_backoffice_owner;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: availability; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.availability AS ENUM (
    'occasional',
    'under_2h',
    'from_2_to_5h',
    'over_5h'
);


ALTER TYPE app.availability OWNER TO pauseai_backoffice_owner;

--
-- Name: contact_channel; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.contact_channel AS ENUM (
    'whatsapp',
    'phone',
    'video',
    'email',
    'telegram',
    'in_person',
    'other'
);


ALTER TYPE app.contact_channel OWNER TO pauseai_backoffice_owner;

--
-- Name: contact_event_kind; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.contact_event_kind AS ENUM (
    'created',
    'imported',
    'note',
    'stage_changed',
    'owner_changed',
    'status_changed',
    'sent',
    'reviewed',
    'shared'
);


ALTER TYPE app.contact_event_kind OWNER TO pauseai_backoffice_owner;

--
-- Name: contact_outcome; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.contact_outcome AS ENUM (
    'no_answer',
    'replied',
    'left_message',
    'wrong_number',
    'declined'
);


ALTER TYPE app.contact_outcome OWNER TO pauseai_backoffice_owner;

--
-- Name: event_kind; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.event_kind AS ENUM (
    'created',
    'note',
    'contact_attempt',
    'stage_changed',
    'owner_changed',
    'next_action_set',
    'joined',
    'left',
    'reported',
    'imported',
    'merged',
    'profile_updated',
    'form_submitted'
);


ALTER TYPE app.event_kind OWNER TO pauseai_backoffice_owner;

--
-- Name: identity_kind; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.identity_kind AS ENUM (
    'email',
    'phone',
    'airtable',
    'discord'
);


ALTER TYPE app.identity_kind OWNER TO pauseai_backoffice_owner;

--
-- Name: intake_status; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.intake_status AS ENUM (
    'pending',
    'attached',
    'created',
    'review',
    'conflict',
    'discarded'
);


ALTER TYPE app.intake_status OWNER TO pauseai_backoffice_owner;

--
-- Name: message_purpose; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.message_purpose AS ENUM (
    'welcome',
    'census_link'
);


ALTER TYPE app.message_purpose OWNER TO pauseai_backoffice_owner;

--
-- Name: organisation_kind; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.organisation_kind AS ENUM (
    'party',
    'union',
    'ngo',
    'university',
    'media',
    'company',
    'public_body',
    'association',
    'other'
);


ALTER TYPE app.organisation_kind OWNER TO pauseai_backoffice_owner;

--
-- Name: relationship_stage; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.relationship_stage AS ENUM (
    'identified',
    'qualified',
    'contacted',
    'engaged',
    'ally',
    'declined',
    'dormant'
);


ALTER TYPE app.relationship_stage OWNER TO pauseai_backoffice_owner;

--
-- Name: source_kind; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.source_kind AS ENUM (
    'airtable',
    'telegram',
    'census',
    'manual',
    'csv'
);


ALTER TYPE app.source_kind OWNER TO pauseai_backoffice_owner;

--
-- Name: staff_role; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.staff_role AS ENUM (
    'admin',
    'onboarding',
    'outreach'
);


ALTER TYPE app.staff_role OWNER TO pauseai_backoffice_owner;

--
-- Name: stage; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.stage AS ENUM (
    'new',
    'contacting',
    'welcomed',
    'active',
    'dormant',
    'unresponsive',
    'left',
    'discarded'
);


ALTER TYPE app.stage OWNER TO pauseai_backoffice_owner;

--
-- Name: target_status; Type: TYPE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TYPE app.target_status AS ENUM (
    'pending',
    'ready',
    'sent',
    'replied',
    'meeting',
    'declined',
    'bounced',
    'no_response',
    'skip'
);


ALTER TYPE app.target_status OWNER TO pauseai_backoffice_owner;

--
-- Name: accept_invitation(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.accept_invitation(token_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    actor uuid := private.current_user_id();
    invitation app.invitations;
    account_name text;
  BEGIN
    IF actor IS NULL OR accept_invitation.token_hash IS NULL
       OR private.current_channel() IS DISTINCT FROM 'web' THEN
      RETURN false;
    END IF;
    SELECT i.* INTO invitation
      FROM app.invitations i
     WHERE i.token_hash = accept_invitation.token_hash
       AND i.accepted_at IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > now()
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = i.created_by AND s.active AND r.role = 'admin')
       FOR UPDATE OF i;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    SELECT btrim(u.name) INTO account_name
      FROM auth.users u
     WHERE u.id = actor AND u.email_verified AND lower(u.email) = invitation.email;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    INSERT INTO app.staff AS s (user_id, display_name, invited_by)
    VALUES (actor, left(account_name, 200), invitation.created_by)
    ON CONFLICT (user_id) DO UPDATE SET active = true WHERE NOT s.active;
    -- Holding a role already is no reason to refuse: the invitation is still accepted, once.
    INSERT INTO app.staff_roles (user_id, role)
    SELECT actor, r.role FROM unnest(invitation.roles) AS r(role)
    ON CONFLICT DO NOTHING;
    UPDATE app.invitations i SET accepted_at = now(), accepted_by = actor WHERE i.id = invitation.id;
    RETURN true;
  END
  $$;


ALTER FUNCTION private.accept_invitation(token_hash text) OWNER TO pauseai_backoffice_owner;

--
-- Name: airtable_link(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.airtable_link() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT s.link_ciphertext FROM app.airtable_sync s WHERE s.enabled
  $$;


ALTER FUNCTION private.airtable_link() OWNER TO pauseai_backoffice_owner;

--
-- Name: airtable_link_set(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.airtable_link_set() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.link_ciphertext IS NOT DISTINCT FROM OLD.link_ciphertext THEN
      NEW.link_set_by := OLD.link_set_by;
      NEW.link_set_at := OLD.link_set_at;
      RETURN NEW;
    END IF;
    IF NEW.link_ciphertext IS NULL THEN
      NEW.link_set_by := NULL;
      NEW.link_set_at := NULL;
      NEW.enabled := false;
    ELSE
      NEW.link_set_by := private.current_user_id();
      NEW.link_set_at := now();
    END IF;
    IF TG_OP = 'UPDATE' THEN
      NEW.last_run_at := NULL;
      NEW.last_run_failure := NULL;
      NEW.last_run_counts := NULL;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.airtable_link_set() OWNER TO pauseai_backoffice_owner;

--
-- Name: airtable_ran(text, jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.airtable_ran(failure text, counts jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF (failure IS NULL) = (counts IS NULL) THEN
      RAISE EXCEPTION 'a run either failed or counted' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    UPDATE app.airtable_sync s
       SET last_run_at = now(), last_run_failure = airtable_ran.failure, last_run_counts = airtable_ran.counts
     WHERE s.id;
  END
  $$;


ALTER FUNCTION private.airtable_ran(failure text, counts jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: anonymise_contact(uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.anonymise_contact(contact uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    subject app.contacts;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT c.* INTO subject FROM app.contacts c WHERE c.id = contact FOR UPDATE;
    IF NOT FOUND OR subject.anonymised_at IS NOT NULL THEN
      RETURN false;
    END IF;
    UPDATE app.campaign_targets t SET notes = NULL, next_action = NULL, next_action_due = NULL
     WHERE t.contact_id = contact;
    UPDATE app.contacts c
       SET person_name = NULL, greeting_name = NULL, treatment = 'neutral', email = NULL, emails_extra = '{}',
           phone = NULL, notes = NULL, role = NULL, website = NULL, reason = NULL, sources = '{}', tags = '{}',
           external_ref = NULL, needs_review = true, hold = true, hold_reason = NULL, owner_id = NULL,
           anonymised_at = now()
     WHERE c.id = contact;
    -- Last, so the events the update above just wrote are redacted too.
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e SET body = NULL WHERE e.contact_id = contact;
    PERFORM set_config('app.redact', '', true);
    RETURN true;
  END
  $$;


ALTER FUNCTION private.anonymise_contact(contact uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: anonymise_person(uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.anonymise_person(person uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    subject app.people;
    chain uuid[];
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT p.* INTO subject FROM app.people p WHERE p.id = private.survivor(anonymise_person.person) FOR UPDATE;
    IF NOT FOUND OR subject.anonymised_at IS NOT NULL THEN
      RETURN false;
    END IF;
    -- The person and every duplicate merged into them, at any depth.
    WITH RECURSIVE merged (id) AS (
      SELECT subject.id
      UNION
      SELECT p.id FROM app.people p JOIN merged m ON p.merged_into = m.id)
    SELECT array_agg(m.id) INTO chain FROM merged m;
    PERFORM 1 FROM app.people p WHERE p.id = ANY (chain) FOR UPDATE;

    UPDATE app.community_presence c SET chat = NULL WHERE c.person_id = ANY (chain);
    DELETE FROM app.identities i WHERE i.person_id = ANY (chain);
    DELETE FROM app.person_options o WHERE o.person_id = ANY (chain);
    DELETE FROM app.census_links l WHERE l.person_id = ANY (chain);
    -- The account stays (it is someone's sign-in), but no longer names who they were.
    UPDATE app.staff s SET person_id = NULL WHERE s.person_id = ANY (chain);
    -- Their own records forget the payload, and keep only a hash of their external id (above).
    UPDATE app.intake_records r
       SET payload = '{}', conflicts = '{}', candidates = '{}',
           external_id = CASE WHEN r.external_id LIKE 'erased:%' THEN r.external_id
                              ELSE private.erased_ref(r.source, r.external_id) END
     WHERE r.person_id = ANY (chain);
    -- Someone else's arrival that only named them as a possible duplicate just stops naming them.
    UPDATE app.intake_records r
       SET candidates = ARRAY(SELECT c FROM unnest(r.candidates) AS c WHERE c <> ALL (chain))
     WHERE r.candidates && chain AND (r.person_id IS NULL OR NOT (r.person_id = ANY (chain)));
    UPDATE app.people p
       SET full_name = 'Persona anonimizada', preferred_name = NULL, province = NULL, town = NULL, languages = '{}',
           pronouns = NULL, availability = NULL, how_heard = NULL, next_action = NULL, next_action_due = NULL,
           skills_other = NULL, interests_other = NULL, summary = NULL, owner_id = NULL, anonymised_at = now()
     WHERE p.id = ANY (chain) AND p.anonymised_at IS NULL;
    -- Last, so the events the update above just wrote are redacted too.
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.person_events e SET body = NULL, data = '{}' WHERE e.person_id = ANY (chain);
    PERFORM set_config('app.redact', '', true);
    RETURN true;
  END
  $$;


ALTER FUNCTION private.anonymise_person(person uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: arrival_channel(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.arrival_channel(word text) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    SELECT c.id FROM app.arrival_channels c
     WHERE c.active AND coalesce(btrim(word), '') <> ''
       AND (c.id::text = lower(btrim(word)) OR c.key = lower(btrim(word))
            OR private.fold_name(c.label) = private.fold_name(word))
     ORDER BY (c.key = lower(btrim(word))) DESC NULLS LAST, c.position
     LIMIT 1
  $$;


ALTER FUNCTION private.arrival_channel(word text) OWNER TO pauseai_backoffice_owner;

--
-- Name: arrival_rules(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.arrival_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.arrived_on > (now() AT TIME ZONE 'Europe/Madrid')::date THEN
      RAISE EXCEPTION 'nobody arrives in the future' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.arrival_rules() OWNER TO pauseai_backoffice_owner;

--
-- Name: attempt_template(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.attempt_template() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
  BEGIN
    IF NOT (NEW.data ? 'templateId' OR NEW.data ? 'templateVersion') THEN
      RETURN NEW;
    END IF;
    -- One test at a time: the version is cast only once it is known to be a whole number.
    IF jsonb_typeof(NEW.data -> 'templateId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(NEW.data -> 'templateVersion') IS DISTINCT FROM 'number'
       OR (NEW.data ->> 'templateVersion') !~ '^[1-9][0-9]{0,8}$' THEN
      RAISE EXCEPTION 'A message that went out names a template and a version it has had'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.message_templates m
                    WHERE m.id::text = NEW.data ->> 'templateId'
                      AND m.version >= (NEW.data ->> 'templateVersion')::integer) THEN
      RAISE EXCEPTION 'A message that went out names a template and a version it has had'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $_$;


ALTER FUNCTION private.attempt_template() OWNER TO pauseai_backoffice_owner;

--
-- Name: audit(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    before jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    after jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    subject jsonb := coalesce(after, before);
    hidden text[];
    key_columns text[];
    changed text[];
    diff jsonb;
  BEGIN
    SELECT coalesce(array_agg(a.attname::text), '{}') INTO hidden
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_description d
        ON d.objoid = a.attrelid AND d.objsubid = a.attnum AND d.classoid = 'pg_catalog.pg_class'::pg_catalog.regclass
     WHERE a.attrelid = TG_RELID AND d.description = 'personal data';

    SELECT array_agg(a.attname::text ORDER BY k.ord) INTO key_columns
      FROM pg_catalog.pg_index i
     CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY k(attnum, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
     WHERE i.indrelid = TG_RELID AND i.indisprimary;
    IF key_columns IS NULL THEN
      RAISE EXCEPTION 'private.audit on %.%: the table needs a primary key', TG_TABLE_SCHEMA, TG_TABLE_NAME;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      SELECT coalesce(array_agg(n.key ORDER BY n.key), '{}') INTO changed
        FROM jsonb_each(after) n
       WHERE n.value IS DISTINCT FROM before -> n.key;
      IF cardinality(changed) = 0 THEN
        RETURN NULL;
      END IF;
      diff := jsonb_build_object(
        'old', (SELECT coalesce(jsonb_object_agg(o.key, o.value), '{}') FROM jsonb_each(before) o
                 WHERE o.key = ANY (changed) AND NOT o.key = ANY (hidden)),
        'new', (SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}') FROM jsonb_each(after) n
                 WHERE n.key = ANY (changed) AND NOT n.key = ANY (hidden)));
      IF changed && hidden THEN
        diff := diff || jsonb_build_object('personal',
          (SELECT to_jsonb(array_agg(c ORDER BY c)) FROM unnest(changed) c WHERE c = ANY (hidden)));
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      diff := jsonb_build_object('new', after - hidden);
    ELSE
      diff := jsonb_build_object('old', before - hidden);
    END IF;

    INSERT INTO app.audit_log (actor_id, channel, action, table_name, row_id, diff)
    VALUES (
      private.current_user_id(),
      private.current_channel(),
      lower(TG_OP),
      TG_TABLE_NAME,
      CASE WHEN cardinality(key_columns) = 1 THEN subject ->> key_columns[1]
           ELSE (SELECT jsonb_object_agg(c, subject -> c) FROM unnest(key_columns) c)::text END,
      diff);
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.audit() OWNER TO pauseai_backoffice_owner;

--
-- Name: bot_can(app.staff_role[]); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    SELECT private.current_channel() IS NOT DISTINCT FROM 'bot'
       AND private.current_aal() = 2
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = private.current_user_id() AND s.active AND r.role = ANY (roles))
  $$;


ALTER FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) OWNER TO pauseai_backoffice_owner;

--
-- Name: bot_candidates(text, text, text[], text[]); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.bot_candidates(arrival_name text, province text, phones text[], emails text[]) RETURNS TABLE(person_id uuid, name text, stage app.stage, owner_name text, exact boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION private.bot_candidates(arrival_name text, province text, phones text[], emails text[]) OWNER TO pauseai_backoffice_owner;

--
-- Name: bot_people(text, text, text[], text[]); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.bot_people(scope text, query text DEFAULT NULL::text, phones text[] DEFAULT '{}'::text[], emails text[] DEFAULT '{}'::text[]) RETURNS TABLE(person_id uuid, name text, stage app.stage, owner_name text, reasons text[], in_community boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION private.bot_people(scope text, query text, phones text[], emails text[]) OWNER TO pauseai_backoffice_owner;

--
-- Name: bot_summary(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.bot_summary() RETURNS TABLE(unassigned integer, arrived_yesterday integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION private.bot_summary() OWNER TO pauseai_backoffice_owner;

--
-- Name: census_apply(uuid, jsonb, text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.census_apply(person uuid, answer jsonb, link text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    identity record;
    answered timestamptz := coalesce((answer ->> 'answered_at')::timestamptz, now());
  BEGIN
    UPDATE app.people p
       SET full_name = left(btrim(answer ->> 'name'), 200),
           preferred_name = nullif(left(btrim(answer ->> 'preferred_name'), 100), ''),
           province = nullif(left(btrim(answer ->> 'province'), 100), ''),
           town = nullif(left(btrim(answer ->> 'town'), 100), ''),
           languages = coalesce(ARRAY(SELECT left(btrim(l), 50)
                                        FROM jsonb_array_elements_text(coalesce(answer -> 'languages', '[]')) l
                                       WHERE btrim(l) <> '' LIMIT 20), '{}'),
           availability = (answer ->> 'availability')::app.availability,
           how_heard = nullif(left(btrim(answer ->> 'how_heard'), 500), ''),
           pronouns = nullif(left(btrim(answer ->> 'pronouns'), 50), ''),
           skills_other = nullif(left(btrim(answer ->> 'skills_other'), 300), ''),
           interests_other = nullif(left(btrim(answer ->> 'interests_other'), 300), ''),
           profile_completed_at = now()
     WHERE p.id = person;
    DELETE FROM app.person_options o WHERE o.person_id = person;
    INSERT INTO app.person_options (person_id, option_id)
    SELECT person, o.id FROM app.census_options o
     WHERE o.active AND o.id::text IN (SELECT jsonb_array_elements_text(coalesce(answer -> 'options', '[]')));
    FOR identity IN
      SELECT 'email'::app.identity_kind AS kind, answer ->> 'email' AS value WHERE coalesce(answer ->> 'email', '') <> ''
      UNION ALL
      SELECT 'phone', answer ->> 'phone' WHERE coalesce(answer ->> 'phone', '') <> ''
    LOOP
      INSERT INTO app.identities (person_id, kind, value, verified, source)
      VALUES (person, identity.kind, identity.value, false, 'census')
      ON CONFLICT (kind, value) DO NOTHING;
    END LOOP;
    INSERT INTO app.person_sources (person_id, source) VALUES (person, 'census') ON CONFLICT DO NOTHING;
    INSERT INTO app.consents (person_id, kind, granted, wording_version, source, given_at)
    SELECT person, k.kind, coalesce((answer ->> ('consent_' || k.kind))::boolean, false), answer ->> 'wording_version',
           'census', answered
      FROM unnest(ARRAY['email', 'whatsapp', 'privacy']) AS k(kind);
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (person, 'form_submitted', jsonb_build_object('link', link, 'answeredAt', answered));
  END
  $$;


ALTER FUNCTION private.census_apply(person uuid, answer jsonb, link text) OWNER TO pauseai_backoffice_owner;

--
-- Name: census_form(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.census_form(token_hash text DEFAULT NULL::text) RETURNS TABLE(options jsonb, greeting text, link text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'label', o.label)
                                      ORDER BY o.kind, o.position, o.label), '[]')
              FROM app.census_options o WHERE o.active),
           (SELECT coalesce(p.preferred_name, split_part(p.full_name, ' ', 1))
              FROM private.census_link_person(census_form.token_hash) k JOIN app.people p ON p.id = k.person_id),
           CASE WHEN census_form.token_hash IS NULL THEN 'generic'
                WHEN EXISTS (SELECT 1 FROM private.census_link_person(census_form.token_hash)) THEN 'personal'
                ELSE 'invalid' END
  $$;


ALTER FUNCTION private.census_form(token_hash text) OWNER TO pauseai_backoffice_owner;

--
-- Name: census_link_person(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.census_link_person(token_hash text) RETURNS TABLE(link_id uuid, person_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    SELECT l.id, private.survivor(l.person_id)
      FROM app.census_links l
     WHERE l.token_hash = census_link_person.token_hash AND l.expires_at > now()
       AND NOT EXISTS (SELECT 1 FROM app.census_links n
                        WHERE n.person_id = l.person_id AND (n.created_at, n.id) > (l.created_at, l.id))
       AND EXISTS (SELECT 1 FROM app.people p
                    WHERE p.id = private.survivor(l.person_id) AND p.anonymised_at IS NULL)
  $$;


ALTER FUNCTION private.census_link_person(token_hash text) OWNER TO pauseai_backoffice_owner;

--
-- Name: census_link_sent(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.census_link_sent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF (to_jsonb(NEW) - ARRAY['sent_at', 'sent_by', 'used_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['sent_at', 'sent_by', 'used_at']) THEN
      RAISE EXCEPTION 'a census link changes only when it is sent or used' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
      IF OLD.sent_at IS NOT NULL THEN
        RAISE EXCEPTION 'census link % was sent already', OLD.id USING ERRCODE = 'restrict_violation';
      END IF;
      NEW.sent_at := now();
      NEW.sent_by := private.current_user_id();
    ELSE
      NEW.sent_by := OLD.sent_by;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.census_link_sent() OWNER TO pauseai_backoffice_owner;

--
-- Name: census_link_template(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.census_link_template() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.template_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM app.message_templates m
                        WHERE m.id = NEW.template_id AND m.purpose = 'census_link'
                          AND m.version >= NEW.template_version) THEN
      RAISE EXCEPTION 'A census link names a census link message and a version it has had'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.census_link_template() OWNER TO pauseai_backoffice_owner;

--
-- Name: check_census(jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.check_census(answer jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
  DECLARE
    extra text;
  BEGIN
    IF jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'a census answer is an object' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(k, ', ') INTO extra FROM jsonb_object_keys(answer) k
     WHERE k NOT IN ('name', 'preferred_name', 'email', 'phone', 'province', 'town', 'languages', 'options',
                     'skills_other', 'interests_other', 'availability', 'how_heard', 'pronouns', 'consent_email',
                     'consent_whatsapp', 'consent_privacy', 'age_ok', 'wording_version');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'a census answer takes no %', extra USING ERRCODE = 'invalid_parameter_value';
    END IF;
    -- Under 14, consent must come from a parent or guardian (LOPDGDD art. 7): the form refuses them before this.
    IF (answer ->> 'age_ok') IS DISTINCT FROM 'true' OR (answer ->> 'consent_privacy') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'the census needs the age confirmed and the privacy notice accepted'
        USING ERRCODE = 'check_violation';
    END IF;
    IF coalesce(btrim(answer ->> 'name'), '') = '' OR answer ->> 'wording_version' IS NULL THEN
      RAISE EXCEPTION 'the census needs a name and the wording version' USING ERRCODE = 'check_violation';
    END IF;
  END
  $$;


ALTER FUNCTION private.check_census(answer jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: check_payload(jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.check_payload(payload jsonb) RETURNS void
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
  DECLARE
    extra text;
  BEGIN
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'an intake payload is an object' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT string_agg(k, ', ') INTO extra FROM jsonb_object_keys(payload) k
     WHERE k NOT IN ('name', 'preferred_name', 'emails', 'phones', 'discords', 'airtable_id', 'province', 'town',
                     'languages', 'how_heard', 'chat', 'note', 'stage', 'joined_on', 'left_on', 'arrived_on',
                     'arrival');
    IF extra IS NOT NULL THEN
      RAISE EXCEPTION 'an intake payload takes no %', extra USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(coalesce(payload -> 'emails', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'phones', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'discords', '[]')) <> 'array'
       OR jsonb_typeof(coalesce(payload -> 'languages', '[]')) <> 'array' THEN
      RAISE EXCEPTION 'emails, phones, discords and languages are arrays' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF payload ? 'arrived_on' AND jsonb_typeof(payload -> 'arrived_on') <> 'null'
       AND (jsonb_typeof(payload -> 'arrived_on') <> 'string' OR (payload ->> 'arrived_on') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'arrived_on is a date, YYYY-MM-DD, or null' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF payload ? 'joined_on' AND jsonb_typeof(payload -> 'joined_on') <> 'null'
       AND (jsonb_typeof(payload -> 'joined_on') <> 'string' OR (payload ->> 'joined_on') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'joined_on is a date, YYYY-MM-DD, or null' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF payload ? 'left_on'
       AND (jsonb_typeof(payload -> 'left_on') <> 'string' OR (payload ->> 'left_on') !~ '^\d{4}-\d{2}-\d{2}$') THEN
      RAISE EXCEPTION 'left_on is a date, YYYY-MM-DD' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF jsonb_typeof(payload -> 'joined_on') = 'string' AND payload ? 'left_on'
       AND (payload ->> 'left_on') COLLATE "C" < (payload ->> 'joined_on') COLLATE "C" THEN
      RAISE EXCEPTION 'nobody leaves before joining' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END
  $_$;


ALTER FUNCTION private.check_payload(payload jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: claim_person(uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.claim_person(person uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    UPDATE app.people p SET owner_id = private.current_user_id()
     WHERE p.id = person AND p.owner_id IS NULL AND p.merged_into IS NULL AND p.anonymised_at IS NULL
       AND p.stage NOT IN ('left', 'discarded');
    RETURN FOUND;
  END
  $$;


ALTER FUNCTION private.claim_person(person uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: contact_attempt_rules(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.contact_attempt_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
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


ALTER FUNCTION private.contact_attempt_rules() OWNER TO pauseai_backoffice_owner;

--
-- Name: contact_timeline(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.contact_timeline() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, CASE WHEN NEW.external_ref IS NULL THEN 'created'::app.contact_event_kind ELSE 'imported' END,
              jsonb_build_object('stage', NEW.stage));
      RETURN NULL;
    END IF;
    IF OLD.private_to IS NOT NULL AND NEW.private_to IS NULL THEN
      INSERT INTO app.contact_events (contact_id, kind) VALUES (NEW.id, 'shared');
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, 'stage_changed', jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, 'owner_changed', jsonb_build_object('from', OLD.owner_id, 'to', NEW.owner_id));
    END IF;
    IF OLD.needs_review AND NOT NEW.needs_review THEN
      INSERT INTO app.contact_events (contact_id, kind) VALUES (NEW.id, 'reviewed');
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.contact_timeline() OWNER TO pauseai_backoffice_owner;

--
-- Name: current_aal(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.current_aal() RETURNS integer
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$ SELECT coalesce(nullif(current_setting('app.aal', true), '')::integer, 0) $$;


ALTER FUNCTION private.current_aal() OWNER TO pauseai_backoffice_owner;

--
-- Name: current_channel(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.current_channel() RETURNS text
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$ SELECT CASE current_setting('app.channel', true) WHEN 'web' THEN 'web' WHEN 'bot' THEN 'bot' END $$;


ALTER FUNCTION private.current_channel() OWNER TO pauseai_backoffice_owner;

--
-- Name: current_user_id(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;


ALTER FUNCTION private.current_user_id() OWNER TO pauseai_backoffice_owner;

--
-- Name: erased_ref(app.source_kind, text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.erased_ref(source app.source_kind, external_id text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
    SELECT 'erased:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(source::text || ':' || external_id,
                                                                                    'UTF8')), 'hex')
  $$;


ALTER FUNCTION private.erased_ref(source app.source_kind, external_id text) OWNER TO pauseai_backoffice_owner;

--
-- Name: export_contact(uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.export_contact(contact uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    result jsonb;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT jsonb_build_object(
             'contact', to_jsonb(c) - ARRAY['private_to', 'owner_id', 'created_by', 'updated_by'],
             'organisation', (SELECT jsonb_build_object('name', o.name, 'kind', o.kind)
                                FROM app.organisations o WHERE o.id = c.organisation_id),
             'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                             'campaign', ca.name, 'status', t.status, 'sentAt', t.sent_at,
                                             'repliedAt', t.replied_at, 'meetingAt', t.meeting_at,
                                             'nextAction', t.next_action, 'notes', t.notes)
                                           ORDER BY t.created_at)
                                      FROM app.campaign_targets t JOIN app.campaigns ca ON ca.id = t.campaign_id
                                     WHERE t.contact_id = c.id), '[]'::jsonb),
             'timeline', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                            'kind', e.kind, 'at', e.created_at, 'happenedOn', e.happened_on,
                                            'body', e.body, 'data', e.data)
                                          ORDER BY e.created_at, e.id)
                                     FROM app.contact_events e WHERE e.contact_id = c.id), '[]'::jsonb))
      INTO result
      FROM app.contacts c WHERE c.id = contact;
    IF result IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO app.exports (kind, filter, row_count)
    VALUES ('contact_json', jsonb_build_object('contact', contact), 1);
    RETURN result;
  END
  $$;


ALTER FUNCTION private.export_contact(contact uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: fold_name(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.fold_name(input text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO ''
    AS $$
    SELECT btrim(regexp_replace(
      translate(lower(normalize(input, NFC)), 'áéíóúüñàèìòùâêîôûäëïöçãõ·', 'aeiouunaeiouaeiouaeiocao '),
      '[^[:alnum:]]+', ' ', 'g'))
  $$;


ALTER FUNCTION private.fold_name(input text) OWNER TO pauseai_backoffice_owner;

--
-- Name: forbid_mutation(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.forbid_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF current_setting('app.redact', true) = 'on'
       AND (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)
         = (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = current_user) THEN
      IF TG_LEVEL = 'ROW' THEN
        RETURN coalesce(NEW, OLD);
      END IF;
      RETURN NULL;
    END IF;
    RAISE EXCEPTION '%.% is append-only: % is not allowed', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'restrict_violation';
  END
  $$;


ALTER FUNCTION private.forbid_mutation() OWNER TO pauseai_backoffice_owner;

--
-- Name: hand_over_private(uuid, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.hand_over_private(departed uuid, heir uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    moved integer := 0;
    n integer;
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.staff s WHERE s.user_id = departed AND NOT s.active) THEN
      RAISE EXCEPTION 'only a deactivated account''s records are handed over'
        USING ERRCODE = 'check_violation', HINT = 'stillActive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = heir AND s.active AND r.role IN ('admin', 'outreach')) THEN
      RAISE EXCEPTION 'the heir works in outreach, or administers'
        USING ERRCODE = 'check_violation', HINT = 'heir';
    END IF;
    -- Organisations first, so each contact's organisation is its new person's when the contact moves.
    UPDATE app.organisations o SET private_to = heir WHERE o.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    UPDATE app.contacts c SET private_to = heir WHERE c.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e SET private_to = heir WHERE e.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    UPDATE app.organisation_notes n2 SET private_to = heir WHERE n2.private_to = departed;
    GET DIAGNOSTICS n = ROW_COUNT;
    moved := moved + n;
    PERFORM set_config('app.redact', '', true);
    RETURN moved;
  END
  $$;


ALTER FUNCTION private.hand_over_private(departed uuid, heir uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: happened_rules(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.happened_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.happened_on > (now() AT TIME ZONE 'Europe/Madrid')::date THEN
      RAISE EXCEPTION 'nothing has happened in the future yet' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.happened_rules() OWNER TO pauseai_backoffice_owner;

--
-- Name: import_batch(text, app.source_kind, text, jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.import_batch(kind text, source app.source_kind, file_sha256 text, records jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    run uuid;
    item jsonb;
    made uuid;
    existing app.intake_records;
    outcome app.intake_status;
    tally jsonb := jsonb_build_object('received', 0, 'unchanged', 0, 'created', 0, 'attached', 0, 'review', 0,
                                       'conflict', 0, 'updated', 0, 'erased', 0);
  BEGIN
    IF jsonb_typeof(records) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'records are an array' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    INSERT INTO app.imports (kind, started_by, file_sha256)
    VALUES (import_batch.kind, private.current_user_id(), import_batch.file_sha256)
    RETURNING id INTO run;
    FOR item IN SELECT * FROM jsonb_array_elements(records) LOOP
      tally := jsonb_set(tally, '{received}', to_jsonb((tally ->> 'received')::int + 1));
      PERFORM private.check_payload(item -> 'payload');
      -- A record of someone erased: counted, never brought back.
      IF EXISTS (SELECT 1 FROM app.intake_records i
                  WHERE i.source = import_batch.source
                    AND i.external_id = private.erased_ref(import_batch.source, item ->> 'external_id')) THEN
        tally := jsonb_set(tally, '{erased}', to_jsonb((tally ->> 'erased')::int + 1));
        CONTINUE;
      END IF;
      SELECT i.* INTO existing FROM app.intake_records i
       WHERE i.source = import_batch.source AND i.external_id = item ->> 'external_id' FOR UPDATE;
      IF FOUND AND existing.person_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM app.people p
                      WHERE p.id = private.survivor(existing.person_id) AND p.anonymised_at IS NOT NULL) THEN
        tally := jsonb_set(tally, '{erased}', to_jsonb((tally ->> 'erased')::int + 1));
        CONTINUE;
      ELSIF FOUND AND existing.payload = item -> 'payload' THEN
        tally := jsonb_set(tally, '{unchanged}', to_jsonb((tally ->> 'unchanged')::int + 1));
        CONTINUE;
      ELSIF FOUND THEN
        UPDATE app.intake_records i SET payload = item -> 'payload', import_id = run WHERE i.id = existing.id;
        tally := jsonb_set(tally, '{updated}', to_jsonb((tally ->> 'updated')::int + 1));
        IF existing.person_id IS NOT NULL THEN
          SELECT i.* INTO existing FROM app.intake_records i WHERE i.id = existing.id;
          IF private.intake_attach(existing, existing.person_id) <> '{}' THEN
            UPDATE app.intake_records i SET status = 'conflict' WHERE i.id = existing.id;
          END IF;
        END IF;
        CONTINUE;
      END IF;
      INSERT INTO app.intake_records (source, external_id, payload, import_id, reported_by)
      VALUES (import_batch.source, item ->> 'external_id', item -> 'payload', run, private.current_user_id())
      RETURNING id INTO made;
      outcome := private.intake_process(made, NULL, NULL);
      tally := jsonb_set(tally, ARRAY[outcome::text], to_jsonb(coalesce((tally ->> outcome::text)::int, 0) + 1));
    END LOOP;
    UPDATE app.imports i SET finished_at = now(), counts = tally WHERE i.id = run;
    RETURN tally || jsonb_build_object('import_id', run);
  END
  $$;


ALTER FUNCTION private.import_batch(kind text, source app.source_kind, file_sha256 text, records jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: import_csv(text, jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.import_csv(file_sha256 text, rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) > 5000 THEN
      RAISE EXCEPTION 'rows are an array of at most 5000' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN private.import_batch('csv', 'csv', file_sha256,
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'external_id', encode(pg_catalog.sha256(convert_to((r -> 'payload')::text, 'UTF8')), 'hex'),
                'payload', r -> 'payload')), '[]')
         FROM jsonb_array_elements(rows) r));
  END
  $$;


ALTER FUNCTION private.import_csv(file_sha256 text, rows jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: ingest_airtable(jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.ingest_airtable(records jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('backoffice:airtable-sync')) THEN
      RETURN jsonb_build_object('skipped', true);
    END IF;
    IF jsonb_typeof(records) IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(records) r
                   WHERE NOT (r ->> 'external_id') ~ '^rec[A-Za-z0-9]{14}$') THEN
      RAISE EXCEPTION 'records need their Airtable record ids' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN private.import_batch('airtable', 'airtable', NULL, records);
  END
  $_$;


ALTER FUNCTION private.ingest_airtable(records jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: inherit_privacy(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.inherit_privacy() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    holder uuid;
  BEGIN
    IF TG_TABLE_NAME = 'contact_events' THEN
      SELECT c.private_to INTO holder FROM app.contacts c WHERE c.id = NEW.contact_id;
    ELSE
      SELECT o.private_to INTO holder FROM app.organisations o WHERE o.id = NEW.organisation_id;
    END IF;
    IF holder IS NOT NULL THEN
      NEW.private_to := holder;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.inherit_privacy() OWNER TO pauseai_backoffice_owner;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: intake_records; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.intake_records (
    id uuid DEFAULT uuidv7() NOT NULL,
    source app.source_kind NOT NULL,
    external_id text NOT NULL,
    payload jsonb NOT NULL,
    status app.intake_status DEFAULT 'pending'::app.intake_status NOT NULL,
    person_id uuid,
    candidates uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    conflicts jsonb DEFAULT '{}'::jsonb NOT NULL,
    import_id uuid,
    reported_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    decided_by uuid,
    CONSTRAINT intake_records_conflicts_check CHECK ((jsonb_typeof(conflicts) = 'object'::text)),
    CONSTRAINT intake_records_external_id_check CHECK (((length(external_id) >= 1) AND (length(external_id) <= 200))),
    CONSTRAINT intake_records_payload_check CHECK ((jsonb_typeof(payload) = 'object'::text))
);


ALTER TABLE app.intake_records OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN intake_records.external_id; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.intake_records.external_id IS 'personal data';


--
-- Name: COLUMN intake_records.payload; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.intake_records.payload IS 'personal data';


--
-- Name: COLUMN intake_records.conflicts; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.intake_records.conflicts IS 'personal data';


--
-- Name: intake_attach(app.intake_records, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.intake_attach(intake app.intake_records, person uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
  DECLARE
    payload jsonb := intake.payload;
    subject app.people;
    conflicts jsonb := '{}';
    identity record;
    holder uuid;
    field text;
    proposed text;
    held text;
    taken text[] := '{}';
    channel uuid := private.arrival_channel(payload ->> 'arrival');
    today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
    joined date := CASE WHEN jsonb_typeof(payload -> 'joined_on') = 'string'
                        THEN least((payload ->> 'joined_on')::date, today)
                        WHEN payload ? 'joined_on' THEN NULL
                        ELSE today END;
    gone date := least((payload ->> 'left_on')::date, today);
  BEGIN
    SELECT p.* INTO subject FROM app.people p WHERE p.id = person FOR UPDATE;
    FOR identity IN SELECT * FROM private.intake_identities(payload) LOOP
      SELECT private.survivor(i.person_id) INTO holder FROM app.identities i
       WHERE i.kind = identity.kind AND i.value = identity.value;
      IF holder IS NULL THEN
        INSERT INTO app.identities (person_id, kind, value, source)
        VALUES (person, identity.kind, identity.value, intake.source);
      ELSIF holder <> person THEN
        taken := taken || identity.value;
      END IF;
    END LOOP;
    IF cardinality(taken) > 0 THEN
      conflicts := conflicts || jsonb_build_object('identities', to_jsonb(taken));
    END IF;
    INSERT INTO app.person_sources (person_id, source, reported_by)
    VALUES (person, intake.source, intake.reported_by)
    ON CONFLICT DO NOTHING;

    IF coalesce(btrim(payload ->> 'name'), '') = '' THEN
      NULL;
    ELSIF subject.full_name IS NULL THEN
      UPDATE app.people p SET full_name = left(btrim(payload ->> 'name'), 200) WHERE p.id = person;
    ELSIF private.fold_name(payload ->> 'name') <> subject.name_folded THEN
      conflicts := conflicts || jsonb_build_object('full_name',
        jsonb_build_object('current', subject.full_name, 'proposed', btrim(payload ->> 'name')));
    END IF;
    FOREACH field IN ARRAY ARRAY['preferred_name', 'province', 'town', 'how_heard'] LOOP
      proposed := nullif(btrim(payload ->> field), '');
      held := to_jsonb(subject) ->> field;
      IF proposed IS NULL THEN
        CONTINUE;
      ELSIF held IS NULL THEN
        EXECUTE format('UPDATE app.people SET %I = $1 WHERE id = $2', field) USING proposed, person;
      ELSIF private.fold_name(held) <> private.fold_name(proposed) THEN
        conflicts := conflicts || jsonb_build_object(field, jsonb_build_object('current', held, 'proposed', proposed));
      END IF;
    END LOOP;
    IF jsonb_typeof(payload -> 'languages') = 'array' THEN
      UPDATE app.people p
         SET languages = ARRAY(SELECT DISTINCT l FROM unnest(p.languages || ARRAY(
                                 SELECT jsonb_array_elements_text(payload -> 'languages'))) l ORDER BY l)
       WHERE p.id = person;
    END IF;
    IF payload ->> 'arrived_on' IS NOT NULL
       AND (subject.arrived_on IS NULL
            OR least((payload ->> 'arrived_on')::date, (now() AT TIME ZONE 'Europe/Madrid')::date) < subject.arrived_on) THEN
      UPDATE app.people p
         SET arrived_on = least((payload ->> 'arrived_on')::date, (now() AT TIME ZONE 'Europe/Madrid')::date)
       WHERE p.id = person;
    END IF;
    IF channel IS NOT NULL AND subject.arrival_channel_id IS NULL THEN
      UPDATE app.people p SET arrival_channel_id = channel WHERE p.id = person;
    END IF;

    IF payload ? 'left_on' THEN
      IF EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = person AND c.left_on = gone) THEN
        NULL;
      ELSIF EXISTS (SELECT 1 FROM app.community_presence c
                     WHERE c.person_id = person AND c.left_on IS NULL AND coalesce(c.joined_on, gone) <= gone) THEN
        UPDATE app.community_presence c SET left_on = gone, left_reported_by = intake.reported_by
         WHERE c.person_id = person AND c.left_on IS NULL;
      ELSE
        INSERT INTO app.community_presence (person_id, joined_on, left_on, chat, joined_reported_by, left_reported_by)
        VALUES (person, joined, gone, nullif(btrim(payload ->> 'chat'), ''), intake.reported_by, intake.reported_by);
      END IF;
    ELSIF (intake.source = 'telegram' OR payload ? 'chat' OR payload ? 'joined_on')
          AND NOT EXISTS (SELECT 1 FROM app.community_presence c
                           WHERE c.person_id = person
                             AND (c.left_on IS NULL
                                  OR (payload ? 'joined_on' AND c.joined_on IS NOT DISTINCT FROM joined))) THEN
      INSERT INTO app.community_presence (person_id, joined_on, chat, joined_reported_by)
      VALUES (person, joined, nullif(btrim(payload ->> 'chat'), ''), intake.reported_by);
    END IF;
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (person, CASE intake.source WHEN 'telegram' THEN 'reported'::app.event_kind
                                       WHEN 'manual' THEN 'reported'::app.event_kind
                                       ELSE 'imported'::app.event_kind END,
            jsonb_build_object('source', intake.source, 'intake_id', intake.id));
    IF coalesce(btrim(payload ->> 'note'), '') <> '' THEN
      INSERT INTO app.person_events (person_id, kind, body)
      VALUES (person, 'note', left(btrim(payload ->> 'note'), 4000));
    END IF;
    RETURN conflicts;
  END
  $_$;


ALTER FUNCTION private.intake_attach(intake app.intake_records, person uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: intake_create(app.intake_records); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.intake_create(intake app.intake_records) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    person uuid;
    named boolean := coalesce(btrim(intake.payload ->> 'name'), '') <> '';
    today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  BEGIN
    IF NOT named
       AND NOT (intake.source IN ('telegram', 'manual', 'csv')
                AND EXISTS (SELECT 1 FROM private.intake_identities(intake.payload) x
                             WHERE x.kind IN ('phone', 'email', 'discord') AND btrim(x.value) <> '')) THEN
      RAISE EXCEPTION 'a new person needs a name, or a phone, an email or a Discord username'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO app.people (full_name, stage, arrived_on, arrival_channel_id)
    VALUES (CASE WHEN named THEN left(btrim(intake.payload ->> 'name'), 200) END,
            CASE WHEN intake.payload ->> 'stage' IN ('new', 'welcomed', 'active', 'left')
                 THEN (intake.payload ->> 'stage')::app.stage ELSE 'new' END,
            CASE WHEN jsonb_typeof(intake.payload -> 'arrived_on') = 'null' THEN NULL
                 ELSE least(coalesce((intake.payload ->> 'arrived_on')::date, today), today) END,
            private.arrival_channel(intake.payload ->> 'arrival'))
    RETURNING id INTO person;
    PERFORM private.intake_attach(intake, person);
    RETURN person;
  END
  $$;


ALTER FUNCTION private.intake_create(intake app.intake_records) OWNER TO pauseai_backoffice_owner;

--
-- Name: intake_identities(jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.intake_identities(payload jsonb) RETURNS TABLE(kind app.identity_kind, value text)
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
    SELECT 'email'::app.identity_kind, e FROM jsonb_array_elements_text(coalesce(payload -> 'emails', '[]')) e
    UNION
    SELECT 'phone'::app.identity_kind, p FROM jsonb_array_elements_text(coalesce(payload -> 'phones', '[]')) p
    UNION
    SELECT 'discord'::app.identity_kind, d FROM jsonb_array_elements_text(coalesce(payload -> 'discords', '[]')) d
    UNION
    SELECT 'airtable'::app.identity_kind, payload ->> 'airtable_id' WHERE payload ? 'airtable_id'
  $$;


ALTER FUNCTION private.intake_identities(payload jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: intake_process(uuid, text, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.intake_process(intake_id uuid, decision text, target uuid) RETURNS app.intake_status
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    intake app.intake_records;
    exact uuid[];
    alike uuid[];
    person uuid;
    found_conflicts jsonb;
    outcome app.intake_status;
  BEGIN
    SELECT i.* INTO intake FROM app.intake_records i WHERE i.id = intake_id FOR UPDATE;
    IF intake.status NOT IN ('pending', 'review') THEN
      RETURN intake.status;
    END IF;
    IF decision = 'discard' THEN
      UPDATE app.intake_records i SET status = 'discarded', decided_at = now(),
             decided_by = private.current_user_id() WHERE i.id = intake_id;
      RETURN 'discarded';
    END IF;
    SELECT coalesce(array_agg(DISTINCT private.survivor(i.person_id)), '{}') INTO exact
      FROM private.intake_identities(intake.payload) x
      JOIN app.identities i ON i.kind = x.kind AND i.value = x.value;
    IF cardinality(exact) > 1 THEN
      UPDATE app.intake_records i SET status = 'review', candidates = exact WHERE i.id = intake_id;
      RETURN 'review';
    END IF;
    IF cardinality(exact) = 1 THEN
      person := exact[1];
    ELSIF decision = 'attach' THEN
      person := private.survivor(target);
      IF NOT EXISTS (SELECT 1 FROM app.people p WHERE p.id = person AND p.anonymised_at IS NULL) THEN
        RAISE EXCEPTION 'no person % to attach to', target USING ERRCODE = 'foreign_key_violation';
      END IF;
    ELSIF decision IS DISTINCT FROM 'new' THEN
      SELECT coalesce(array_agg(s.person_id), '{}') INTO alike
        FROM private.similar_people(intake.payload ->> 'name', intake.payload ->> 'province') s;
      IF cardinality(alike) > 0 THEN
        UPDATE app.intake_records i SET status = 'review', candidates = alike WHERE i.id = intake_id;
        RETURN 'review';
      END IF;
    END IF;

    IF person IS NULL THEN
      person := private.intake_create(intake);
      outcome := 'created';
      found_conflicts := '{}';
    ELSE
      found_conflicts := private.intake_attach(intake, person);
      outcome := CASE WHEN found_conflicts = '{}' THEN 'attached' ELSE 'conflict' END;
    END IF;
    UPDATE app.intake_records i
       SET status = outcome, person_id = person, candidates = '{}', conflicts = found_conflicts,
           decided_at = CASE WHEN outcome = 'conflict' THEN NULL ELSE now() END,
           decided_by = CASE WHEN outcome = 'conflict' THEN NULL ELSE private.current_user_id() END
     WHERE i.id = intake_id;
    RETURN outcome;
  END
  $$;


ALTER FUNCTION private.intake_process(intake_id uuid, decision text, target uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: invitation_transition(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.invitation_transition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    decision text[] := ARRAY['accepted_at', 'accepted_by', 'revoked_at'];
  BEGIN
    IF OLD.accepted_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invitation % is already decided', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    IF (to_jsonb(NEW) - decision) IS DISTINCT FROM (to_jsonb(OLD) - decision) THEN
      RAISE EXCEPTION 'invitation %: only revoking or accepting it is allowed', OLD.id
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.revoked_at IS NOT NULL AND NEW.accepted_at IS NULL AND NEW.accepted_by IS NULL THEN
      NEW.revoked_at := now();
    ELSIF NEW.revoked_at IS NULL AND (NEW.accepted_at IS NOT NULL OR NEW.accepted_by IS NOT NULL) THEN
      IF OLD.expires_at <= now() THEN
        RAISE EXCEPTION 'invitation % has expired', OLD.id USING ERRCODE = 'restrict_violation';
      END IF;
      NEW.accepted_at := now();
      NEW.accepted_by := private.current_user_id();
    ELSE
      RAISE EXCEPTION 'invitation %: revoke it or accept it', OLD.id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.invitation_transition() OWNER TO pauseai_backoffice_owner;

--
-- Name: keep_an_admin(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.keep_an_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.active AND r.role = 'admin') THEN
      RAISE EXCEPTION 'the last active admin can''t be removed: make someone else admin first'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.keep_an_admin() OWNER TO pauseai_backoffice_owner;

--
-- Name: link_code_needs_session(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.link_code_needs_session() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
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


ALTER FUNCTION private.link_code_needs_session() OWNER TO pauseai_backoffice_owner;

--
-- Name: link_needs_second_factor(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.link_needs_second_factor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    PERFORM 1 FROM auth.users u WHERE u.id = NEW.user_id AND u.two_factor_enabled FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'a Telegram link needs its account''s second factor' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.link_needs_second_factor() OWNER TO pauseai_backoffice_owner;

--
-- Name: may_intake(boolean); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.may_intake(bot boolean) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    SELECT private.staff_can('admin', 'onboarding') OR (bot AND private.bot_can('onboarding'))
  $$;


ALTER FUNCTION private.may_intake(bot boolean) OWNER TO pauseai_backoffice_owner;

--
-- Name: merge_people(uuid, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.merge_people(survivor uuid, merged uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    kept app.people;
    gone app.people;
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF survivor = merged THEN
      RAISE EXCEPTION 'a person is not merged into themselves' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    -- Locked in id order, so two merges of the same pair never wait for each other.
    PERFORM 1 FROM app.people p WHERE p.id IN (survivor, merged) ORDER BY p.id FOR UPDATE;
    SELECT p.* INTO kept FROM app.people p WHERE p.id = survivor;
    SELECT p.* INTO gone FROM app.people p WHERE p.id = merged;
    IF kept.id IS NULL OR gone.id IS NULL OR kept.merged_into IS NOT NULL OR gone.merged_into IS NOT NULL
       OR kept.anonymised_at IS NOT NULL OR gone.anonymised_at IS NOT NULL THEN
      RAISE EXCEPTION 'both people must exist, and be neither merged nor anonymised' USING ERRCODE = 'restrict_violation';
    END IF;
    -- One account, one person: two records each linked to an account are two people, or one with two accounts, for an
    -- admin to sort out by unlinking one first.
    IF EXISTS (SELECT 1 FROM app.staff s WHERE s.person_id = survivor)
       AND EXISTS (SELECT 1 FROM app.staff s WHERE s.person_id = merged) THEN
      RAISE EXCEPTION 'both people are linked to team accounts' USING ERRCODE = 'restrict_violation';
    END IF;

    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (merged, 'merged', jsonb_build_object('into', survivor, 'snapshot', to_jsonb(gone) - 'name_folded',
              'identities', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value)), '[]')
                               FROM app.identities i WHERE i.person_id = merged)));
    INSERT INTO app.person_events (person_id, kind, data)
    VALUES (survivor, 'merged', jsonb_build_object('from', merged));

    UPDATE app.identities i SET person_id = survivor WHERE i.person_id = merged;
    INSERT INTO app.person_sources (person_id, source, first_seen_at, reported_by)
    SELECT survivor, s.source, s.first_seen_at, s.reported_by FROM app.person_sources s WHERE s.person_id = merged
    ON CONFLICT (person_id, source) DO UPDATE
      SET first_seen_at = least(app.person_sources.first_seen_at, EXCLUDED.first_seen_at);
    DELETE FROM app.person_sources s WHERE s.person_id = merged;
    -- One open period at most: the tombstone's open one closes into the survivor's if the survivor has its own.
    IF EXISTS (SELECT 1 FROM app.community_presence c WHERE c.person_id = survivor AND c.left_on IS NULL) THEN
      UPDATE app.community_presence c SET left_on = (now() AT TIME ZONE 'Europe/Madrid')::date
       WHERE c.person_id = merged AND c.left_on IS NULL;
    END IF;
    UPDATE app.community_presence c SET person_id = survivor WHERE c.person_id = merged;
    UPDATE app.intake_records i SET person_id = survivor WHERE i.person_id = merged;
    UPDATE app.intake_records i SET candidates = array_remove(i.candidates, merged)
     WHERE merged = ANY (i.candidates);

    UPDATE app.people p
       SET full_name = coalesce(p.full_name, gone.full_name),
           owner_id = coalesce(p.owner_id, gone.owner_id),
           next_action = coalesce(p.next_action, gone.next_action),
           next_action_due = CASE WHEN p.next_action IS NULL THEN gone.next_action_due ELSE p.next_action_due END,
           preferred_name = coalesce(p.preferred_name, gone.preferred_name),
           province = coalesce(p.province, gone.province),
           town = coalesce(p.town, gone.town),
           pronouns = coalesce(p.pronouns, gone.pronouns),
           availability = coalesce(p.availability, gone.availability),
           how_heard = coalesce(p.how_heard, gone.how_heard),
           summary = coalesce(p.summary, gone.summary),
           languages = ARRAY(SELECT DISTINCT l FROM unnest(p.languages || gone.languages) l ORDER BY l),
           profile_completed_at = greatest(p.profile_completed_at, gone.profile_completed_at),
           arrived_on = least(p.arrived_on, gone.arrived_on),
           arrival_channel_id = coalesce(p.arrival_channel_id, gone.arrival_channel_id)
     WHERE p.id = survivor;
    -- The account follows its person to the survivor.
    UPDATE app.staff s SET person_id = survivor WHERE s.person_id = merged;
    UPDATE app.people p SET merged_into = survivor, owner_id = NULL, next_action = NULL, next_action_due = NULL
     WHERE p.id = merged;
  END
  $$;


ALTER FUNCTION private.merge_people(survivor uuid, merged uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: merge_private_contact(uuid, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.merge_private_contact(private_contact uuid, team_contact uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    mine app.contacts;
  BEGIN
    IF NOT private.staff_can('admin', 'outreach') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT c.* INTO mine FROM app.contacts c
     WHERE c.id = private_contact AND c.private_to = private.current_user_id() AND c.anonymised_at IS NULL
       FOR UPDATE;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    PERFORM 1 FROM app.contacts c
     WHERE c.id = team_contact AND c.private_to IS NULL AND c.anonymised_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    UPDATE app.contacts c
       SET person_name = coalesce(c.person_name, mine.person_name),
           greeting_name = coalesce(c.greeting_name, mine.greeting_name),
           role = coalesce(c.role, mine.role),
           email = coalesce(c.email, mine.email),
           emails_extra = (SELECT coalesce(array_agg(x.address ORDER BY x.address), '{}')
                             FROM (SELECT DISTINCT a.address
                                     FROM unnest(c.emails_extra || mine.emails_extra || ARRAY[mine.email]) AS a(address)
                                    WHERE a.address IS NOT NULL
                                      AND a.address IS DISTINCT FROM coalesce(c.email, mine.email)
                                    LIMIT 10) x),
           phone = coalesce(c.phone, mine.phone),
           website = coalesce(c.website, mine.website),
           territory = coalesce(c.territory, mine.territory),
           scope = coalesce(c.scope, mine.scope),
           sector = coalesce(c.sector, mine.sector)
     WHERE c.id = team_contact;
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e
       SET contact_id = team_contact,
           private_to = CASE WHEN current_setting('app.share_history', true) = 'on' THEN NULL ELSE e.private_to END
     WHERE e.contact_id = private_contact;
    PERFORM set_config('app.redact', '', true);
    DELETE FROM app.contacts c WHERE c.id = private_contact;
    INSERT INTO app.contact_events (contact_id, kind, data)
    VALUES (team_contact, 'shared', jsonb_build_object('merged', true));
    RETURN true;
  END
  $$;


ALTER FUNCTION private.merge_private_contact(private_contact uuid, team_contact uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: message_template_version(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.message_template_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW.body_nameless IS DISTINCT FROM OLD.body_nameless THEN
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.message_template_version() OWNER TO pauseai_backoffice_owner;

--
-- Name: pending_invitation(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.pending_invitation(token_hash text) RETURNS TABLE(email text, roles app.staff_role[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    SELECT i.email, i.roles
      FROM app.invitations i
     WHERE i.token_hash = pending_invitation.token_hash
       AND i.accepted_at IS NULL
       AND i.revoked_at IS NULL
       AND i.expires_at > now()
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = i.created_by AND s.active AND r.role = 'admin')
  $$;


ALTER FUNCTION private.pending_invitation(token_hash text) OWNER TO pauseai_backoffice_owner;

--
-- Name: person_rules(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.person_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF OLD.full_name IS NOT NULL AND NEW.full_name IS NULL THEN
      RAISE EXCEPTION 'a person''s name, once known, stays' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stage IN ('left', 'discarded') THEN
      NEW.next_action := NULL;
      NEW.next_action_due := NULL;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.person_rules() OWNER TO pauseai_backoffice_owner;

--
-- Name: person_timeline(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.person_timeline() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO app.person_events (person_id, kind, data)
      VALUES (NEW.id, 'created', jsonb_build_object('stage', NEW.stage));
      RETURN NULL;
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO app.person_events (person_id, kind, data, happened_on)
      VALUES (NEW.id, 'stage_changed', jsonb_build_object('from', OLD.stage, 'to', NEW.stage),
              nullif(current_setting('app.happened_on', true), '')::date);
    END IF;
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
      INSERT INTO app.person_events (person_id, kind, data)
      VALUES (NEW.id, 'owner_changed', jsonb_build_object('from', OLD.owner_id, 'to', NEW.owner_id));
    END IF;
    IF (NEW.next_action, NEW.next_action_due) IS DISTINCT FROM (OLD.next_action, OLD.next_action_due)
       AND NEW.stage NOT IN ('left', 'discarded') THEN
      INSERT INTO app.person_events (person_id, kind, body, data)
      VALUES (NEW.id, 'next_action_set', NEW.next_action, jsonb_build_object('due', NEW.next_action_due));
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.person_timeline() OWNER TO pauseai_backoffice_owner;

--
-- Name: presence_timeline(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.presence_timeline() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.joined_on IS NOT NULL THEN
      INSERT INTO app.person_events (person_id, kind, data, happened_on)
      VALUES (NEW.person_id, 'joined', jsonb_build_object('on', NEW.joined_on, 'chat', NEW.chat),
              CASE WHEN NEW.joined_on <= today THEN NEW.joined_on END);
    END IF;
    IF NEW.left_on IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.left_on IS NULL) THEN
      INSERT INTO app.person_events (person_id, kind, data, happened_on)
      VALUES (NEW.person_id, 'left', jsonb_build_object('on', NEW.left_on),
              CASE WHEN NEW.left_on <= today THEN NEW.left_on END);
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.presence_timeline() OWNER TO pauseai_backoffice_owner;

--
-- Name: private_records(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.private_records() RETURNS TABLE(user_id uuid, contacts integer, organisations integer, notes integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
      SELECT r.user_id, r.contacts, r.organisations, r.notes
        FROM (SELECT s.user_id,
                     (SELECT count(*)::integer FROM app.contacts c WHERE c.private_to = s.user_id) AS contacts,
                     (SELECT count(*)::integer FROM app.organisations o WHERE o.private_to = s.user_id)
                       AS organisations,
                     (SELECT count(*)::integer FROM app.contact_events e
                       WHERE e.private_to = s.user_id AND e.kind = 'note')
                     + (SELECT count(*)::integer FROM app.organisation_notes n WHERE n.private_to = s.user_id)
                       AS notes
                FROM app.staff s WHERE NOT s.active) r
       WHERE r.contacts + r.organisations + r.notes > 0
       ORDER BY r.user_id;
  END
  $$;


ALTER FUNCTION private.private_records() OWNER TO pauseai_backoffice_owner;

--
-- Name: private_rules(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.private_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    holder uuid;
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.private_to IS NULL AND NEW.private_to IS NOT NULL THEN
      RAISE EXCEPTION 'a record the team has stays the team''s'
        USING ERRCODE = 'check_violation', HINT = 'shared';
    END IF;
    IF TG_TABLE_NAME = 'contacts' THEN
      IF NEW.organisation_id IS NOT NULL
         AND (TG_OP = 'INSERT' OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
              OR NEW.private_to IS DISTINCT FROM OLD.private_to) THEN
        SELECT o.private_to INTO holder FROM app.organisations o WHERE o.id = NEW.organisation_id;
        IF NOT FOUND OR (holder IS NOT NULL AND holder IS DISTINCT FROM NEW.private_to) THEN
          RAISE EXCEPTION 'the contact''s organisation is private'
            USING ERRCODE = 'check_violation', HINT = 'organisationPrivate';
        END IF;
      END IF;
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.private_rules() OWNER TO pauseai_backoffice_owner;

--
-- Name: refuse_anonymised_detail(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.refuse_anonymised_detail() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF EXISTS (SELECT 1 FROM app.people p WHERE p.id = NEW.person_id AND p.anonymised_at IS NOT NULL) THEN
      RAISE EXCEPTION 'person % was erased', NEW.person_id USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.refuse_anonymised_detail() OWNER TO pauseai_backoffice_owner;

--
-- Name: refuse_anonymised_person(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.refuse_anonymised_person() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    RAISE EXCEPTION 'person % was erased', OLD.id USING ERRCODE = 'restrict_violation';
  END
  $$;


ALTER FUNCTION private.refuse_anonymised_person() OWNER TO pauseai_backoffice_owner;

--
-- Name: report_leave(uuid, date); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.report_leave(person uuid, left_on date DEFAULT NULL::date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    day date := coalesce(left_on, (now() AT TIME ZONE 'Europe/Madrid')::date);
  BEGIN
    IF NOT private.may_intake(true) THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app.people p WHERE p.id = person AND p.merged_into IS NULL
                                                 AND p.anonymised_at IS NULL) THEN
      RETURN false;
    END IF;
    UPDATE app.community_presence c SET left_on = greatest(day, coalesce(c.joined_on, day)),
           left_reported_by = private.current_user_id()
     WHERE c.person_id = person AND c.left_on IS NULL;
    IF NOT FOUND THEN
      INSERT INTO app.community_presence (person_id, left_on, left_reported_by)
      VALUES (person, day, private.current_user_id());
    END IF;
    RETURN true;
  END
  $$;


ALTER FUNCTION private.report_leave(person uuid, left_on date) OWNER TO pauseai_backoffice_owner;

--
-- Name: resolve_intake(uuid, text, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid DEFAULT NULL::uuid) RETURNS app.intake_status
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  DECLARE
    intake app.intake_records;
    field text;
    census jsonb;
    outcome app.intake_status;
  BEGIN
    IF NOT private.staff_can('admin', 'onboarding') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT i.* INTO intake FROM app.intake_records i WHERE i.id = intake_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no intake record %', intake_id USING ERRCODE = 'no_data_found';
    END IF;
    census := intake.conflicts -> 'census';
    IF intake.status = 'review' AND census IS NOT NULL AND decision IN ('attach', 'new') THEN
      IF decision = 'new' THEN
        RAISE EXCEPTION 'a census answer that matched two people is attached to one of them, or discarded'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF target IS NULL OR NOT (target = ANY (intake.candidates)) THEN
        RAISE EXCEPTION 'attach to one of the candidates' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      UPDATE app.intake_records i
         SET status = 'conflict', person_id = private.survivor(target), candidates = '{}'
       WHERE i.id = intake_id;
      RETURN 'conflict';
    END IF;
    IF intake.status = 'review' AND decision IN ('attach', 'new', 'discard') THEN
      IF decision = 'attach'
         AND (target IS NULL OR (intake.source = 'census' AND NOT (target = ANY (intake.candidates)))) THEN
        RAISE EXCEPTION 'attach to someone; a census answer, to one of its candidates'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      outcome := private.intake_process(intake_id, decision, target);
      IF census IS NOT NULL AND outcome IN ('attached', 'conflict', 'created') THEN
        UPDATE app.intake_records i
           SET status = 'conflict', conflicts = i.conflicts || jsonb_build_object('census', census),
               decided_at = NULL, decided_by = NULL
         WHERE i.id = intake_id;
        RETURN 'conflict';
      END IF;
      RETURN outcome;
    END IF;
    IF intake.status = 'conflict' AND decision IN ('apply', 'keep') THEN
      IF decision = 'apply' THEN
        FOR field IN SELECT k FROM jsonb_object_keys(intake.conflicts) k WHERE k NOT IN ('identities', 'census') LOOP
          EXECUTE format('UPDATE app.people SET %I = $1 WHERE id = $2', field)
            USING intake.conflicts -> field ->> 'proposed', intake.person_id;
        END LOOP;
        IF census IS NOT NULL THEN
          PERFORM private.census_apply(intake.person_id, census, 'generic');
        END IF;
      END IF;
      UPDATE app.intake_records i SET status = 'attached', conflicts = '{}', decided_at = now(),
             decided_by = private.current_user_id() WHERE i.id = intake_id;
      RETURN 'attached';
    END IF;
    RAISE EXCEPTION 'intake record % is %: % is not a decision for it', intake_id, intake.status, decision
      USING ERRCODE = 'restrict_violation';
  END
  $_$;


ALTER FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: rights_contacts(text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.rights_contacts(query text) RETURNS TABLE(id uuid, org_display text, person_name text, is_private boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    wanted text := lower(btrim(query));
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
      SELECT c.id, c.org_display, c.person_name, c.private_to IS NOT NULL
        FROM app.contacts c
       WHERE c.anonymised_at IS NULL AND wanted <> ''
         AND (c.email = wanted OR wanted = ANY (c.emails_extra) OR c.phone = btrim(query)
              OR lower(c.person_name) = wanted)
       ORDER BY c.org_display, c.person_name, c.id
       LIMIT 50;
  END
  $$;


ALTER FUNCTION private.rights_contacts(query text) OWNER TO pauseai_backoffice_owner;

--
-- Name: session_needs_second_factor(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.session_needs_second_factor() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    PERFORM 1 FROM auth.two_factors f WHERE f.user_id = NEW.user_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'an aal2 session needs its account''s second factor' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.session_needs_second_factor() OWNER TO pauseai_backoffice_owner;

--
-- Name: share_history(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.share_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF current_setting('app.share_history', true) IS DISTINCT FROM 'on' THEN
      RETURN NULL;
    END IF;
    PERFORM set_config('app.redact', 'on', true);
    IF TG_TABLE_NAME = 'contacts' THEN
      UPDATE app.contact_events e SET private_to = NULL
       WHERE e.contact_id = NEW.id AND e.private_to = OLD.private_to;
    ELSE
      UPDATE app.organisation_notes n SET private_to = NULL
       WHERE n.organisation_id = NEW.id AND n.private_to = OLD.private_to;
    END IF;
    PERFORM set_config('app.redact', '', true);
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.share_history() OWNER TO pauseai_backoffice_owner;

--
-- Name: similar_people(text, text); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.similar_people(name text, province text) RETURNS TABLE(person_id uuid, score numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
    WITH scored AS (
      SELECT p.id,
             extensions.similarity(p.name_folded, private.fold_name(similar_people.name))
             + CASE WHEN similar_people.province IS NOT NULL
                         AND private.fold_name(p.province) = private.fold_name(similar_people.province)
                    THEN 0.15 ELSE 0 END AS score
        FROM app.people p
       WHERE p.merged_into IS NULL AND p.anonymised_at IS NULL
         AND coalesce(btrim(similar_people.name), '') <> ''
    )
    SELECT c.id, round(c.score::numeric, 2)
      FROM scored c CROSS JOIN app.settings s
     WHERE c.score >= s.match_threshold
     ORDER BY c.score DESC, c.id
     LIMIT 5
  $$;


ALTER FUNCTION private.similar_people(name text, province text) OWNER TO pauseai_backoffice_owner;

--
-- Name: staff_activation(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.staff_activation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.active IS NOT DISTINCT FROM OLD.active THEN
      NEW.deactivated_at := OLD.deactivated_at;
      NEW.deactivated_by := OLD.deactivated_by;
    ELSIF NEW.active THEN
      NEW.deactivated_at := NULL;
      NEW.deactivated_by := NULL;
    ELSE
      NEW.deactivated_at := now();
      NEW.deactivated_by := private.current_user_id();
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.staff_activation() OWNER TO pauseai_backoffice_owner;

--
-- Name: staff_can(app.staff_role[]); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.staff_can(VARIADIC roles app.staff_role[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    SELECT private.current_channel() IS NOT DISTINCT FROM 'web'
       AND private.current_aal() = 2
       AND EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = private.current_user_id() AND s.active AND r.role = ANY (roles))
  $$;


ALTER FUNCTION private.staff_can(VARIADIC roles app.staff_role[]) OWNER TO pauseai_backoffice_owner;

--
-- Name: staff_person_is_live(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.staff_person_is_live() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.person_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM app.people p
          WHERE p.id = NEW.person_id AND p.merged_into IS NULL AND p.anonymised_at IS NULL) THEN
      RAISE EXCEPTION 'a team account links only to someone still there' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.staff_person_is_live() OWNER TO pauseai_backoffice_owner;

--
-- Name: staff_person_suggestions(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.staff_person_suggestions() RETURNS TABLE(user_id uuid, person_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT private.staff_can('admin') THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT DISTINCT s.user_id, p.id
      FROM app.staff s
      JOIN auth.users u ON u.id = s.user_id
      JOIN app.identities i ON i.kind = 'email' AND lower(i.value) = lower(btrim(u.email))
      JOIN app.people p ON p.id = i.person_id AND p.merged_into IS NULL AND p.anonymised_at IS NULL
     WHERE s.person_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM app.staff o WHERE o.person_id = p.id)
     ORDER BY s.user_id, p.id;
  END
  $$;


ALTER FUNCTION private.staff_person_suggestions() OWNER TO pauseai_backoffice_owner;

--
-- Name: stamp(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.stamp() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  DECLARE
    col text;
    fresh jsonb := to_jsonb(NEW);
    stamped jsonb := '{}';
  BEGIN
    IF TG_NARGS = 0 THEN
      RAISE EXCEPTION 'private.stamp on %.% needs the columns to stamp', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF NOT fresh ? col OR NOT (col LIKE '%\_at' OR col LIKE '%\_by' OR col = 'actor_id') THEN
        RAISE EXCEPTION 'private.stamp on %.%: % is not an actor column or event timestamp of the table',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, col
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      stamped := stamped || jsonb_build_object(col,
        CASE
          WHEN TG_OP = 'UPDATE' AND col NOT IN ('updated_by', 'updated_at') THEN to_jsonb(OLD) -> col
          WHEN col LIKE '%\_at' THEN to_jsonb(now())
          ELSE to_jsonb(private.current_user_id())
        END);
    END LOOP;
    RETURN jsonb_populate_record(NEW, stamped);
  END
  $$;


ALTER FUNCTION private.stamp() OWNER TO pauseai_backoffice_owner;

--
-- Name: stamp_channel(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.stamp_channel() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    NEW.channel := private.current_channel();
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.stamp_channel() OWNER TO pauseai_backoffice_owner;

--
-- Name: submit_census(text, jsonb); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.submit_census(token_hash text, answer jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    link record;
    person uuid;
    intake uuid;
    outcome app.intake_status;
    matched uuid[];
    kept jsonb;
  BEGIN
    PERFORM private.check_census(answer);
    IF submit_census.token_hash IS NOT NULL THEN
      SELECT k.* INTO link FROM private.census_link_person(submit_census.token_hash) k;
      IF NOT FOUND THEN
        RETURN 'invalid';
      END IF;
      PERFORM 1 FROM app.census_links l WHERE l.id = link.link_id FOR UPDATE;
      PERFORM private.census_apply(link.person_id, answer, 'personal');
      UPDATE app.census_links l SET used_at = coalesce(l.used_at, now()) WHERE l.id = link.link_id;
      RETURN 'updated';
    END IF;

    -- Two answers with the same new email or phone at once (a double click, a reload): the second waits here until the
    -- first is done, then finds the person it made and waits in the Bandeja, instead of failing on an identity it can't
    -- add twice. Email first, then phone, always, so two answers never wait on each other.
    IF coalesce(answer ->> 'email', '') <> '' THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('census email ' || (answer ->> 'email'), 0));
    END IF;
    IF coalesce(answer ->> 'phone', '') <> '' THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('census phone ' || (answer ->> 'phone'), 0));
    END IF;

    INSERT INTO app.intake_records (source, external_id, payload, reported_by)
    VALUES ('census', 'censo:' || pg_catalog.gen_random_uuid()::text,
            jsonb_strip_nulls(jsonb_build_object(
              'name', btrim(answer ->> 'name'),
              'preferred_name', nullif(btrim(answer ->> 'preferred_name'), ''),
              'emails', CASE WHEN coalesce(answer ->> 'email', '') <> '' THEN jsonb_build_array(answer ->> 'email') END,
              'phones', CASE WHEN coalesce(answer ->> 'phone', '') <> '' THEN jsonb_build_array(answer ->> 'phone') END,
              'province', nullif(btrim(answer ->> 'province'), ''),
              'town', nullif(btrim(answer ->> 'town'), ''),
              'stage', 'to_triage')),
            NULL)
    RETURNING id INTO intake;
    -- Anyone can type anyone's number: an answer that matches someone never applies itself, and waits in the Bandeja
    -- with the time it was given (a conflict to apply, or, matching two people, one to attach first); one that matches
    -- nobody makes a new person.
    SELECT coalesce(array_agg(DISTINCT private.survivor(i.person_id)), '{}') INTO matched
      FROM app.identities i
     WHERE (i.kind = 'email' AND i.value = answer ->> 'email') OR (i.kind = 'phone' AND i.value = answer ->> 'phone');
    IF cardinality(matched) > 0 THEN
      kept := (answer - 'age_ok') || jsonb_build_object('answered_at', now());
      UPDATE app.intake_records r
         SET status = CASE WHEN cardinality(matched) = 1 THEN 'conflict'::app.intake_status ELSE 'review' END,
             person_id = CASE WHEN cardinality(matched) = 1 THEN matched[1] END,
             candidates = CASE WHEN cardinality(matched) > 1 THEN matched ELSE '{}' END,
             conflicts = jsonb_build_object('census', kept)
       WHERE r.id = intake;
      RETURN 'review';
    END IF;
    outcome := private.intake_process(intake, 'new', NULL);
    SELECT r.person_id INTO person FROM app.intake_records r WHERE r.id = intake;
    IF outcome = 'created' AND person IS NOT NULL THEN
      PERFORM private.census_apply(person, answer, 'generic');
      RETURN 'created';
    END IF;
    RETURN 'review';
  END
  $$;


ALTER FUNCTION private.submit_census(token_hash text, answer jsonb) OWNER TO pauseai_backoffice_owner;

--
-- Name: submit_intake(app.source_kind, text, jsonb, text, uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.submit_intake(source app.source_kind, external_id text, payload jsonb, decision text DEFAULT NULL::text, target uuid DEFAULT NULL::uuid) RETURNS TABLE(intake_id uuid, status app.intake_status, person_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DECLARE
    made uuid;
  BEGIN
    IF NOT ((submit_intake.source = 'manual' AND private.staff_can('admin', 'onboarding'))
            OR (submit_intake.source = 'telegram' AND private.bot_can('onboarding'))) THEN
      RAISE EXCEPTION 'not allowed to report through % here', submit_intake.source
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF decision IS NOT NULL AND decision NOT IN ('attach', 'new') THEN
      RAISE EXCEPTION 'unknown decision %', decision USING ERRCODE = 'invalid_parameter_value';
    END IF;
    PERFORM private.check_payload(payload);
    INSERT INTO app.intake_records (source, external_id, payload, reported_by)
    VALUES (submit_intake.source, submit_intake.external_id, payload, private.current_user_id())
    ON CONFLICT ON CONSTRAINT intake_records_source_external_id_key DO NOTHING
    RETURNING id INTO made;
    IF made IS NULL THEN
      SELECT i.id INTO made FROM app.intake_records i
       WHERE i.source = submit_intake.source AND i.external_id = submit_intake.external_id;
    ELSE
      PERFORM private.intake_process(made, decision, target);
    END IF;
    RETURN QUERY SELECT i.id, i.status, i.person_id FROM app.intake_records i WHERE i.id = made;
  END
  $$;


ALTER FUNCTION private.submit_intake(source app.source_kind, external_id text, payload jsonb, decision text, target uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: survivor(uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.survivor(person uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
  DECLARE
    current uuid := person;
    next uuid;
  BEGIN
    FOR step IN 1..20 LOOP
      SELECT p.merged_into INTO next FROM app.people p WHERE p.id = current;
      IF next IS NULL THEN
        RETURN current;
      END IF;
      current := next;
    END LOOP;
    RAISE EXCEPTION 'merges of % go deeper than 20', person;
  END
  $$;


ALTER FUNCTION private.survivor(person uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: target_rules(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.target_rules() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.status IN ('ready', 'sent') AND (TG_OP = 'UPDATE' OR NEW.status = 'ready')
       AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
       AND EXISTS (SELECT 1 FROM app.contacts c
                    WHERE c.id = NEW.contact_id AND (c.needs_review OR c.hold OR c.anonymised_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'contact not ready' USING ERRCODE = 'check_violation', HINT = 'needsReview';
    END IF;
    -- Someone wrote to them: that stays.
    IF TG_OP = 'UPDATE' AND OLD.sent_at IS NOT NULL AND NEW.status IN ('pending', 'ready', 'skip') THEN
      RAISE EXCEPTION 'target % was written to already', OLD.id USING ERRCODE = 'check_violation', HINT = 'sent';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      CASE NEW.status
        WHEN 'sent' THEN NEW.sent_at := coalesce(NEW.sent_at, now());
        WHEN 'replied' THEN NEW.replied_at := coalesce(NEW.replied_at, now());
        WHEN 'meeting' THEN NEW.meeting_at := coalesce(NEW.meeting_at, now());
        ELSE NULL;
      END CASE;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.target_rules() OWNER TO pauseai_backoffice_owner;

--
-- Name: target_shared(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.target_shared() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.contacts c WHERE c.id = NEW.contact_id AND c.private_to IS NULL) THEN
      RAISE EXCEPTION 'a campaign writes to team contacts only' USING ERRCODE = 'check_violation', HINT = 'private';
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.target_shared() OWNER TO pauseai_backoffice_owner;

--
-- Name: target_timeline(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.target_timeline() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO app.contact_events (contact_id, campaign_id, kind, data)
      VALUES (NEW.contact_id, NEW.campaign_id,
              CASE WHEN NEW.status = 'sent' THEN 'sent'::app.contact_event_kind ELSE 'status_changed' END,
              jsonb_strip_nulls(jsonb_build_object('from', OLD.status, 'to', NEW.status,
                                                   'templateVersion', NEW.template_version)));
      -- A first reply or meeting moves the relationship along, never back.
      IF NEW.status IN ('replied', 'meeting') THEN
        UPDATE app.contacts c SET stage = 'engaged' WHERE c.id = NEW.contact_id AND c.stage IN ('identified', 'qualified', 'contacted');
      ELSIF NEW.status = 'sent' THEN
        UPDATE app.contacts c SET stage = 'contacted' WHERE c.id = NEW.contact_id AND c.stage IN ('identified', 'qualified');
      END IF;
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.target_timeline() OWNER TO pauseai_backoffice_owner;

--
-- Name: team_card(uuid); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.team_card(person uuid) RETURNS TABLE(person_id uuid, name text, province text, sources text[], stage app.stage, owner_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION private.team_card(person uuid) OWNER TO pauseai_backoffice_owner;

--
-- Name: team_unposted(bigint); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.team_unposted(chat bigint) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


ALTER FUNCTION private.team_unposted(chat bigint) OWNER TO pauseai_backoffice_owner;

--
-- Name: telegram_needs_onboarding(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.telegram_needs_onboarding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    PERFORM 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
     WHERE s.user_id = NEW.user_id AND s.active AND r.role = 'onboarding'
       FOR SHARE OF s, r;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'the Telegram bot is for the onboarding team' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.telegram_needs_onboarding() OWNER TO pauseai_backoffice_owner;

--
-- Name: template_version(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.template_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
  BEGIN
    IF NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body THEN
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END
  $$;


ALTER FUNCTION private.template_version() OWNER TO pauseai_backoffice_owner;

--
-- Name: unlink_telegram(); Type: FUNCTION; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE FUNCTION private.unlink_telegram() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM app.staff s JOIN app.staff_roles r ON r.user_id = s.user_id
                    WHERE s.user_id = OLD.user_id AND s.active AND r.role = 'onboarding') THEN
      DELETE FROM auth.telegram_links l WHERE l.user_id = OLD.user_id;
      DELETE FROM auth.telegram_link_codes c WHERE c.user_id = OLD.user_id;
    END IF;
    RETURN NULL;
  END
  $$;


ALTER FUNCTION private.unlink_telegram() OWNER TO pauseai_backoffice_owner;

--
-- Name: airtable_sync; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.airtable_sync (
    id boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    link_ciphertext text,
    link_set_by uuid,
    link_set_at timestamp with time zone,
    last_run_at timestamp with time zone,
    last_run_failure text,
    last_run_counts jsonb,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT airtable_sync_enabled_check CHECK (((NOT enabled) OR (link_ciphertext IS NOT NULL))),
    CONSTRAINT airtable_sync_id_check CHECK (id),
    CONSTRAINT airtable_sync_last_run_counts_check CHECK ((jsonb_typeof(last_run_counts) = 'object'::text)),
    CONSTRAINT airtable_sync_last_run_failure_check CHECK ((last_run_failure = ANY (ARRAY['link'::text, 'page'::text, 'data'::text, 'columns'::text, 'key'::text, 'database'::text]))),
    CONSTRAINT airtable_sync_link_check CHECK (((link_ciphertext IS NULL) = (link_set_at IS NULL))),
    CONSTRAINT airtable_sync_link_ciphertext_check CHECK (((link_ciphertext ~ '^v1\.[A-Za-z0-9_-]+$'::text) AND (length(link_ciphertext) <= 1000))),
    CONSTRAINT airtable_sync_run_check CHECK (
CASE
    WHEN (last_run_at IS NULL) THEN ((last_run_failure IS NULL) AND (last_run_counts IS NULL))
    ELSE ((last_run_failure IS NULL) <> (last_run_counts IS NULL))
END)
);


ALTER TABLE app.airtable_sync OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN airtable_sync.link_ciphertext; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.airtable_sync.link_ciphertext IS 'personal data';


--
-- Name: arrival_channels; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.arrival_channels (
    id uuid DEFAULT uuidv7() NOT NULL,
    key text,
    label text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT arrival_channels_key_check CHECK ((key ~ '^[a-z_]{1,30}$'::text)),
    CONSTRAINT arrival_channels_label_check CHECK (((btrim(label) <> ''::text) AND (length(label) <= 80)))
);


ALTER TABLE app.arrival_channels OWNER TO pauseai_backoffice_owner;

--
-- Name: audit_log; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.audit_log (
    id bigint NOT NULL,
    actor_id uuid,
    channel text,
    action text NOT NULL,
    table_name text NOT NULL,
    row_id text NOT NULL,
    diff jsonb,
    at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'bot'::text])))
);


ALTER TABLE app.audit_log OWNER TO pauseai_backoffice_owner;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME app.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaign_anchors; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.campaign_anchors (
    id uuid DEFAULT uuidv7() NOT NULL,
    campaign_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    text text NOT NULL,
    sources text[] NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_anchors_key_check CHECK ((key ~ '^[a-z0-9_-]{1,60}$'::text)),
    CONSTRAINT campaign_anchors_label_check CHECK (((btrim(label) <> ''::text) AND (length(label) <= 200))),
    CONSTRAINT campaign_anchors_sources_check CHECK (((cardinality(sources) >= 1) AND (cardinality(sources) <= 30))),
    CONSTRAINT campaign_anchors_text_check CHECK (((btrim(text) <> ''::text) AND (length(text) <= 4000)))
);


ALTER TABLE app.campaign_anchors OWNER TO pauseai_backoffice_owner;

--
-- Name: campaign_targets; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.campaign_targets (
    id uuid DEFAULT uuidv7() NOT NULL,
    campaign_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status app.target_status DEFAULT 'pending'::app.target_status NOT NULL,
    owner_id uuid,
    priority integer,
    anchor text,
    next_action text,
    next_action_due date,
    sent_at timestamp with time zone,
    template_version integer,
    replied_at timestamp with time zone,
    meeting_at timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_targets_anchor_check CHECK ((anchor ~ '^[a-z0-9_-]{1,60}$'::text)),
    CONSTRAINT campaign_targets_next_action_check CHECK ((length(next_action) <= 300)),
    CONSTRAINT campaign_targets_notes_check CHECK ((length(notes) <= 4000)),
    CONSTRAINT campaign_targets_priority_check CHECK ((priority > 0))
);


ALTER TABLE app.campaign_targets OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN campaign_targets.next_action; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.campaign_targets.next_action IS 'personal data';


--
-- Name: COLUMN campaign_targets.notes; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.campaign_targets.notes IS 'personal data';


--
-- Name: campaign_templates; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.campaign_templates (
    id uuid DEFAULT uuidv7() NOT NULL,
    campaign_id uuid NOT NULL,
    tier text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    max_words integer,
    sources text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    version integer DEFAULT 1 NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaign_templates_body_check CHECK (((btrim(body) <> ''::text) AND (length(body) <= 40000))),
    CONSTRAINT campaign_templates_max_words_check CHECK ((max_words > 0)),
    CONSTRAINT campaign_templates_notes_check CHECK ((length(notes) <= 4000)),
    CONSTRAINT campaign_templates_sources_check CHECK ((cardinality(sources) <= 50)),
    CONSTRAINT campaign_templates_subject_check CHECK (((btrim(subject) <> ''::text) AND (length(subject) <= 300))),
    CONSTRAINT campaign_templates_tier_check CHECK ((tier = ANY (ARRAY['A'::text, 'B'::text])))
);


ALTER TABLE app.campaign_templates OWNER TO pauseai_backoffice_owner;

--
-- Name: campaigns; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.campaigns (
    id uuid DEFAULT uuidv7() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    goal text,
    language text DEFAULT 'es'::text NOT NULL,
    from_name text,
    from_email text,
    signature text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    owner_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT campaigns_from_email_check CHECK (((from_email = lower(from_email)) AND (from_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text))),
    CONSTRAINT campaigns_from_name_check CHECK ((length(from_name) <= 200)),
    CONSTRAINT campaigns_goal_check CHECK ((length(goal) <= 2000)),
    CONSTRAINT campaigns_language_check CHECK ((language ~ '^[a-z]{2}$'::text)),
    CONSTRAINT campaigns_name_check CHECK (((btrim(name) <> ''::text) AND (length(name) <= 200))),
    CONSTRAINT campaigns_signature_check CHECK ((length(signature) <= 2000)),
    CONSTRAINT campaigns_slug_check CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 80))),
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])))
);


ALTER TABLE app.campaigns OWNER TO pauseai_backoffice_owner;

--
-- Name: census_links; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.census_links (
    id uuid DEFAULT uuidv7() NOT NULL,
    person_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    sent_by uuid,
    used_at timestamp with time zone,
    template_id uuid,
    template_version integer,
    CONSTRAINT census_links_check CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '30 days'::interval)))),
    CONSTRAINT census_links_template_check CHECK (((template_id IS NULL) = (template_version IS NULL))),
    CONSTRAINT census_links_template_version_check CHECK ((template_version > 0)),
    CONSTRAINT census_links_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


ALTER TABLE app.census_links OWNER TO pauseai_backoffice_owner;

--
-- Name: census_options; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.census_options (
    id uuid DEFAULT uuidv7() NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT census_options_kind_check CHECK ((kind = ANY (ARRAY['skill'::text, 'interest'::text]))),
    CONSTRAINT census_options_label_check CHECK (((btrim(label) <> ''::text) AND (length(label) <= 80)))
);


ALTER TABLE app.census_options OWNER TO pauseai_backoffice_owner;

--
-- Name: community_presence; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.community_presence (
    id uuid DEFAULT uuidv7() NOT NULL,
    person_id uuid NOT NULL,
    joined_on date,
    left_on date,
    chat text,
    joined_reported_by uuid,
    left_reported_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_presence_chat_check CHECK ((length(chat) <= 100)),
    CONSTRAINT community_presence_check CHECK (((left_on IS NULL) OR (joined_on IS NULL) OR (left_on >= joined_on)))
);


ALTER TABLE app.community_presence OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN community_presence.chat; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.community_presence.chat IS 'personal data';


--
-- Name: consents; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.consents (
    id uuid DEFAULT uuidv7() NOT NULL,
    person_id uuid NOT NULL,
    kind text NOT NULL,
    granted boolean NOT NULL,
    wording_version text NOT NULL,
    source app.source_kind NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    given_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consents_kind_check CHECK ((kind = ANY (ARRAY['email'::text, 'whatsapp'::text, 'privacy'::text]))),
    CONSTRAINT consents_wording_version_check CHECK ((wording_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'::text))
);


ALTER TABLE app.consents OWNER TO pauseai_backoffice_owner;

--
-- Name: contact_events; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.contact_events (
    id uuid DEFAULT uuidv7() NOT NULL,
    contact_id uuid NOT NULL,
    campaign_id uuid,
    kind app.contact_event_kind NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    channel text,
    body text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    happened_on date,
    private_to uuid,
    CONSTRAINT contact_events_body_check CHECK ((length(body) <= 4000)),
    CONSTRAINT contact_events_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'bot'::text]))),
    CONSTRAINT contact_events_data_check CHECK ((jsonb_typeof(data) = 'object'::text)),
    CONSTRAINT contact_events_happened_on_check CHECK (((happened_on IS NULL) OR (kind = 'note'::app.contact_event_kind)))
);


ALTER TABLE app.contact_events OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN contact_events.body; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contact_events.body IS 'personal data';


--
-- Name: contacts; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.contacts (
    id uuid DEFAULT uuidv7() NOT NULL,
    organisation_id uuid,
    org_display text NOT NULL,
    person_name text,
    role text,
    treatment text DEFAULT 'neutral'::text NOT NULL,
    greeting_name text,
    email text,
    emails_extra text[] DEFAULT '{}'::text[] NOT NULL,
    phone text,
    website text,
    territory text,
    scope text,
    sector text,
    tier text DEFAULT 'B'::text NOT NULL,
    anchor text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    stage app.relationship_stage DEFAULT 'identified'::app.relationship_stage NOT NULL,
    owner_id uuid,
    reason text,
    sources text[] DEFAULT '{}'::text[] NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    hold boolean DEFAULT false NOT NULL,
    hold_reason text,
    notes text,
    external_ref text,
    anonymised_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    private_to uuid,
    CONSTRAINT contacts_anchor_check CHECK ((anchor ~ '^[a-z0-9_-]{1,60}$'::text)),
    CONSTRAINT contacts_email_check CHECK (((email = lower(email)) AND (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))),
    CONSTRAINT contacts_emails_extra_check CHECK ((cardinality(emails_extra) <= 10)),
    CONSTRAINT contacts_external_ref_check CHECK ((length(external_ref) <= 200)),
    CONSTRAINT contacts_greeting_name_check CHECK ((length(greeting_name) <= 200)),
    CONSTRAINT contacts_hold_reason_check CHECK ((length(hold_reason) <= 500)),
    CONSTRAINT contacts_notes_check CHECK ((length(notes) <= 4000)),
    CONSTRAINT contacts_org_display_check CHECK (((btrim(org_display) <> ''::text) AND (length(org_display) <= 300))),
    CONSTRAINT contacts_person_name_check CHECK ((length(person_name) <= 200)),
    CONSTRAINT contacts_phone_check CHECK ((phone ~ '^\+[1-9][0-9]{6,14}$'::text)),
    CONSTRAINT contacts_reason_check CHECK ((length(reason) <= 2000)),
    CONSTRAINT contacts_reason_sources_check CHECK ((needs_review OR ((btrim(COALESCE(reason, ''::text)) <> ''::text) AND (cardinality(sources) > 0)))),
    CONSTRAINT contacts_role_check CHECK ((length(role) <= 200)),
    CONSTRAINT contacts_scope_check CHECK ((length(scope) <= 50)),
    CONSTRAINT contacts_sector_check CHECK ((length(sector) <= 100)),
    CONSTRAINT contacts_sources_check CHECK ((cardinality(sources) <= 30)),
    CONSTRAINT contacts_tags_check CHECK ((cardinality(tags) <= 30)),
    CONSTRAINT contacts_territory_check CHECK ((length(territory) <= 100)),
    CONSTRAINT contacts_tier_check CHECK ((tier = ANY (ARRAY['A'::text, 'B'::text]))),
    CONSTRAINT contacts_treatment_check CHECK ((treatment = ANY (ARRAY['neutral'::text, 'masculino'::text, 'femenino'::text]))),
    CONSTRAINT contacts_website_check CHECK (((website ~ '^https?://'::text) AND (length(website) <= 500)))
);


ALTER TABLE app.contacts OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN contacts.person_name; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.person_name IS 'personal data';


--
-- Name: COLUMN contacts.role; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.role IS 'personal data';


--
-- Name: COLUMN contacts.greeting_name; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.greeting_name IS 'personal data';


--
-- Name: COLUMN contacts.email; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.email IS 'personal data';


--
-- Name: COLUMN contacts.emails_extra; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.emails_extra IS 'personal data';


--
-- Name: COLUMN contacts.phone; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.phone IS 'personal data';


--
-- Name: COLUMN contacts.website; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.website IS 'personal data';


--
-- Name: COLUMN contacts.tags; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.tags IS 'personal data';


--
-- Name: COLUMN contacts.reason; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.reason IS 'personal data';


--
-- Name: COLUMN contacts.sources; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.sources IS 'personal data';


--
-- Name: COLUMN contacts.hold_reason; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.hold_reason IS 'personal data';


--
-- Name: COLUMN contacts.notes; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.notes IS 'personal data';


--
-- Name: COLUMN contacts.external_ref; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.contacts.external_ref IS 'personal data';


--
-- Name: exports; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.exports (
    id uuid DEFAULT uuidv7() NOT NULL,
    kind text NOT NULL,
    filter jsonb DEFAULT '{}'::jsonb NOT NULL,
    row_count integer NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT exports_filter_check CHECK ((jsonb_typeof(filter) = 'object'::text)),
    CONSTRAINT exports_kind_check CHECK ((kind = ANY (ARRAY['people_csv'::text, 'person_json'::text, 'contact_json'::text]))),
    CONSTRAINT exports_row_count_check CHECK ((row_count >= 0))
);


ALTER TABLE app.exports OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN exports.filter; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.exports.filter IS 'personal data';


--
-- Name: identities; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.identities (
    id uuid DEFAULT uuidv7() NOT NULL,
    person_id uuid NOT NULL,
    kind app.identity_kind NOT NULL,
    value text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    source app.source_kind NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identities_check CHECK (
CASE kind
    WHEN 'email'::app.identity_kind THEN ((value = lower(value)) AND (value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'::text))
    WHEN 'phone'::app.identity_kind THEN (value ~ '^\+[1-9][0-9]{6,14}$'::text)
    WHEN 'airtable'::app.identity_kind THEN (value ~ '^rec[A-Za-z0-9]{14}$'::text)
    WHEN 'discord'::app.identity_kind THEN ((value ~ '^[a-z0-9_.]{2,32}$'::text) AND (POSITION(('..'::text) IN (value)) = 0))
    ELSE false
END)
);


ALTER TABLE app.identities OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN identities.value; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.identities.value IS 'personal data';


--
-- Name: imports; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.imports (
    id uuid DEFAULT uuidv7() NOT NULL,
    kind text NOT NULL,
    started_by uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    file_sha256 text,
    counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT imports_counts_check CHECK ((jsonb_typeof(counts) = 'object'::text)),
    CONSTRAINT imports_file_sha256_check CHECK ((file_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT imports_kind_check CHECK ((kind = ANY (ARRAY['airtable'::text, 'csv'::text])))
);


ALTER TABLE app.imports OWNER TO pauseai_backoffice_owner;

--
-- Name: invitations; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.invitations (
    id uuid DEFAULT uuidv7() NOT NULL,
    email text NOT NULL,
    roles app.staff_role[] NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    revoked_at timestamp with time zone,
    CONSTRAINT invitations_check CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '30 days'::interval)))),
    CONSTRAINT invitations_check1 CHECK (((accepted_at IS NULL) = (accepted_by IS NULL))),
    CONSTRAINT invitations_check2 CHECK (((accepted_at IS NULL) OR (revoked_at IS NULL))),
    CONSTRAINT invitations_email_check CHECK (((email = lower(email)) AND (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'::text))),
    CONSTRAINT invitations_roles_check CHECK (((cardinality(roles) > 0) AND (array_position(roles, NULL::app.staff_role) IS NULL))),
    CONSTRAINT invitations_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


ALTER TABLE app.invitations OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN invitations.email; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.invitations.email IS 'personal data';


--
-- Name: message_templates; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.message_templates (
    id uuid DEFAULT uuidv7() NOT NULL,
    purpose app.message_purpose NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    body_nameless text,
    active boolean DEFAULT true NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_templates_body_check CHECK (((btrim(body) <> ''::text) AND (length(body) <= 2000))),
    CONSTRAINT message_templates_body_nameless_check CHECK (((btrim(body_nameless) <> ''::text) AND (length(body_nameless) <= 2000))),
    CONSTRAINT message_templates_link_check CHECK (((purpose <> 'census_link'::app.message_purpose) OR ((strpos(body, '{enlace}'::text) > 0) AND ((body_nameless IS NULL) OR (strpos(body_nameless, '{enlace}'::text) > 0))))),
    CONSTRAINT message_templates_nameless_check CHECK (
CASE
    WHEN (strpos(body, '{nombre}'::text) > 0) THEN ((body_nameless IS NOT NULL) AND (strpos(body_nameless, '{nombre}'::text) = 0))
    ELSE (body_nameless IS NULL)
END),
    CONSTRAINT message_templates_placeholders_check CHECK ((regexp_replace(((body || '
'::text) || COALESCE(body_nameless, ''::text)),
CASE purpose
    WHEN 'census_link'::app.message_purpose THEN '\{(nombre|yo|enlace)\}'::text
    ELSE '\{(nombre|yo)\}'::text
END, ''::text, 'g'::text) !~ '[{}]'::text)),
    CONSTRAINT message_templates_title_check CHECK (((btrim(title) <> ''::text) AND (length(title) <= 80)))
);


ALTER TABLE app.message_templates OWNER TO pauseai_backoffice_owner;

--
-- Name: organisation_notes; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.organisation_notes (
    id uuid DEFAULT uuidv7() NOT NULL,
    organisation_id uuid NOT NULL,
    body text,
    happened_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    channel text,
    private_to uuid,
    CONSTRAINT organisation_notes_body_check CHECK (((btrim(body) <> ''::text) AND (length(body) <= 4000))),
    CONSTRAINT organisation_notes_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'bot'::text])))
);


ALTER TABLE app.organisation_notes OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN organisation_notes.body; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.organisation_notes.body IS 'personal data';


--
-- Name: organisations; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.organisations (
    id uuid DEFAULT uuidv7() NOT NULL,
    name text NOT NULL,
    kind app.organisation_kind DEFAULT 'other'::app.organisation_kind NOT NULL,
    territory text,
    website text,
    external_ref text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    private_to uuid,
    CONSTRAINT organisations_external_ref_check CHECK ((length(external_ref) <= 200)),
    CONSTRAINT organisations_name_check CHECK (((btrim(name) <> ''::text) AND (length(name) <= 200))),
    CONSTRAINT organisations_territory_check CHECK ((length(territory) <= 100)),
    CONSTRAINT organisations_website_check CHECK (((website ~ '^https?://'::text) AND (length(website) <= 500)))
);


ALTER TABLE app.organisations OWNER TO pauseai_backoffice_owner;

--
-- Name: people; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.people (
    id uuid DEFAULT uuidv7() NOT NULL,
    full_name text,
    preferred_name text,
    province text,
    town text,
    languages text[] DEFAULT '{}'::text[] NOT NULL,
    pronouns text,
    availability app.availability,
    how_heard text,
    stage app.stage DEFAULT 'new'::app.stage NOT NULL,
    owner_id uuid,
    next_action text,
    next_action_due date,
    profile_completed_at timestamp with time zone,
    merged_into uuid,
    anonymised_at timestamp with time zone,
    name_folded text GENERATED ALWAYS AS (private.fold_name(full_name)) STORED,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skills_other text,
    interests_other text,
    arrived_on date DEFAULT ((now() AT TIME ZONE 'Europe/Madrid'::text))::date,
    arrival_channel_id uuid,
    summary text,
    CONSTRAINT people_check CHECK ((merged_into IS DISTINCT FROM id)),
    CONSTRAINT people_check1 CHECK (((next_action_due IS NULL) OR (next_action IS NOT NULL))),
    CONSTRAINT people_full_name_check CHECK (((full_name IS NULL) OR ((btrim(full_name) <> ''::text) AND (length(full_name) <= 200)))),
    CONSTRAINT people_how_heard_check CHECK ((length(how_heard) <= 500)),
    CONSTRAINT people_interests_other_check CHECK ((length(interests_other) <= 300)),
    CONSTRAINT people_languages_check CHECK ((cardinality(languages) <= 20)),
    CONSTRAINT people_next_action_check CHECK (((btrim(next_action) <> ''::text) AND (length(next_action) <= 300))),
    CONSTRAINT people_preferred_name_check CHECK ((length(preferred_name) <= 100)),
    CONSTRAINT people_pronouns_check CHECK ((length(pronouns) <= 50)),
    CONSTRAINT people_province_check CHECK ((length(province) <= 100)),
    CONSTRAINT people_skills_other_check CHECK ((length(skills_other) <= 300)),
    CONSTRAINT people_summary_check CHECK (((btrim(summary) <> ''::text) AND (length(summary) <= 200) AND (summary !~ '[\r\n]'::text))),
    CONSTRAINT people_town_check CHECK ((length(town) <= 100))
);


ALTER TABLE app.people OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN people.full_name; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.full_name IS 'personal data';


--
-- Name: COLUMN people.preferred_name; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.preferred_name IS 'personal data';


--
-- Name: COLUMN people.province; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.province IS 'personal data';


--
-- Name: COLUMN people.town; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.town IS 'personal data';


--
-- Name: COLUMN people.languages; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.languages IS 'personal data';


--
-- Name: COLUMN people.pronouns; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.pronouns IS 'personal data';


--
-- Name: COLUMN people.availability; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.availability IS 'personal data';


--
-- Name: COLUMN people.how_heard; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.how_heard IS 'personal data';


--
-- Name: COLUMN people.next_action; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.next_action IS 'personal data';


--
-- Name: COLUMN people.name_folded; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.name_folded IS 'personal data';


--
-- Name: COLUMN people.skills_other; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.skills_other IS 'personal data';


--
-- Name: COLUMN people.interests_other; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.interests_other IS 'personal data';


--
-- Name: COLUMN people.summary; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.people.summary IS 'personal data';


--
-- Name: person_events; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.person_events (
    id uuid DEFAULT uuidv7() NOT NULL,
    person_id uuid NOT NULL,
    kind app.event_kind NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    channel text,
    body text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    happened_on date,
    CONSTRAINT person_events_body_check CHECK ((length(body) <= 4000)),
    CONSTRAINT person_events_channel_check CHECK ((channel = ANY (ARRAY['web'::text, 'bot'::text]))),
    CONSTRAINT person_events_check CHECK (((kind <> 'contact_attempt'::app.event_kind) OR ((data ? 'channel'::text) AND (data ? 'outcome'::text) AND ((data ->> 'channel'::text) = ANY (ARRAY['whatsapp'::text, 'phone'::text, 'video'::text, 'email'::text, 'telegram'::text, 'in_person'::text, 'other'::text])) AND ((data ->> 'outcome'::text) = ANY (ARRAY['no_answer'::text, 'replied'::text, 'left_message'::text, 'wrong_number'::text, 'declined'::text]))))),
    CONSTRAINT person_events_data_check CHECK ((jsonb_typeof(data) = 'object'::text)),
    CONSTRAINT person_events_happened_on_check CHECK (((happened_on IS NULL) OR (kind = ANY (ARRAY['contact_attempt'::app.event_kind, 'note'::app.event_kind, 'stage_changed'::app.event_kind, 'joined'::app.event_kind, 'left'::app.event_kind]))))
);


ALTER TABLE app.person_events OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN person_events.body; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.person_events.body IS 'personal data';


--
-- Name: COLUMN person_events.data; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.person_events.data IS 'personal data';


--
-- Name: settings; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.settings (
    id boolean DEFAULT true NOT NULL,
    follow_up_days integer DEFAULT 5 NOT NULL,
    unresponsive_attempts integer DEFAULT 3 NOT NULL,
    unresponsive_days integer DEFAULT 14 NOT NULL,
    unassigned_alert_hours integer DEFAULT 48 NOT NULL,
    match_threshold numeric(3,2) DEFAULT 0.55 NOT NULL,
    community_chats text[] DEFAULT '{}'::text[] NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    team_post_days integer DEFAULT 7 NOT NULL,
    CONSTRAINT settings_community_chats_check CHECK (((cardinality(community_chats) <= 100) AND (array_position(community_chats, NULL::text) IS NULL))),
    CONSTRAINT settings_follow_up_days_check CHECK (((follow_up_days >= 1) AND (follow_up_days <= 60))),
    CONSTRAINT settings_id_check CHECK (id),
    CONSTRAINT settings_match_threshold_check CHECK (((match_threshold >= 0.3) AND (match_threshold <= (1)::numeric))),
    CONSTRAINT settings_team_post_days_check CHECK (((team_post_days >= 1) AND (team_post_days <= 60))),
    CONSTRAINT settings_unassigned_alert_hours_check CHECK (((unassigned_alert_hours >= 1) AND (unassigned_alert_hours <= 720))),
    CONSTRAINT settings_unresponsive_attempts_check CHECK (((unresponsive_attempts >= 1) AND (unresponsive_attempts <= 20))),
    CONSTRAINT settings_unresponsive_days_check CHECK (((unresponsive_days >= 1) AND (unresponsive_days <= 180)))
);


ALTER TABLE app.settings OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN settings.team_post_days; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.settings.team_post_days IS 'Days back an arrival may be to be posted to the team group (ADR-0004, notifications)';


--
-- Name: people_attention; Type: VIEW; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE VIEW app.people_attention WITH (security_invoker='true') AS
 SELECT p.id AS person_id,
    array_remove(ARRAY[
        CASE
            WHEN ((p.stage = 'new'::app.stage) AND (p.owner_id IS NULL) AND (p.arrived_on >= (((now() AT TIME ZONE 'Europe/Madrid'::text))::date - 30))) THEN 'unassigned'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (p.next_action_due <= ((now() AT TIME ZONE 'Europe/Madrid'::text))::date) THEN 'action_due'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.stage = ANY (ARRAY['new'::app.stage, 'contacting'::app.stage, 'welcomed'::app.stage])) AND (p.next_action IS NULL)) THEN 'no_next_step'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.stage = 'contacting'::app.stage) AND (latest.outcome IS DISTINCT FROM 'replied'::text) AND (latest.on_day < (((now() AT TIME ZONE 'Europe/Madrid'::text))::date - s.follow_up_days))) THEN 'follow_up'::text
            ELSE NULL::text
        END,
        CASE
            WHEN ((p.stage = ANY (ARRAY['new'::app.stage, 'contacting'::app.stage, 'welcomed'::app.stage, 'active'::app.stage])) AND (EXISTS ( SELECT 1
               FROM app.community_presence c
              WHERE ((c.person_id = p.id) AND (c.left_on IS NOT NULL)))) AND (NOT (EXISTS ( SELECT 1
               FROM app.community_presence c
              WHERE ((c.person_id = p.id) AND (c.left_on IS NULL)))))) THEN 'left_community'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM app.intake_records i
              WHERE ((i.status = 'review'::app.intake_status) AND ((p.id = ANY (i.candidates)) OR (i.person_id = p.id))))) THEN 'possible_duplicate'::text
            ELSE NULL::text
        END], NULL::text) AS reasons
   FROM ((app.people p
     CROSS JOIN app.settings s)
     LEFT JOIN LATERAL ( SELECT COALESCE(e.happened_on, ((e.created_at AT TIME ZONE 'Europe/Madrid'::text))::date) AS on_day,
            (e.data ->> 'outcome'::text) AS outcome
           FROM app.person_events e
          WHERE ((e.person_id = p.id) AND (e.kind = 'contact_attempt'::app.event_kind))
          ORDER BY COALESCE(e.happened_on, ((e.created_at AT TIME ZONE 'Europe/Madrid'::text))::date) DESC, e.created_at DESC
         LIMIT 1) latest ON (true))
  WHERE ((p.merged_into IS NULL) AND (p.anonymised_at IS NULL));


ALTER VIEW app.people_attention OWNER TO pauseai_backoffice_owner;

--
-- Name: person_options; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.person_options (
    person_id uuid NOT NULL,
    option_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE app.person_options OWNER TO pauseai_backoffice_owner;

--
-- Name: person_sources; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.person_sources (
    person_id uuid NOT NULL,
    source app.source_kind NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    reported_by uuid
);


ALTER TABLE app.person_sources OWNER TO pauseai_backoffice_owner;

--
-- Name: staff; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.staff (
    user_id uuid NOT NULL,
    display_name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone,
    deactivated_by uuid,
    person_id uuid,
    CONSTRAINT staff_check CHECK ((active = (deactivated_at IS NULL))),
    CONSTRAINT staff_display_name_check CHECK (((btrim(display_name) <> ''::text) AND (length(display_name) <= 200)))
);


ALTER TABLE app.staff OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN staff.display_name; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.staff.display_name IS 'personal data';


--
-- Name: COLUMN staff.person_id; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.staff.person_id IS 'The staff member''s own person record (PLAN M5): grants nothing';


--
-- Name: staff_roles; Type: TABLE; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TABLE app.staff_roles (
    user_id uuid NOT NULL,
    role app.staff_role NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE app.staff_roles OWNER TO pauseai_backoffice_owner;

--
-- Name: accounts; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp with time zone,
    refresh_token_expires_at timestamp with time zone,
    scope text,
    password text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL
);


ALTER TABLE auth.accounts OWNER TO pauseai_backoffice_owner;

--
-- Name: rate_limits; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    count integer NOT NULL,
    last_request bigint NOT NULL
);


ALTER TABLE auth.rate_limits OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN rate_limits.key; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.rate_limits.key IS 'personal data';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    ip_address text,
    user_agent text,
    user_id uuid NOT NULL,
    aal integer NOT NULL
);


ALTER TABLE auth.sessions OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN sessions.ip_address; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.sessions.ip_address IS 'personal data';


--
-- Name: COLUMN sessions.user_agent; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.sessions.user_agent IS 'personal data';


--
-- Name: COLUMN sessions.aal; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.sessions.aal IS '2 only for a session created by a TOTP or backup-code verification; the API sets app.aal from it';


--
-- Name: telegram_link_codes; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.telegram_link_codes (
    code_hash text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    session_id uuid NOT NULL,
    CONSTRAINT telegram_link_codes_check CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:10:00'::interval)))),
    CONSTRAINT telegram_link_codes_check1 CHECK (((used_at IS NULL) OR (used_at <= expires_at))),
    CONSTRAINT telegram_link_codes_code_hash_check CHECK ((code_hash ~ '^[0-9a-f]{64}$'::text))
);


ALTER TABLE auth.telegram_link_codes OWNER TO pauseai_backoffice_owner;

--
-- Name: telegram_links; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.telegram_links (
    user_id uuid NOT NULL,
    telegram_user_id bigint NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_links_telegram_user_id_check CHECK ((telegram_user_id > 0))
);


ALTER TABLE auth.telegram_links OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN telegram_links.telegram_user_id; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.telegram_links.telegram_user_id IS 'personal data';


--
-- Name: two_factors; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.two_factors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secret text NOT NULL,
    backup_codes text NOT NULL,
    user_id uuid NOT NULL,
    verified boolean,
    failed_verification_count integer,
    locked_until timestamp with time zone
);


ALTER TABLE auth.two_factors OWNER TO pauseai_backoffice_owner;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    email_verified boolean NOT NULL,
    image text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    two_factor_enabled boolean
);


ALTER TABLE auth.users OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN users.name; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.users.name IS 'personal data';


--
-- Name: COLUMN users.email; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.users.email IS 'personal data';


--
-- Name: COLUMN users.image; Type: COMMENT; Schema: auth; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN auth.users.image IS 'personal data';


--
-- Name: verifications; Type: TABLE; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TABLE auth.verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE auth.verifications OWNER TO pauseai_backoffice_owner;

--
-- Name: telegram_dialogs; Type: TABLE; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE TABLE private.telegram_dialogs (
    telegram_user_id bigint NOT NULL,
    user_id uuid NOT NULL,
    state jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT telegram_dialogs_state_check CHECK ((jsonb_typeof(state) = 'object'::text))
);


ALTER TABLE private.telegram_dialogs OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN telegram_dialogs.state; Type: COMMENT; Schema: private; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN private.telegram_dialogs.state IS 'personal data';


--
-- Name: telegram_posts; Type: TABLE; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE TABLE private.telegram_posts (
    person_id uuid NOT NULL,
    chat_id bigint NOT NULL,
    message_id bigint,
    posted_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE private.telegram_posts OWNER TO pauseai_backoffice_owner;

--
-- Name: telegram_updates; Type: TABLE; Schema: private; Owner: pauseai_backoffice_owner
--

CREATE TABLE private.telegram_updates (
    update_id bigint NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE private.telegram_updates OWNER TO pauseai_backoffice_owner;

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: pauseai_backoffice_owner
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO pauseai_backoffice_owner;

--
-- Name: airtable_sync airtable_sync_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.airtable_sync
    ADD CONSTRAINT airtable_sync_pkey PRIMARY KEY (id);


--
-- Name: arrival_channels arrival_channels_key_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.arrival_channels
    ADD CONSTRAINT arrival_channels_key_key UNIQUE (key);


--
-- Name: arrival_channels arrival_channels_label_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.arrival_channels
    ADD CONSTRAINT arrival_channels_label_key UNIQUE (label);


--
-- Name: arrival_channels arrival_channels_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.arrival_channels
    ADD CONSTRAINT arrival_channels_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: campaign_anchors campaign_anchors_campaign_id_key_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_anchors
    ADD CONSTRAINT campaign_anchors_campaign_id_key_key UNIQUE (campaign_id, key);


--
-- Name: campaign_anchors campaign_anchors_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_anchors
    ADD CONSTRAINT campaign_anchors_pkey PRIMARY KEY (id);


--
-- Name: campaign_targets campaign_targets_campaign_id_contact_id_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_targets
    ADD CONSTRAINT campaign_targets_campaign_id_contact_id_key UNIQUE (campaign_id, contact_id);


--
-- Name: campaign_targets campaign_targets_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_targets
    ADD CONSTRAINT campaign_targets_pkey PRIMARY KEY (id);


--
-- Name: campaign_templates campaign_templates_campaign_id_tier_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_templates
    ADD CONSTRAINT campaign_templates_campaign_id_tier_key UNIQUE (campaign_id, tier);


--
-- Name: campaign_templates campaign_templates_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_templates
    ADD CONSTRAINT campaign_templates_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_slug_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaigns
    ADD CONSTRAINT campaigns_slug_key UNIQUE (slug);


--
-- Name: census_links census_links_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.census_links
    ADD CONSTRAINT census_links_pkey PRIMARY KEY (id);


--
-- Name: census_links census_links_token_hash_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.census_links
    ADD CONSTRAINT census_links_token_hash_key UNIQUE (token_hash);


--
-- Name: census_options census_options_kind_label_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.census_options
    ADD CONSTRAINT census_options_kind_label_key UNIQUE (kind, label);


--
-- Name: census_options census_options_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.census_options
    ADD CONSTRAINT census_options_pkey PRIMARY KEY (id);


--
-- Name: community_presence community_presence_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.community_presence
    ADD CONSTRAINT community_presence_pkey PRIMARY KEY (id);


--
-- Name: consents consents_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);


--
-- Name: contact_events contact_events_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contact_events
    ADD CONSTRAINT contact_events_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_external_ref_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contacts
    ADD CONSTRAINT contacts_external_ref_key UNIQUE (external_ref);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: exports exports_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.exports
    ADD CONSTRAINT exports_pkey PRIMARY KEY (id);


--
-- Name: identities identities_kind_value_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.identities
    ADD CONSTRAINT identities_kind_value_key UNIQUE (kind, value);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: imports imports_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.imports
    ADD CONSTRAINT imports_pkey PRIMARY KEY (id);


--
-- Name: intake_records intake_records_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.intake_records
    ADD CONSTRAINT intake_records_pkey PRIMARY KEY (id);


--
-- Name: intake_records intake_records_source_external_id_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.intake_records
    ADD CONSTRAINT intake_records_source_external_id_key UNIQUE (source, external_id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_hash_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.invitations
    ADD CONSTRAINT invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_purpose_title_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.message_templates
    ADD CONSTRAINT message_templates_purpose_title_key UNIQUE (purpose, title);


--
-- Name: organisation_notes organisation_notes_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.organisation_notes
    ADD CONSTRAINT organisation_notes_pkey PRIMARY KEY (id);


--
-- Name: organisations organisations_external_ref_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.organisations
    ADD CONSTRAINT organisations_external_ref_key UNIQUE (external_ref);


--
-- Name: organisations organisations_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.organisations
    ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.people
    ADD CONSTRAINT people_pkey PRIMARY KEY (id);


--
-- Name: person_events person_events_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_events
    ADD CONSTRAINT person_events_pkey PRIMARY KEY (id);


--
-- Name: person_options person_options_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_options
    ADD CONSTRAINT person_options_pkey PRIMARY KEY (person_id, option_id);


--
-- Name: person_sources person_sources_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_sources
    ADD CONSTRAINT person_sources_pkey PRIMARY KEY (person_id, source);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: staff staff_person_id_key; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff
    ADD CONSTRAINT staff_person_id_key UNIQUE (person_id);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (user_id);


--
-- Name: staff_roles staff_roles_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff_roles
    ADD CONSTRAINT staff_roles_pkey PRIMARY KEY (user_id, role);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_key_key; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.rate_limits
    ADD CONSTRAINT rate_limits_key_key UNIQUE (key);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_token_key; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_token_key UNIQUE (token);


--
-- Name: telegram_link_codes telegram_link_codes_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_pkey PRIMARY KEY (code_hash);


--
-- Name: telegram_links telegram_links_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.telegram_links
    ADD CONSTRAINT telegram_links_pkey PRIMARY KEY (user_id);


--
-- Name: telegram_links telegram_links_telegram_user_id_key; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.telegram_links
    ADD CONSTRAINT telegram_links_telegram_user_id_key UNIQUE (telegram_user_id);


--
-- Name: two_factors two_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.two_factors
    ADD CONSTRAINT two_factors_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.verifications
    ADD CONSTRAINT verifications_pkey PRIMARY KEY (id);


--
-- Name: telegram_dialogs telegram_dialogs_pkey; Type: CONSTRAINT; Schema: private; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY private.telegram_dialogs
    ADD CONSTRAINT telegram_dialogs_pkey PRIMARY KEY (telegram_user_id);


--
-- Name: telegram_posts telegram_posts_pkey; Type: CONSTRAINT; Schema: private; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY private.telegram_posts
    ADD CONSTRAINT telegram_posts_pkey PRIMARY KEY (person_id, chat_id);


--
-- Name: telegram_updates telegram_updates_pkey; Type: CONSTRAINT; Schema: private; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY private.telegram_updates
    ADD CONSTRAINT telegram_updates_pkey PRIMARY KEY (update_id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: audit_log_at_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX audit_log_at_idx ON app.audit_log USING btree (at DESC);


--
-- Name: audit_log_row_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX audit_log_row_idx ON app.audit_log USING btree (table_name, row_id);


--
-- Name: campaign_targets_contact_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX campaign_targets_contact_id_idx ON app.campaign_targets USING btree (contact_id);


--
-- Name: census_links_person_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX census_links_person_id_idx ON app.census_links USING btree (person_id);


--
-- Name: census_links_template_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX census_links_template_id_idx ON app.census_links USING btree (template_id);


--
-- Name: community_presence_open_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE UNIQUE INDEX community_presence_open_idx ON app.community_presence USING btree (person_id) WHERE (left_on IS NULL);


--
-- Name: community_presence_person_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX community_presence_person_id_idx ON app.community_presence USING btree (person_id);


--
-- Name: consents_person_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX consents_person_id_idx ON app.consents USING btree (person_id, kind, created_at DESC);


--
-- Name: contact_events_contact_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX contact_events_contact_id_idx ON app.contact_events USING btree (contact_id, created_at DESC);


--
-- Name: contact_events_private_to_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX contact_events_private_to_idx ON app.contact_events USING btree (private_to) WHERE (private_to IS NOT NULL);


--
-- Name: contacts_organisation_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX contacts_organisation_id_idx ON app.contacts USING btree (organisation_id);


--
-- Name: contacts_private_to_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX contacts_private_to_idx ON app.contacts USING btree (private_to) WHERE (private_to IS NOT NULL);


--
-- Name: identities_person_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX identities_person_id_idx ON app.identities USING btree (person_id);


--
-- Name: intake_records_person_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX intake_records_person_id_idx ON app.intake_records USING btree (person_id);


--
-- Name: intake_records_status_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX intake_records_status_idx ON app.intake_records USING btree (status) WHERE (status = ANY (ARRAY['review'::app.intake_status, 'conflict'::app.intake_status]));


--
-- Name: invitations_created_by_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX invitations_created_by_idx ON app.invitations USING btree (created_by);


--
-- Name: organisation_notes_organisation_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX organisation_notes_organisation_id_idx ON app.organisation_notes USING btree (organisation_id, created_at DESC);


--
-- Name: organisation_notes_private_to_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX organisation_notes_private_to_idx ON app.organisation_notes USING btree (private_to) WHERE (private_to IS NOT NULL);


--
-- Name: organisations_private_to_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX organisations_private_to_idx ON app.organisations USING btree (private_to) WHERE (private_to IS NOT NULL);


--
-- Name: people_name_folded_trgm_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX people_name_folded_trgm_idx ON app.people USING gin (name_folded extensions.gin_trgm_ops);


--
-- Name: people_owner_id_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX people_owner_id_idx ON app.people USING btree (owner_id) WHERE (merged_into IS NULL);


--
-- Name: people_stage_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX people_stage_idx ON app.people USING btree (stage) WHERE (merged_into IS NULL);


--
-- Name: person_events_person_id_created_at_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX person_events_person_id_created_at_idx ON app.person_events USING btree (person_id, created_at DESC);


--
-- Name: accounts_user_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX accounts_user_id_idx ON auth.accounts USING btree (user_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: telegram_link_codes_session_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX telegram_link_codes_session_id_idx ON auth.telegram_link_codes USING btree (session_id);


--
-- Name: telegram_link_codes_user_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX telegram_link_codes_user_id_idx ON auth.telegram_link_codes USING btree (user_id);


--
-- Name: two_factors_secret_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX two_factors_secret_idx ON auth.two_factors USING btree (secret);


--
-- Name: two_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX two_factors_user_id_idx ON auth.two_factors USING btree (user_id);


--
-- Name: verifications_identifier_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX verifications_identifier_idx ON auth.verifications USING btree (identifier);


--
-- Name: staff activation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER activation BEFORE INSERT OR UPDATE ON app.staff FOR EACH ROW EXECUTE FUNCTION private.staff_activation();


--
-- Name: people arrival; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER arrival BEFORE INSERT OR UPDATE OF arrived_on ON app.people FOR EACH ROW EXECUTE FUNCTION private.arrival_rules();


--
-- Name: person_events attempt_template; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER attempt_template BEFORE INSERT ON app.person_events FOR EACH ROW WHEN ((new.kind = 'contact_attempt'::app.event_kind)) EXECUTE FUNCTION private.attempt_template();


--
-- Name: airtable_sync audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.airtable_sync FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: arrival_channels audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.arrival_channels FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: campaign_anchors audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.campaign_anchors FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: campaign_targets audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.campaign_targets FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: campaign_templates audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.campaign_templates FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: campaigns audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.campaigns FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: census_links audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.census_links FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: census_options audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.census_options FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: community_presence audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.community_presence FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: consents audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.consents FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: contact_events audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.contact_events FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: contacts audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.contacts FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: exports audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.exports FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: identities audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.identities FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: imports audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.imports FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: intake_records audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.intake_records FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: invitations audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: message_templates audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.message_templates FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: organisation_notes audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.organisation_notes FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: organisations audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.organisations FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: people audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.people FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: person_events audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.person_events FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: person_options audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.person_options FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: person_sources audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.person_sources FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: settings audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.settings FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: staff audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.staff FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: staff_roles audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.staff_roles FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: person_events contact_attempt; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER contact_attempt AFTER INSERT ON app.person_events FOR EACH ROW WHEN ((new.kind = 'contact_attempt'::app.event_kind)) EXECUTE FUNCTION private.contact_attempt_rules();


--
-- Name: census_links erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE INSERT ON app.census_links FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();


--
-- Name: community_presence erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE INSERT OR UPDATE ON app.community_presence FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();


--
-- Name: consents erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE INSERT ON app.consents FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();


--
-- Name: identities erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE INSERT OR UPDATE ON app.identities FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();


--
-- Name: people erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE UPDATE ON app.people FOR EACH ROW WHEN ((old.anonymised_at IS NOT NULL)) EXECUTE FUNCTION private.refuse_anonymised_person();


--
-- Name: person_options erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE INSERT ON app.person_options FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();


--
-- Name: person_sources erased; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER erased BEFORE INSERT ON app.person_sources FOR EACH ROW EXECUTE FUNCTION private.refuse_anonymised_detail();


--
-- Name: audit_log forbid_mutation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_mutation BEFORE DELETE OR UPDATE ON app.audit_log FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: consents forbid_mutation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_mutation BEFORE DELETE OR UPDATE ON app.consents FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: contact_events forbid_mutation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_mutation BEFORE DELETE OR UPDATE ON app.contact_events FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: organisation_notes forbid_mutation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_mutation BEFORE DELETE OR UPDATE ON app.organisation_notes FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: person_events forbid_mutation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_mutation BEFORE DELETE OR UPDATE ON app.person_events FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: audit_log forbid_truncate; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.audit_log FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: consents forbid_truncate; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.consents FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: contact_events forbid_truncate; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.contact_events FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: organisation_notes forbid_truncate; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.organisation_notes FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: person_events forbid_truncate; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.person_events FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: contact_events happened; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER happened BEFORE INSERT ON app.contact_events FOR EACH ROW WHEN ((new.happened_on IS NOT NULL)) EXECUTE FUNCTION private.happened_rules();


--
-- Name: organisation_notes happened; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER happened BEFORE INSERT ON app.organisation_notes FOR EACH ROW WHEN ((new.happened_on IS NOT NULL)) EXECUTE FUNCTION private.happened_rules();


--
-- Name: person_events happened; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER happened BEFORE INSERT ON app.person_events FOR EACH ROW WHEN ((new.happened_on IS NOT NULL)) EXECUTE FUNCTION private.happened_rules();


--
-- Name: staff keep_an_admin; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER keep_an_admin AFTER UPDATE OF active ON app.staff FOR EACH ROW WHEN ((old.active AND (NOT new.active))) EXECUTE FUNCTION private.keep_an_admin();


--
-- Name: staff_roles keep_an_admin; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER keep_an_admin AFTER DELETE ON app.staff_roles FOR EACH ROW WHEN ((old.role = 'admin'::app.staff_role)) EXECUTE FUNCTION private.keep_an_admin();


--
-- Name: airtable_sync link_set; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER link_set BEFORE INSERT OR UPDATE ON app.airtable_sync FOR EACH ROW EXECUTE FUNCTION private.airtable_link_set();


--
-- Name: staff person_is_live; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER person_is_live BEFORE INSERT OR UPDATE OF person_id ON app.staff FOR EACH ROW EXECUTE FUNCTION private.staff_person_is_live();


--
-- Name: contact_events privacy; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER privacy BEFORE INSERT ON app.contact_events FOR EACH ROW EXECUTE FUNCTION private.inherit_privacy();


--
-- Name: organisation_notes privacy; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER privacy BEFORE INSERT ON app.organisation_notes FOR EACH ROW EXECUTE FUNCTION private.inherit_privacy();


--
-- Name: contacts private_rules; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER private_rules AFTER INSERT OR UPDATE OF private_to, organisation_id ON app.contacts FOR EACH ROW EXECUTE FUNCTION private.private_rules();


--
-- Name: organisations private_rules; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER private_rules AFTER INSERT OR UPDATE OF private_to ON app.organisations FOR EACH ROW EXECUTE FUNCTION private.private_rules();


--
-- Name: campaign_targets rules; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER rules BEFORE INSERT OR UPDATE ON app.campaign_targets FOR EACH ROW EXECUTE FUNCTION private.target_rules();


--
-- Name: people rules; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER rules BEFORE UPDATE ON app.people FOR EACH ROW EXECUTE FUNCTION private.person_rules();


--
-- Name: census_links sent; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER sent BEFORE UPDATE ON app.census_links FOR EACH ROW EXECUTE FUNCTION private.census_link_sent();


--
-- Name: contacts share_history; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER share_history AFTER UPDATE OF private_to ON app.contacts FOR EACH ROW WHEN (((old.private_to IS NOT NULL) AND (new.private_to IS NULL))) EXECUTE FUNCTION private.share_history();


--
-- Name: organisations share_history; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER share_history AFTER UPDATE OF private_to ON app.organisations FOR EACH ROW WHEN (((old.private_to IS NOT NULL) AND (new.private_to IS NULL))) EXECUTE FUNCTION private.share_history();


--
-- Name: campaign_targets shared; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER shared AFTER INSERT ON app.campaign_targets FOR EACH ROW EXECUTE FUNCTION private.target_shared();


--
-- Name: airtable_sync stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.airtable_sync FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');


--
-- Name: arrival_channels stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.arrival_channels FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: audit_log stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT ON app.audit_log FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id');


--
-- Name: campaign_anchors stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaign_anchors FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');


--
-- Name: campaign_targets stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaign_targets FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: campaign_templates stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaign_templates FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');


--
-- Name: campaigns stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaigns FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: census_links stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.census_links FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: census_options stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.census_options FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: community_presence stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.community_presence FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');


--
-- Name: consents stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT ON app.consents FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');


--
-- Name: contact_events stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT ON app.contact_events FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id', 'created_at');


--
-- Name: contacts stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.contacts FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: exports stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.exports FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: identities stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.identities FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: intake_records stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.intake_records FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');


--
-- Name: invitations stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: message_templates stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.message_templates FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: organisation_notes stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT ON app.organisation_notes FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id', 'created_at');


--
-- Name: organisations stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.organisations FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: people stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.people FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');


--
-- Name: person_events stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT ON app.person_events FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id', 'created_at');


--
-- Name: person_options stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.person_options FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');


--
-- Name: settings stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.settings FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');


--
-- Name: staff stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.staff FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');


--
-- Name: staff_roles stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.staff_roles FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: contact_events stamp_channel; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp_channel BEFORE INSERT ON app.contact_events FOR EACH ROW EXECUTE FUNCTION private.stamp_channel();


--
-- Name: organisation_notes stamp_channel; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp_channel BEFORE INSERT ON app.organisation_notes FOR EACH ROW EXECUTE FUNCTION private.stamp_channel();


--
-- Name: person_events stamp_channel; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp_channel BEFORE INSERT ON app.person_events FOR EACH ROW EXECUTE FUNCTION private.stamp_channel();


--
-- Name: census_links template; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER template BEFORE INSERT ON app.census_links FOR EACH ROW EXECUTE FUNCTION private.census_link_template();


--
-- Name: campaign_targets timeline; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER timeline AFTER UPDATE ON app.campaign_targets FOR EACH ROW EXECUTE FUNCTION private.target_timeline();


--
-- Name: community_presence timeline; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER timeline AFTER INSERT OR UPDATE OF left_on ON app.community_presence FOR EACH ROW EXECUTE FUNCTION private.presence_timeline();


--
-- Name: contacts timeline; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER timeline AFTER INSERT OR UPDATE ON app.contacts FOR EACH ROW EXECUTE FUNCTION private.contact_timeline();


--
-- Name: people timeline; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER timeline AFTER INSERT OR UPDATE ON app.people FOR EACH ROW EXECUTE FUNCTION private.person_timeline();


--
-- Name: invitations transition; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER transition BEFORE UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION private.invitation_transition();


--
-- Name: staff unlinks_telegram; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER unlinks_telegram AFTER UPDATE OF active ON app.staff FOR EACH ROW WHEN ((old.active AND (NOT new.active))) EXECUTE FUNCTION private.unlink_telegram();


--
-- Name: staff_roles unlinks_telegram; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER unlinks_telegram AFTER DELETE OR UPDATE ON app.staff_roles FOR EACH ROW WHEN ((old.role = 'onboarding'::app.staff_role)) EXECUTE FUNCTION private.unlink_telegram();


--
-- Name: campaign_templates version; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER version BEFORE UPDATE ON app.campaign_templates FOR EACH ROW EXECUTE FUNCTION private.template_version();


--
-- Name: message_templates version; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER version BEFORE UPDATE ON app.message_templates FOR EACH ROW EXECUTE FUNCTION private.message_template_version();


--
-- Name: sessions aal2_needs_second_factor; Type: TRIGGER; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER aal2_needs_second_factor BEFORE INSERT OR UPDATE OF aal ON auth.sessions FOR EACH ROW WHEN ((new.aal = 2)) EXECUTE FUNCTION private.session_needs_second_factor();


--
-- Name: telegram_link_codes needs_onboarding; Type: TRIGGER; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER needs_onboarding BEFORE INSERT ON auth.telegram_link_codes FOR EACH ROW EXECUTE FUNCTION private.telegram_needs_onboarding();


--
-- Name: telegram_links needs_onboarding; Type: TRIGGER; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER needs_onboarding BEFORE INSERT ON auth.telegram_links FOR EACH ROW EXECUTE FUNCTION private.telegram_needs_onboarding();


--
-- Name: telegram_links needs_second_factor; Type: TRIGGER; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER needs_second_factor BEFORE INSERT ON auth.telegram_links FOR EACH ROW EXECUTE FUNCTION private.link_needs_second_factor();


--
-- Name: telegram_link_codes needs_session; Type: TRIGGER; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER needs_session BEFORE INSERT ON auth.telegram_link_codes FOR EACH ROW EXECUTE FUNCTION private.link_code_needs_session();


--
-- Name: campaign_anchors campaign_anchors_campaign_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_anchors
    ADD CONSTRAINT campaign_anchors_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES app.campaigns(id);


--
-- Name: campaign_targets campaign_targets_campaign_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_targets
    ADD CONSTRAINT campaign_targets_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES app.campaigns(id);


--
-- Name: campaign_targets campaign_targets_contact_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_targets
    ADD CONSTRAINT campaign_targets_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES app.contacts(id);


--
-- Name: campaign_targets campaign_targets_owner_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_targets
    ADD CONSTRAINT campaign_targets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES app.staff(user_id);


--
-- Name: campaign_templates campaign_templates_campaign_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaign_templates
    ADD CONSTRAINT campaign_templates_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES app.campaigns(id);


--
-- Name: campaigns campaigns_owner_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.campaigns
    ADD CONSTRAINT campaigns_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES app.staff(user_id);


--
-- Name: census_links census_links_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.census_links
    ADD CONSTRAINT census_links_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: census_links census_links_template_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.census_links
    ADD CONSTRAINT census_links_template_id_fkey FOREIGN KEY (template_id) REFERENCES app.message_templates(id);


--
-- Name: community_presence community_presence_joined_reported_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.community_presence
    ADD CONSTRAINT community_presence_joined_reported_by_fkey FOREIGN KEY (joined_reported_by) REFERENCES app.staff(user_id);


--
-- Name: community_presence community_presence_left_reported_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.community_presence
    ADD CONSTRAINT community_presence_left_reported_by_fkey FOREIGN KEY (left_reported_by) REFERENCES app.staff(user_id);


--
-- Name: community_presence community_presence_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.community_presence
    ADD CONSTRAINT community_presence_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: consents consents_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.consents
    ADD CONSTRAINT consents_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: contact_events contact_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contact_events
    ADD CONSTRAINT contact_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES app.campaigns(id);


--
-- Name: contact_events contact_events_contact_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contact_events
    ADD CONSTRAINT contact_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES app.contacts(id);


--
-- Name: contact_events contact_events_private_to_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contact_events
    ADD CONSTRAINT contact_events_private_to_fkey FOREIGN KEY (private_to) REFERENCES app.staff(user_id);


--
-- Name: contacts contacts_organisation_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contacts
    ADD CONSTRAINT contacts_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES app.organisations(id);


--
-- Name: contacts contacts_owner_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contacts
    ADD CONSTRAINT contacts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES app.staff(user_id);


--
-- Name: contacts contacts_private_to_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.contacts
    ADD CONSTRAINT contacts_private_to_fkey FOREIGN KEY (private_to) REFERENCES app.staff(user_id);


--
-- Name: identities identities_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.identities
    ADD CONSTRAINT identities_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: imports imports_started_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.imports
    ADD CONSTRAINT imports_started_by_fkey FOREIGN KEY (started_by) REFERENCES app.staff(user_id);


--
-- Name: intake_records intake_records_import_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.intake_records
    ADD CONSTRAINT intake_records_import_id_fkey FOREIGN KEY (import_id) REFERENCES app.imports(id);


--
-- Name: intake_records intake_records_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.intake_records
    ADD CONSTRAINT intake_records_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: intake_records intake_records_reported_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.intake_records
    ADD CONSTRAINT intake_records_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES app.staff(user_id);


--
-- Name: invitations invitations_accepted_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.invitations
    ADD CONSTRAINT invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES app.staff(user_id);


--
-- Name: invitations invitations_created_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.invitations
    ADD CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES app.staff(user_id);


--
-- Name: organisation_notes organisation_notes_organisation_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.organisation_notes
    ADD CONSTRAINT organisation_notes_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES app.organisations(id);


--
-- Name: organisation_notes organisation_notes_private_to_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.organisation_notes
    ADD CONSTRAINT organisation_notes_private_to_fkey FOREIGN KEY (private_to) REFERENCES app.staff(user_id);


--
-- Name: organisations organisations_private_to_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.organisations
    ADD CONSTRAINT organisations_private_to_fkey FOREIGN KEY (private_to) REFERENCES app.staff(user_id);


--
-- Name: people people_arrival_channel_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.people
    ADD CONSTRAINT people_arrival_channel_id_fkey FOREIGN KEY (arrival_channel_id) REFERENCES app.arrival_channels(id);


--
-- Name: people people_merged_into_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.people
    ADD CONSTRAINT people_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES app.people(id);


--
-- Name: people people_owner_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.people
    ADD CONSTRAINT people_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES app.staff(user_id);


--
-- Name: person_events person_events_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_events
    ADD CONSTRAINT person_events_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: person_options person_options_option_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_options
    ADD CONSTRAINT person_options_option_id_fkey FOREIGN KEY (option_id) REFERENCES app.census_options(id);


--
-- Name: person_options person_options_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_options
    ADD CONSTRAINT person_options_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: person_sources person_sources_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_sources
    ADD CONSTRAINT person_sources_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: person_sources person_sources_reported_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.person_sources
    ADD CONSTRAINT person_sources_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES app.staff(user_id);


--
-- Name: staff staff_invited_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff
    ADD CONSTRAINT staff_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES app.staff(user_id);


--
-- Name: staff staff_person_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff
    ADD CONSTRAINT staff_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: staff_roles staff_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff_roles
    ADD CONSTRAINT staff_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.staff(user_id);


--
-- Name: staff staff_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff
    ADD CONSTRAINT staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: accounts accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.accounts
    ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: telegram_link_codes telegram_link_codes_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: telegram_link_codes telegram_link_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: telegram_links telegram_links_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.telegram_links
    ADD CONSTRAINT telegram_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: two_factors two_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.two_factors
    ADD CONSTRAINT two_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: telegram_posts telegram_posts_person_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY private.telegram_posts
    ADD CONSTRAINT telegram_posts_person_id_fkey FOREIGN KEY (person_id) REFERENCES app.people(id);


--
-- Name: invitations admin_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_delete ON app.invitations FOR DELETE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can) AND ((accepted_at IS NOT NULL) OR (revoked_at IS NOT NULL) OR (expires_at <= now()))));


--
-- Name: staff_roles admin_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_delete ON app.staff_roles FOR DELETE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: arrival_channels admin_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_insert ON app.arrival_channels FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: census_options admin_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_insert ON app.census_options FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: exports admin_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_insert ON app.exports FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: invitations admin_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_insert ON app.invitations FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: staff_roles admin_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_insert ON app.staff_roles FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: audit_log admin_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_read ON app.audit_log FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: exports admin_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_read ON app.exports FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: invitations admin_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_read ON app.invitations FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: invitations admin_revoke; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_revoke ON app.invitations FOR UPDATE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can) AND (accepted_at IS NULL) AND (revoked_at IS NULL))) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: airtable_sync admin_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_update ON app.airtable_sync FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: arrival_channels admin_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_update ON app.arrival_channels FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: census_options admin_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_update ON app.census_options FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: settings admin_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_update ON app.settings FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: staff admin_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_update ON app.staff FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: airtable_sync; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.airtable_sync ENABLE ROW LEVEL SECURITY;

--
-- Name: arrival_channels; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.arrival_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_anchors; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.campaign_anchors ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_targets; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.campaign_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_templates; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.campaign_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: census_links; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.census_links ENABLE ROW LEVEL SECURITY;

--
-- Name: census_options; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.census_options ENABLE ROW LEVEL SECURITY;

--
-- Name: community_presence; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.community_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: consents; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.consents ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_events; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.contact_events ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: exports; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.exports ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: imports; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.imports ENABLE ROW LEVEL SECURITY;

--
-- Name: intake_records; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.intake_records ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: message_templates; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.message_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: identities onboarding_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_delete ON app.identities FOR DELETE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: person_options onboarding_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_delete ON app.person_options FOR DELETE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: census_links onboarding_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_insert ON app.census_links FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: community_presence onboarding_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_insert ON app.community_presence FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: identities onboarding_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_insert ON app.identities FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can) AND (source = 'manual'::app.source_kind)));


--
-- Name: message_templates onboarding_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_insert ON app.message_templates FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: person_events onboarding_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_insert ON app.person_events FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can) AND ((kind = ANY (ARRAY['note'::app.event_kind, 'contact_attempt'::app.event_kind])) OR (pg_trigger_depth() > 0))));


--
-- Name: person_options onboarding_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_insert ON app.person_options FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: airtable_sync onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.airtable_sync FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: arrival_channels onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.arrival_channels FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: census_links onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.census_links FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: community_presence onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.community_presence FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: consents onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.consents FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: identities onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.identities FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: imports onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.imports FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: intake_records onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.intake_records FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: message_templates onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.message_templates FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: people onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.people FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: person_events onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.person_events FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: person_options onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.person_options FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: person_sources onboarding_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_read ON app.person_sources FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: census_links onboarding_send; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_send ON app.census_links FOR UPDATE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can) AND (sent_at IS NULL))) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: community_presence onboarding_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_update ON app.community_presence FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: identities onboarding_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_update ON app.identities FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: message_templates onboarding_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_update ON app.message_templates FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: people onboarding_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY onboarding_update ON app.people FOR UPDATE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can) AND (merged_into IS NULL) AND (anonymised_at IS NULL))) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role]) AS staff_can));


--
-- Name: organisation_notes; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.organisation_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: organisations; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.organisations ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_anchors outreach_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_delete ON app.campaign_anchors FOR DELETE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaign_targets outreach_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_delete ON app.campaign_targets FOR DELETE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND (status = ANY (ARRAY['pending'::app.target_status, 'ready'::app.target_status, 'skip'::app.target_status])) AND (sent_at IS NULL)));


--
-- Name: campaign_anchors outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.campaign_anchors FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaign_targets outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.campaign_targets FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND (((status = ANY (ARRAY['pending'::app.target_status, 'ready'::app.target_status, 'skip'::app.target_status])) AND (sent_at IS NULL) AND (replied_at IS NULL) AND (meeting_at IS NULL)) OR ( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can))));


--
-- Name: campaign_templates outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.campaign_templates FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaigns outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.campaigns FOR INSERT TO pauseai_backoffice_app WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: contact_events outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.contact_events FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((kind = 'note'::app.contact_event_kind) OR (pg_trigger_depth() > 0)) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id))) AND (EXISTS ( SELECT 1
   FROM app.contacts c
  WHERE (c.id = contact_events.contact_id)))));


--
-- Name: contacts outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.contacts FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id)))));


--
-- Name: organisation_notes outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.organisation_notes FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND (body IS NOT NULL) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id))) AND (EXISTS ( SELECT 1
   FROM app.organisations o
  WHERE (o.id = organisation_notes.organisation_id)))));


--
-- Name: organisations outreach_insert; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_insert ON app.organisations FOR INSERT TO pauseai_backoffice_app WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id)))));


--
-- Name: campaign_anchors outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.campaign_anchors FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaign_targets outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.campaign_targets FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaign_templates outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.campaign_templates FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaigns outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.campaigns FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: contact_events outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.contact_events FOR SELECT TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id))) AND (EXISTS ( SELECT 1
   FROM app.contacts c
  WHERE (c.id = contact_events.contact_id)))));


--
-- Name: contacts outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.contacts FOR SELECT TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id)))));


--
-- Name: organisation_notes outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.organisation_notes FOR SELECT TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id))) AND (EXISTS ( SELECT 1
   FROM app.organisations o
  WHERE (o.id = organisation_notes.organisation_id)))));


--
-- Name: organisations outreach_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_read ON app.organisations FOR SELECT TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id)))));


--
-- Name: campaign_anchors outreach_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_update ON app.campaign_anchors FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaign_targets outreach_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_update ON app.campaign_targets FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaign_templates outreach_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_update ON app.campaign_templates FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: campaigns outreach_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_update ON app.campaigns FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: contacts outreach_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_update ON app.contacts FOR UPDATE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND (anonymised_at IS NULL) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id))))) WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id)))));


--
-- Name: organisations outreach_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY outreach_update ON app.organisations FOR UPDATE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id))))) WITH CHECK ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can) AND ((private_to IS NULL) OR (private_to = ( SELECT private.current_user_id() AS current_user_id)))));


--
-- Name: people; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.people ENABLE ROW LEVEL SECURITY;

--
-- Name: person_events; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.person_events ENABLE ROW LEVEL SECURITY;

--
-- Name: person_options; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.person_options ENABLE ROW LEVEL SECURITY;

--
-- Name: person_sources; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.person_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.staff ENABLE ROW LEVEL SECURITY;

--
-- Name: census_options staff_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY staff_read ON app.census_options FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: settings staff_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY staff_read ON app.settings FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: staff staff_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY staff_read ON app.staff FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: staff_roles staff_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY staff_read ON app.staff_roles FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role, 'onboarding'::app.staff_role, 'outreach'::app.staff_role]) AS staff_can));


--
-- Name: staff_roles; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.staff_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA app; Type: ACL; Schema: -; Owner: pauseai_backoffice_owner
--

GRANT USAGE ON SCHEMA app TO pauseai_backoffice_app;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: pauseai_backoffice_owner
--

GRANT USAGE ON SCHEMA auth TO pauseai_backoffice_auth;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: pauseai_backoffice_owner
--

GRANT USAGE ON SCHEMA extensions TO pauseai_backoffice_app;


--
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: pauseai_backoffice_owner
--

GRANT USAGE ON SCHEMA private TO pauseai_backoffice_app;
GRANT USAGE ON SCHEMA private TO pauseai_backoffice_ingest;
GRANT USAGE ON SCHEMA private TO pauseai_backoffice_public;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- Name: FUNCTION accept_invitation(token_hash text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.accept_invitation(token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.accept_invitation(token_hash text) TO pauseai_backoffice_app;


--
-- Name: FUNCTION airtable_link(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.airtable_link() FROM PUBLIC;
GRANT ALL ON FUNCTION private.airtable_link() TO pauseai_backoffice_ingest;


--
-- Name: FUNCTION airtable_link_set(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.airtable_link_set() FROM PUBLIC;


--
-- Name: FUNCTION airtable_ran(failure text, counts jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.airtable_ran(failure text, counts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.airtable_ran(failure text, counts jsonb) TO pauseai_backoffice_ingest;


--
-- Name: FUNCTION anonymise_contact(contact uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.anonymise_contact(contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.anonymise_contact(contact uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION anonymise_person(person uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.anonymise_person(person uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.anonymise_person(person uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION arrival_channel(word text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.arrival_channel(word text) FROM PUBLIC;


--
-- Name: FUNCTION arrival_rules(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.arrival_rules() FROM PUBLIC;


--
-- Name: FUNCTION attempt_template(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.attempt_template() FROM PUBLIC;


--
-- Name: FUNCTION audit(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.audit() FROM PUBLIC;


--
-- Name: FUNCTION bot_can(VARIADIC roles app.staff_role[]); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) FROM PUBLIC;
GRANT ALL ON FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) TO pauseai_backoffice_app;


--
-- Name: FUNCTION bot_candidates(arrival_name text, province text, phones text[], emails text[]); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.bot_candidates(arrival_name text, province text, phones text[], emails text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION private.bot_candidates(arrival_name text, province text, phones text[], emails text[]) TO pauseai_backoffice_app;


--
-- Name: FUNCTION bot_people(scope text, query text, phones text[], emails text[]); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.bot_people(scope text, query text, phones text[], emails text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION private.bot_people(scope text, query text, phones text[], emails text[]) TO pauseai_backoffice_app;


--
-- Name: FUNCTION bot_summary(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.bot_summary() FROM PUBLIC;
GRANT ALL ON FUNCTION private.bot_summary() TO pauseai_backoffice_app;


--
-- Name: FUNCTION census_apply(person uuid, answer jsonb, link text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.census_apply(person uuid, answer jsonb, link text) FROM PUBLIC;


--
-- Name: FUNCTION census_form(token_hash text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.census_form(token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.census_form(token_hash text) TO pauseai_backoffice_public;


--
-- Name: FUNCTION census_link_person(token_hash text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.census_link_person(token_hash text) FROM PUBLIC;


--
-- Name: FUNCTION census_link_sent(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.census_link_sent() FROM PUBLIC;


--
-- Name: FUNCTION census_link_template(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.census_link_template() FROM PUBLIC;


--
-- Name: FUNCTION check_census(answer jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.check_census(answer jsonb) FROM PUBLIC;


--
-- Name: FUNCTION check_payload(payload jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.check_payload(payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION claim_person(person uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.claim_person(person uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.claim_person(person uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION contact_attempt_rules(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.contact_attempt_rules() FROM PUBLIC;


--
-- Name: FUNCTION contact_timeline(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.contact_timeline() FROM PUBLIC;


--
-- Name: FUNCTION current_aal(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.current_aal() FROM PUBLIC;
GRANT ALL ON FUNCTION private.current_aal() TO pauseai_backoffice_app;


--
-- Name: FUNCTION current_channel(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.current_channel() FROM PUBLIC;
GRANT ALL ON FUNCTION private.current_channel() TO pauseai_backoffice_app;


--
-- Name: FUNCTION current_user_id(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.current_user_id() FROM PUBLIC;
GRANT ALL ON FUNCTION private.current_user_id() TO pauseai_backoffice_app;


--
-- Name: FUNCTION erased_ref(source app.source_kind, external_id text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.erased_ref(source app.source_kind, external_id text) FROM PUBLIC;


--
-- Name: FUNCTION export_contact(contact uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.export_contact(contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.export_contact(contact uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION fold_name(input text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.fold_name(input text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.fold_name(input text) TO pauseai_backoffice_app;


--
-- Name: FUNCTION forbid_mutation(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.forbid_mutation() FROM PUBLIC;


--
-- Name: FUNCTION hand_over_private(departed uuid, heir uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.hand_over_private(departed uuid, heir uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.hand_over_private(departed uuid, heir uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION happened_rules(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.happened_rules() FROM PUBLIC;


--
-- Name: FUNCTION import_batch(kind text, source app.source_kind, file_sha256 text, records jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.import_batch(kind text, source app.source_kind, file_sha256 text, records jsonb) FROM PUBLIC;


--
-- Name: FUNCTION import_csv(file_sha256 text, rows jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.import_csv(file_sha256 text, rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.import_csv(file_sha256 text, rows jsonb) TO pauseai_backoffice_app;


--
-- Name: FUNCTION ingest_airtable(records jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.ingest_airtable(records jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.ingest_airtable(records jsonb) TO pauseai_backoffice_ingest;


--
-- Name: FUNCTION inherit_privacy(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.inherit_privacy() FROM PUBLIC;


--
-- Name: TABLE intake_records; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.intake_records TO pauseai_backoffice_app;


--
-- Name: FUNCTION intake_attach(intake app.intake_records, person uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.intake_attach(intake app.intake_records, person uuid) FROM PUBLIC;


--
-- Name: FUNCTION intake_create(intake app.intake_records); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.intake_create(intake app.intake_records) FROM PUBLIC;


--
-- Name: FUNCTION intake_identities(payload jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.intake_identities(payload jsonb) FROM PUBLIC;


--
-- Name: FUNCTION intake_process(intake_id uuid, decision text, target uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.intake_process(intake_id uuid, decision text, target uuid) FROM PUBLIC;


--
-- Name: FUNCTION invitation_transition(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.invitation_transition() FROM PUBLIC;


--
-- Name: FUNCTION keep_an_admin(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.keep_an_admin() FROM PUBLIC;


--
-- Name: FUNCTION link_code_needs_session(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.link_code_needs_session() FROM PUBLIC;


--
-- Name: FUNCTION link_needs_second_factor(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.link_needs_second_factor() FROM PUBLIC;


--
-- Name: FUNCTION may_intake(bot boolean); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.may_intake(bot boolean) FROM PUBLIC;


--
-- Name: FUNCTION merge_people(survivor uuid, merged uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.merge_people(survivor uuid, merged uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.merge_people(survivor uuid, merged uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION merge_private_contact(private_contact uuid, team_contact uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.merge_private_contact(private_contact uuid, team_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.merge_private_contact(private_contact uuid, team_contact uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION message_template_version(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.message_template_version() FROM PUBLIC;


--
-- Name: FUNCTION pending_invitation(token_hash text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.pending_invitation(token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.pending_invitation(token_hash text) TO pauseai_backoffice_app;


--
-- Name: FUNCTION person_rules(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.person_rules() FROM PUBLIC;


--
-- Name: FUNCTION person_timeline(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.person_timeline() FROM PUBLIC;


--
-- Name: FUNCTION presence_timeline(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.presence_timeline() FROM PUBLIC;


--
-- Name: FUNCTION private_records(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.private_records() FROM PUBLIC;
GRANT ALL ON FUNCTION private.private_records() TO pauseai_backoffice_app;


--
-- Name: FUNCTION private_rules(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.private_rules() FROM PUBLIC;


--
-- Name: FUNCTION refuse_anonymised_detail(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.refuse_anonymised_detail() FROM PUBLIC;


--
-- Name: FUNCTION refuse_anonymised_person(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.refuse_anonymised_person() FROM PUBLIC;


--
-- Name: FUNCTION report_leave(person uuid, left_on date); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.report_leave(person uuid, left_on date) FROM PUBLIC;
GRANT ALL ON FUNCTION private.report_leave(person uuid, left_on date) TO pauseai_backoffice_app;


--
-- Name: FUNCTION resolve_intake(intake_id uuid, decision text, target uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.resolve_intake(intake_id uuid, decision text, target uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION rights_contacts(query text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.rights_contacts(query text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.rights_contacts(query text) TO pauseai_backoffice_app;


--
-- Name: FUNCTION session_needs_second_factor(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.session_needs_second_factor() FROM PUBLIC;


--
-- Name: FUNCTION share_history(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.share_history() FROM PUBLIC;


--
-- Name: FUNCTION similar_people(name text, province text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.similar_people(name text, province text) FROM PUBLIC;


--
-- Name: FUNCTION staff_activation(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.staff_activation() FROM PUBLIC;


--
-- Name: FUNCTION staff_can(VARIADIC roles app.staff_role[]); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.staff_can(VARIADIC roles app.staff_role[]) FROM PUBLIC;
GRANT ALL ON FUNCTION private.staff_can(VARIADIC roles app.staff_role[]) TO pauseai_backoffice_app;


--
-- Name: FUNCTION staff_person_is_live(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.staff_person_is_live() FROM PUBLIC;


--
-- Name: FUNCTION staff_person_suggestions(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.staff_person_suggestions() FROM PUBLIC;
GRANT ALL ON FUNCTION private.staff_person_suggestions() TO pauseai_backoffice_app;


--
-- Name: FUNCTION stamp(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.stamp() FROM PUBLIC;


--
-- Name: FUNCTION stamp_channel(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.stamp_channel() FROM PUBLIC;


--
-- Name: FUNCTION submit_census(token_hash text, answer jsonb); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.submit_census(token_hash text, answer jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION private.submit_census(token_hash text, answer jsonb) TO pauseai_backoffice_public;


--
-- Name: FUNCTION submit_intake(source app.source_kind, external_id text, payload jsonb, decision text, target uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.submit_intake(source app.source_kind, external_id text, payload jsonb, decision text, target uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.submit_intake(source app.source_kind, external_id text, payload jsonb, decision text, target uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION survivor(person uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.survivor(person uuid) FROM PUBLIC;


--
-- Name: FUNCTION target_rules(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.target_rules() FROM PUBLIC;


--
-- Name: FUNCTION target_shared(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.target_shared() FROM PUBLIC;


--
-- Name: FUNCTION target_timeline(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.target_timeline() FROM PUBLIC;


--
-- Name: FUNCTION team_card(person uuid); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.team_card(person uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION private.team_card(person uuid) TO pauseai_backoffice_app;


--
-- Name: FUNCTION team_unposted(chat bigint); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.team_unposted(chat bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION private.team_unposted(chat bigint) TO pauseai_backoffice_app;


--
-- Name: FUNCTION telegram_needs_onboarding(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.telegram_needs_onboarding() FROM PUBLIC;


--
-- Name: FUNCTION template_version(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.template_version() FROM PUBLIC;


--
-- Name: FUNCTION unlink_telegram(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.unlink_telegram() FROM PUBLIC;


--
-- Name: COLUMN airtable_sync.id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(id) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.enabled; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(enabled),UPDATE(enabled) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.link_ciphertext; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(link_ciphertext) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.link_set_by; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(link_set_by) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.link_set_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(link_set_at) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.last_run_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(last_run_at) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.last_run_failure; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(last_run_failure) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.last_run_counts; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(last_run_counts) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.updated_by; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(updated_by) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: COLUMN airtable_sync.updated_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(updated_at) ON TABLE app.airtable_sync TO pauseai_backoffice_app;


--
-- Name: TABLE arrival_channels; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.arrival_channels TO pauseai_backoffice_app;


--
-- Name: COLUMN arrival_channels.label; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(label),UPDATE(label) ON TABLE app.arrival_channels TO pauseai_backoffice_app;


--
-- Name: COLUMN arrival_channels.active; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(active),UPDATE(active) ON TABLE app.arrival_channels TO pauseai_backoffice_app;


--
-- Name: COLUMN arrival_channels."position"; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT("position"),UPDATE("position") ON TABLE app.arrival_channels TO pauseai_backoffice_app;


--
-- Name: TABLE audit_log; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.audit_log TO pauseai_backoffice_app;


--
-- Name: TABLE campaign_anchors; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT,DELETE ON TABLE app.campaign_anchors TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_anchors.campaign_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(campaign_id) ON TABLE app.campaign_anchors TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_anchors.key; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(key) ON TABLE app.campaign_anchors TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_anchors.label; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(label),UPDATE(label) ON TABLE app.campaign_anchors TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_anchors.text; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(text),UPDATE(text) ON TABLE app.campaign_anchors TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_anchors.sources; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(sources),UPDATE(sources) ON TABLE app.campaign_anchors TO pauseai_backoffice_app;


--
-- Name: TABLE campaign_targets; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT,DELETE ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.campaign_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(campaign_id) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.contact_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(contact_id) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.status; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(status),UPDATE(status) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.owner_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(owner_id),UPDATE(owner_id) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.priority; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(priority),UPDATE(priority) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.anchor; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(anchor),UPDATE(anchor) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.next_action; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(next_action),UPDATE(next_action) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.next_action_due; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(next_action_due),UPDATE(next_action_due) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.sent_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(sent_at) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.template_version; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(template_version),UPDATE(template_version) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.replied_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(replied_at) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.meeting_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(meeting_at) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_targets.notes; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(notes),UPDATE(notes) ON TABLE app.campaign_targets TO pauseai_backoffice_app;


--
-- Name: TABLE campaign_templates; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.campaign_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(campaign_id) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.tier; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(tier) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.subject; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(subject),UPDATE(subject) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.body; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(body),UPDATE(body) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.max_words; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(max_words),UPDATE(max_words) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.sources; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(sources),UPDATE(sources) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN campaign_templates.notes; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(notes),UPDATE(notes) ON TABLE app.campaign_templates TO pauseai_backoffice_app;


--
-- Name: TABLE campaigns; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.slug; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(slug) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(name),UPDATE(name) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.goal; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(goal),UPDATE(goal) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.language; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(language),UPDATE(language) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.from_name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(from_name),UPDATE(from_name) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.from_email; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(from_email),UPDATE(from_email) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.signature; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(signature),UPDATE(signature) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.status; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(status),UPDATE(status) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN campaigns.owner_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(owner_id),UPDATE(owner_id) ON TABLE app.campaigns TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(id) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.person_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(person_id),INSERT(person_id) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.token_hash; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(token_hash) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.expires_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(expires_at),INSERT(expires_at) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.created_by; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(created_by) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.created_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(created_at) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.sent_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(sent_at),UPDATE(sent_at) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.sent_by; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(sent_by) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.used_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(used_at) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.template_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(template_id),INSERT(template_id) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: COLUMN census_links.template_version; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT(template_version),INSERT(template_version) ON TABLE app.census_links TO pauseai_backoffice_app;


--
-- Name: TABLE census_options; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.census_options TO pauseai_backoffice_app;


--
-- Name: COLUMN census_options.kind; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(kind) ON TABLE app.census_options TO pauseai_backoffice_app;


--
-- Name: COLUMN census_options.label; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(label),UPDATE(label) ON TABLE app.census_options TO pauseai_backoffice_app;


--
-- Name: COLUMN census_options.active; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(active),UPDATE(active) ON TABLE app.census_options TO pauseai_backoffice_app;


--
-- Name: COLUMN census_options."position"; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT("position"),UPDATE("position") ON TABLE app.census_options TO pauseai_backoffice_app;


--
-- Name: TABLE community_presence; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: COLUMN community_presence.person_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(person_id) ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: COLUMN community_presence.joined_on; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(joined_on),UPDATE(joined_on) ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: COLUMN community_presence.left_on; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(left_on),UPDATE(left_on) ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: COLUMN community_presence.chat; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(chat),UPDATE(chat) ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: COLUMN community_presence.joined_reported_by; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(joined_reported_by) ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: COLUMN community_presence.left_reported_by; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(left_reported_by),UPDATE(left_reported_by) ON TABLE app.community_presence TO pauseai_backoffice_app;


--
-- Name: TABLE consents; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.consents TO pauseai_backoffice_app;


--
-- Name: TABLE contact_events; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.contact_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(contact_id) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.campaign_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(campaign_id) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.kind; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(kind) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.body; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(body) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.data; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(data) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.happened_on; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(happened_on) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: COLUMN contact_events.private_to; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(private_to) ON TABLE app.contact_events TO pauseai_backoffice_app;


--
-- Name: TABLE contacts; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.organisation_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(organisation_id),UPDATE(organisation_id) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.org_display; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(org_display),UPDATE(org_display) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.person_name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(person_name),UPDATE(person_name) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.role; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(role),UPDATE(role) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.treatment; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(treatment),UPDATE(treatment) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.greeting_name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(greeting_name),UPDATE(greeting_name) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.email; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(email),UPDATE(email) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.emails_extra; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(emails_extra),UPDATE(emails_extra) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.phone; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(phone),UPDATE(phone) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.website; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(website),UPDATE(website) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.territory; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(territory),UPDATE(territory) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.scope; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(scope),UPDATE(scope) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.sector; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(sector),UPDATE(sector) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.tier; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(tier),UPDATE(tier) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.anchor; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(anchor),UPDATE(anchor) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.tags; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(tags),UPDATE(tags) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.stage; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(stage),UPDATE(stage) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.owner_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(owner_id),UPDATE(owner_id) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.reason; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(reason),UPDATE(reason) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.sources; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(sources),UPDATE(sources) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.needs_review; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(needs_review),UPDATE(needs_review) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.hold; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(hold),UPDATE(hold) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.hold_reason; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(hold_reason),UPDATE(hold_reason) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.notes; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(notes),UPDATE(notes) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.external_ref; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(external_ref) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: COLUMN contacts.private_to; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(private_to),UPDATE(private_to) ON TABLE app.contacts TO pauseai_backoffice_app;


--
-- Name: TABLE exports; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.exports TO pauseai_backoffice_app;


--
-- Name: COLUMN exports.kind; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(kind) ON TABLE app.exports TO pauseai_backoffice_app;


--
-- Name: COLUMN exports.filter; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(filter) ON TABLE app.exports TO pauseai_backoffice_app;


--
-- Name: COLUMN exports.row_count; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(row_count) ON TABLE app.exports TO pauseai_backoffice_app;


--
-- Name: TABLE identities; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT,DELETE ON TABLE app.identities TO pauseai_backoffice_app;


--
-- Name: COLUMN identities.person_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(person_id) ON TABLE app.identities TO pauseai_backoffice_app;


--
-- Name: COLUMN identities.kind; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(kind) ON TABLE app.identities TO pauseai_backoffice_app;


--
-- Name: COLUMN identities.value; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(value) ON TABLE app.identities TO pauseai_backoffice_app;


--
-- Name: COLUMN identities.verified; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(verified),UPDATE(verified) ON TABLE app.identities TO pauseai_backoffice_app;


--
-- Name: COLUMN identities.source; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(source) ON TABLE app.identities TO pauseai_backoffice_app;


--
-- Name: TABLE imports; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.imports TO pauseai_backoffice_app;


--
-- Name: TABLE invitations; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT,DELETE ON TABLE app.invitations TO pauseai_backoffice_app;


--
-- Name: COLUMN invitations.email; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(email) ON TABLE app.invitations TO pauseai_backoffice_app;


--
-- Name: COLUMN invitations.roles; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(roles) ON TABLE app.invitations TO pauseai_backoffice_app;


--
-- Name: COLUMN invitations.token_hash; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(token_hash) ON TABLE app.invitations TO pauseai_backoffice_app;


--
-- Name: COLUMN invitations.expires_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(expires_at) ON TABLE app.invitations TO pauseai_backoffice_app;


--
-- Name: COLUMN invitations.revoked_at; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(revoked_at) ON TABLE app.invitations TO pauseai_backoffice_app;


--
-- Name: TABLE message_templates; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.message_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN message_templates.purpose; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(purpose) ON TABLE app.message_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN message_templates.title; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(title),UPDATE(title) ON TABLE app.message_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN message_templates.body; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(body),UPDATE(body) ON TABLE app.message_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN message_templates.body_nameless; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(body_nameless),UPDATE(body_nameless) ON TABLE app.message_templates TO pauseai_backoffice_app;


--
-- Name: COLUMN message_templates.active; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(active),UPDATE(active) ON TABLE app.message_templates TO pauseai_backoffice_app;


--
-- Name: TABLE organisation_notes; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.organisation_notes TO pauseai_backoffice_app;


--
-- Name: COLUMN organisation_notes.organisation_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(organisation_id) ON TABLE app.organisation_notes TO pauseai_backoffice_app;


--
-- Name: COLUMN organisation_notes.body; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(body) ON TABLE app.organisation_notes TO pauseai_backoffice_app;


--
-- Name: COLUMN organisation_notes.happened_on; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(happened_on) ON TABLE app.organisation_notes TO pauseai_backoffice_app;


--
-- Name: COLUMN organisation_notes.private_to; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(private_to) ON TABLE app.organisation_notes TO pauseai_backoffice_app;


--
-- Name: TABLE organisations; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: COLUMN organisations.name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(name),UPDATE(name) ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: COLUMN organisations.kind; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(kind),UPDATE(kind) ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: COLUMN organisations.territory; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(territory),UPDATE(territory) ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: COLUMN organisations.website; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(website),UPDATE(website) ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: COLUMN organisations.external_ref; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(external_ref) ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: COLUMN organisations.private_to; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(private_to),UPDATE(private_to) ON TABLE app.organisations TO pauseai_backoffice_app;


--
-- Name: TABLE people; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.full_name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(full_name) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.preferred_name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(preferred_name) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.province; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(province) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.town; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(town) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.languages; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(languages) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.pronouns; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(pronouns) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.availability; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(availability) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.how_heard; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(how_heard) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.stage; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(stage) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.owner_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(owner_id) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.next_action; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(next_action) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.next_action_due; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(next_action_due) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.skills_other; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(skills_other) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.interests_other; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(interests_other) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.arrived_on; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(arrived_on) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.arrival_channel_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(arrival_channel_id) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: COLUMN people.summary; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(summary) ON TABLE app.people TO pauseai_backoffice_app;


--
-- Name: TABLE person_events; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.person_events TO pauseai_backoffice_app;


--
-- Name: COLUMN person_events.person_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(person_id) ON TABLE app.person_events TO pauseai_backoffice_app;


--
-- Name: COLUMN person_events.kind; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(kind) ON TABLE app.person_events TO pauseai_backoffice_app;


--
-- Name: COLUMN person_events.body; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(body) ON TABLE app.person_events TO pauseai_backoffice_app;


--
-- Name: COLUMN person_events.data; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(data) ON TABLE app.person_events TO pauseai_backoffice_app;


--
-- Name: COLUMN person_events.happened_on; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(happened_on) ON TABLE app.person_events TO pauseai_backoffice_app;


--
-- Name: TABLE settings; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.follow_up_days; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(follow_up_days) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.unresponsive_attempts; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(unresponsive_attempts) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.unresponsive_days; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(unresponsive_days) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.unassigned_alert_hours; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(unassigned_alert_hours) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.match_threshold; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(match_threshold) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.community_chats; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(community_chats) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: COLUMN settings.team_post_days; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(team_post_days) ON TABLE app.settings TO pauseai_backoffice_app;


--
-- Name: TABLE people_attention; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.people_attention TO pauseai_backoffice_app;


--
-- Name: TABLE person_options; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT,DELETE ON TABLE app.person_options TO pauseai_backoffice_app;


--
-- Name: COLUMN person_options.person_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(person_id) ON TABLE app.person_options TO pauseai_backoffice_app;


--
-- Name: COLUMN person_options.option_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(option_id) ON TABLE app.person_options TO pauseai_backoffice_app;


--
-- Name: TABLE person_sources; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.person_sources TO pauseai_backoffice_app;


--
-- Name: TABLE staff; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.staff TO pauseai_backoffice_app;


--
-- Name: COLUMN staff.display_name; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(display_name) ON TABLE app.staff TO pauseai_backoffice_app;


--
-- Name: COLUMN staff.active; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(active) ON TABLE app.staff TO pauseai_backoffice_app;


--
-- Name: COLUMN staff.person_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(person_id) ON TABLE app.staff TO pauseai_backoffice_app;


--
-- Name: TABLE staff_roles; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT,DELETE ON TABLE app.staff_roles TO pauseai_backoffice_app;


--
-- Name: COLUMN staff_roles.user_id; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(user_id) ON TABLE app.staff_roles TO pauseai_backoffice_app;


--
-- Name: COLUMN staff_roles.role; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT INSERT(role) ON TABLE app.staff_roles TO pauseai_backoffice_app;


--
-- Name: TABLE accounts; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.accounts TO pauseai_backoffice_auth;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.rate_limits TO pauseai_backoffice_auth;


--
-- Name: TABLE sessions; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.sessions TO pauseai_backoffice_auth;


--
-- Name: TABLE telegram_link_codes; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE ON TABLE auth.telegram_link_codes TO pauseai_backoffice_auth;


--
-- Name: COLUMN telegram_link_codes.used_at; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(used_at) ON TABLE auth.telegram_link_codes TO pauseai_backoffice_auth;


--
-- Name: TABLE telegram_links; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE ON TABLE auth.telegram_links TO pauseai_backoffice_auth;


--
-- Name: TABLE two_factors; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.two_factors TO pauseai_backoffice_auth;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO pauseai_backoffice_auth;


--
-- Name: TABLE verifications; Type: ACL; Schema: auth; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.verifications TO pauseai_backoffice_auth;


--
-- Name: TABLE telegram_dialogs; Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE private.telegram_dialogs TO pauseai_backoffice_app;


--
-- Name: TABLE telegram_posts; Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE ON TABLE private.telegram_posts TO pauseai_backoffice_app;


--
-- Name: COLUMN telegram_posts.message_id; Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

GRANT UPDATE(message_id) ON TABLE private.telegram_posts TO pauseai_backoffice_app;


--
-- Name: TABLE telegram_updates; Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

GRANT SELECT,INSERT,DELETE ON TABLE private.telegram_updates TO pauseai_backoffice_app;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: pauseai_backoffice_owner
--

ALTER DEFAULT PRIVILEGES FOR ROLE pauseai_backoffice_owner REVOKE ALL ON FUNCTIONS FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict schema

