-- migrate:up

-- Onboarding's vocabulary (onboarding spec; data model spec), the trigram extension that matching uses, and the
-- settings admins edit. Identifiers are English; labels are Spanish, in packages/i18n.

-- pg_trgm for typo-tolerant names (onboarding spec, matching). A trusted extension: the database's owner may create
-- it. In a schema of its own, so its functions stay out of app and private, whose catalog tests they would fail.
CREATE SCHEMA extensions;
REVOKE ALL ON SCHEMA extensions FROM PUBLIC;
CREATE EXTENSION pg_trgm SCHEMA extensions;
-- A trusted extension's objects belong to the bootstrap superuser, so the owner can't take PUBLIC's EXECUTE off its
-- functions (pure functions over text). The schema is what's closed instead: only the app role may look in it, so
-- staff can search people by name (Personas); the catalog tests keep it that way.
GRANT USAGE ON SCHEMA extensions TO pauseai_backoffice_app;
GRANT EXECUTE ON FUNCTION extensions.similarity(text, text) TO pauseai_backoffice_app;

CREATE TYPE app.stage AS ENUM (
  'to_triage', 'new', 'contacting', 'talking', 'welcomed', 'active', 'dormant', 'unresponsive', 'left', 'discarded'
);
CREATE TYPE app.identity_kind AS ENUM ('email', 'phone', 'airtable');
CREATE TYPE app.source_kind AS ENUM ('airtable', 'telegram', 'census', 'manual', 'csv');
CREATE TYPE app.availability AS ENUM ('occasional', 'under_2h', 'from_2_to_5h', 'over_5h');
CREATE TYPE app.contact_channel AS ENUM ('whatsapp', 'phone', 'email', 'telegram', 'in_person', 'other');
CREATE TYPE app.contact_outcome AS ENUM ('no_answer', 'replied', 'left_message', 'wrong_number', 'declined');
CREATE TYPE app.event_kind AS ENUM (
  'created', 'note', 'contact_attempt', 'stage_changed', 'owner_changed', 'next_action_set', 'joined', 'left',
  'reported', 'imported', 'merged', 'profile_updated', 'form_submitted'
);
-- An intake record's state: waiting; attached to a person or made one; waiting for a person's decision in the
-- Bandeja (a possible duplicate, or values that disagree with the person's); or discarded.
CREATE TYPE app.intake_status AS ENUM ('pending', 'attached', 'created', 'review', 'conflict', 'discarded');

-- A name for comparing, never for showing: lowercase, the accents of Spain's languages and Portuguese folded, anything
-- but letters and digits as one space. Must stay identical to foldName() in @backoffice/domain (identities.ts); the
-- database tests check both on the same names.
CREATE FUNCTION private.fold_name(input text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = ''
  AS $$
    SELECT btrim(regexp_replace(
      translate(lower(normalize(input, NFC)), 'áéíóúüñàèìòùâêîôûäëïöçãõ·', 'aeiouunaeiouaeiouaeiocao '),
      '[^[:alnum:]]+', ' ', 'g'))
  $$;
GRANT EXECUTE ON FUNCTION private.fold_name(text) TO pauseai_backoffice_app;

-- Settings (onboarding spec: thresholds live in settings, not in code). One row, made here; admins change it.
CREATE TABLE app.settings (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- "Toca seguimiento": a person in `contacting` whose last attempt is older than this.
  follow_up_days         integer NOT NULL DEFAULT 5 CHECK (follow_up_days BETWEEN 1 AND 60),
  -- Moved to `unresponsive` after this many attempts over at least this many days, without a reply.
  unresponsive_attempts  integer NOT NULL DEFAULT 3 CHECK (unresponsive_attempts BETWEEN 1 AND 20),
  unresponsive_days      integer NOT NULL DEFAULT 14 CHECK (unresponsive_days BETWEEN 1 AND 180),
  -- The Panel's "unassigned for too long", and the digest's.
  unassigned_alert_hours integer NOT NULL DEFAULT 48 CHECK (unassigned_alert_hours BETWEEN 1 AND 720),
  -- How alike two names must be (0 to 1, pg_trgm's similarity of the folded names) to be a possible duplicate.
  match_threshold        numeric(3, 2) NOT NULL DEFAULT 0.55 CHECK (match_threshold BETWEEN 0.3 AND 1),
  -- The community's chats, for the bot's picker; a free-text chat name works too.
  community_chats        text[] NOT NULL DEFAULT '{}'
                         CHECK (cardinality(community_chats) <= 100 AND array_position(community_chats, NULL) IS NULL),
  updated_by             uuid,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app.settings DEFAULT VALUES;

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.settings
  FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.settings
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Every staff member reads the settings; admins change them.
ALTER TABLE app.settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON app.settings TO pauseai_backoffice_app;
GRANT UPDATE (follow_up_days, unresponsive_attempts, unresponsive_days, unassigned_alert_hours, match_threshold,
              community_chats)
  ON app.settings TO pauseai_backoffice_app;
CREATE POLICY staff_read ON app.settings FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding', 'outreach')));
CREATE POLICY admin_update ON app.settings FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin')))
  WITH CHECK ((SELECT private.staff_can('admin')));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
