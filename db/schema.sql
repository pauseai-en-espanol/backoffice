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
-- Name: private; Type: SCHEMA; Schema: -; Owner: pauseai_backoffice_owner
--

CREATE SCHEMA private;


ALTER SCHEMA private OWNER TO pauseai_backoffice_owner;

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

SET default_tablespace = '';

SET default_table_access_method = heap;

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
    CONSTRAINT staff_check CHECK ((active = (deactivated_at IS NULL))),
    CONSTRAINT staff_display_name_check CHECK (((btrim(display_name) <> ''::text) AND (length(display_name) <= 200)))
);


ALTER TABLE app.staff OWNER TO pauseai_backoffice_owner;

--
-- Name: COLUMN staff.display_name; Type: COMMENT; Schema: app; Owner: pauseai_backoffice_owner
--

COMMENT ON COLUMN app.staff.display_name IS 'personal data';


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
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: pauseai_backoffice_owner
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO pauseai_backoffice_owner;

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


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
-- Name: invitations_created_by_idx; Type: INDEX; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE INDEX invitations_created_by_idx ON app.invitations USING btree (created_by);


--
-- Name: accounts_user_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX accounts_user_id_idx ON auth.accounts USING btree (user_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


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
-- Name: invitations audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: staff audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.staff FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: staff_roles audit; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER audit AFTER INSERT OR DELETE OR UPDATE ON app.staff_roles FOR EACH ROW EXECUTE FUNCTION private.audit();


--
-- Name: audit_log forbid_mutation; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_mutation BEFORE DELETE OR UPDATE ON app.audit_log FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: audit_log forbid_truncate; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.audit_log FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();


--
-- Name: staff keep_an_admin; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER keep_an_admin AFTER UPDATE OF active ON app.staff FOR EACH ROW WHEN ((old.active AND (NOT new.active))) EXECUTE FUNCTION private.keep_an_admin();


--
-- Name: staff_roles keep_an_admin; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER keep_an_admin AFTER DELETE ON app.staff_roles FOR EACH ROW WHEN ((old.role = 'admin'::app.staff_role)) EXECUTE FUNCTION private.keep_an_admin();


--
-- Name: audit_log stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT ON app.audit_log FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id');


--
-- Name: invitations stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: staff stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.staff FOR EACH ROW EXECUTE FUNCTION private.stamp('created_at');


--
-- Name: staff_roles stamp; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.staff_roles FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at');


--
-- Name: invitations transition; Type: TRIGGER; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER transition BEFORE UPDATE ON app.invitations FOR EACH ROW EXECUTE FUNCTION private.invitation_transition();


--
-- Name: sessions aal2_needs_second_factor; Type: TRIGGER; Schema: auth; Owner: pauseai_backoffice_owner
--

CREATE TRIGGER aal2_needs_second_factor BEFORE INSERT OR UPDATE OF aal ON auth.sessions FOR EACH ROW WHEN ((new.aal = 2)) EXECUTE FUNCTION private.session_needs_second_factor();


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
-- Name: staff staff_invited_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY app.staff
    ADD CONSTRAINT staff_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES app.staff(user_id);


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
-- Name: two_factors two_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: pauseai_backoffice_owner
--

ALTER TABLE ONLY auth.two_factors
    ADD CONSTRAINT two_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: invitations admin_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_delete ON app.invitations FOR DELETE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can) AND ((accepted_at IS NOT NULL) OR (revoked_at IS NOT NULL) OR (expires_at <= now()))));


--
-- Name: staff_roles admin_delete; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_delete ON app.staff_roles FOR DELETE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


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
-- Name: invitations admin_read; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_read ON app.invitations FOR SELECT TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: invitations admin_revoke; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_revoke ON app.invitations FOR UPDATE TO pauseai_backoffice_app USING ((( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can) AND (accepted_at IS NULL) AND (revoked_at IS NULL))) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: staff admin_update; Type: POLICY; Schema: app; Owner: pauseai_backoffice_owner
--

CREATE POLICY admin_update ON app.staff FOR UPDATE TO pauseai_backoffice_app USING (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can)) WITH CHECK (( SELECT private.staff_can(VARIADIC ARRAY['admin'::app.staff_role]) AS staff_can));


--
-- Name: audit_log; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: staff; Type: ROW SECURITY; Schema: app; Owner: pauseai_backoffice_owner
--

ALTER TABLE app.staff ENABLE ROW LEVEL SECURITY;

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
-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: pauseai_backoffice_owner
--

GRANT USAGE ON SCHEMA private TO pauseai_backoffice_app;


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
-- Name: FUNCTION audit(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.audit() FROM PUBLIC;


--
-- Name: FUNCTION bot_can(VARIADIC roles app.staff_role[]); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) FROM PUBLIC;
GRANT ALL ON FUNCTION private.bot_can(VARIADIC roles app.staff_role[]) TO pauseai_backoffice_app;


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
-- Name: FUNCTION forbid_mutation(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.forbid_mutation() FROM PUBLIC;


--
-- Name: FUNCTION invitation_transition(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.invitation_transition() FROM PUBLIC;


--
-- Name: FUNCTION keep_an_admin(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.keep_an_admin() FROM PUBLIC;


--
-- Name: FUNCTION pending_invitation(token_hash text); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.pending_invitation(token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION private.pending_invitation(token_hash text) TO pauseai_backoffice_app;


--
-- Name: FUNCTION session_needs_second_factor(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.session_needs_second_factor() FROM PUBLIC;


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
-- Name: FUNCTION stamp(); Type: ACL; Schema: private; Owner: pauseai_backoffice_owner
--

REVOKE ALL ON FUNCTION private.stamp() FROM PUBLIC;


--
-- Name: TABLE audit_log; Type: ACL; Schema: app; Owner: pauseai_backoffice_owner
--

GRANT SELECT ON TABLE app.audit_log TO pauseai_backoffice_app;


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
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: -; Owner: pauseai_backoffice_owner
--

ALTER DEFAULT PRIVILEGES FOR ROLE pauseai_backoffice_owner REVOKE ALL ON FUNCTIONS FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict schema

