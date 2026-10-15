-- migrate:up

-- Outreach (outreach spec, M3): organisations and the people we want a relationship with, campaigns with their
-- templates, evidence paragraphs ("anchors") and targets, and a timeline per contact. The outreach repo's rules carry
-- over: nothing here sends mail (a person always sends, D8), every claim traces to a source, a contact a tool suggested
-- is reviewed before anyone writes to them, and nobody is addressed by a guessed gender. Outreach staff and admins,
-- through the staff app; never the bot. A contact who asks to be forgotten is anonymised, as a member is (M2).

CREATE TYPE app.organisation_kind AS ENUM (
  'party', 'union', 'ngo', 'university', 'media', 'company', 'public_body', 'association', 'other'
);
-- Where a relationship stands (outreach spec §2): from found to an ally, or not.
CREATE TYPE app.relationship_stage AS ENUM (
  'identified', 'qualified', 'contacted', 'engaged', 'ally', 'declined', 'dormant'
);
-- A contact in a campaign: the outreach CLI's statuses, so its tracking sheets import as they are.
CREATE TYPE app.target_status AS ENUM (
  'pending', 'ready', 'sent', 'replied', 'meeting', 'declined', 'bounced', 'no_response', 'skip'
);
CREATE TYPE app.contact_event_kind AS ENUM (
  'created', 'imported', 'note', 'stage_changed', 'owner_changed', 'status_changed', 'sent', 'reviewed'
);

CREATE TABLE app.organisations (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  name         text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  kind         app.organisation_kind NOT NULL DEFAULT 'other',
  -- State, autonomous community or province, as people write it.
  territory    text CHECK (length(territory) <= 100),
  website      text CHECK (website ~ '^https?://' AND length(website) <= 500),
  notes        text CHECK (length(notes) <= 4000),
  external_ref text UNIQUE CHECK (length(external_ref) <= 200),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN app.organisations.notes IS 'personal data';

-- A contact: a person, or an organisation's own inbox (no person). Professional details only. Every contact says why
-- it matters, with at least one source, unless it still needs review (imported or suggested by a tool).
CREATE TABLE app.contacts (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  organisation_id  uuid REFERENCES app.organisations (id),
  -- How the organisation reads in a listing, e.g. "Sindicato Ejemplo — Aragón".
  org_display      text NOT NULL CHECK (btrim(org_display) <> '' AND length(org_display) <= 300),
  person_name      text CHECK (length(person_name) <= 200),
  role             text CHECK (length(role) <= 200),
  -- How the greeting addresses them: neutral ("Estimado/a") unless a person has verified it. Never inferred.
  treatment        text NOT NULL DEFAULT 'neutral' CHECK (treatment IN ('neutral', 'masculino', 'femenino')),
  greeting_name    text CHECK (length(greeting_name) <= 200),
  email            text CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  emails_extra     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(emails_extra) <= 10),
  phone            text CHECK (phone ~ '^\+[1-9][0-9]{6,14}$'),
  website          text CHECK (website ~ '^https?://' AND length(website) <= 500),
  territory        text CHECK (length(territory) <= 100),
  scope            text CHECK (length(scope) <= 50),
  sector           text CHECK (length(sector) <= 100),
  -- A for state-level decision-makers, B for everyone else (outreach guidelines).
  tier             text NOT NULL DEFAULT 'B' CHECK (tier IN ('A', 'B')),
  -- The evidence paragraph a campaign uses for them, by its key.
  anchor           text CHECK (anchor ~ '^[a-z0-9_-]{1,60}$'),
  tags             text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 30),
  stage            app.relationship_stage NOT NULL DEFAULT 'identified',
  owner_id         uuid REFERENCES app.staff (user_id),
  reason           text CHECK (length(reason) <= 2000),
  sources          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(sources) <= 30),
  needs_review     boolean NOT NULL DEFAULT false,
  -- Curated, but deliberately kept out of every send set: a personal address, someone another team owns.
  hold             boolean NOT NULL DEFAULT false,
  hold_reason      text CHECK (length(hold_reason) <= 500),
  notes            text CHECK (length(notes) <= 4000),
  external_ref     text UNIQUE CHECK (length(external_ref) <= 200),
  anonymised_at    timestamptz,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (needs_review OR (btrim(coalesce(reason, '')) <> '' AND cardinality(sources) > 0))
);
COMMENT ON COLUMN app.contacts.person_name IS 'personal data';
COMMENT ON COLUMN app.contacts.greeting_name IS 'personal data';
COMMENT ON COLUMN app.contacts.email IS 'personal data';
COMMENT ON COLUMN app.contacts.emails_extra IS 'personal data';
COMMENT ON COLUMN app.contacts.phone IS 'personal data';
COMMENT ON COLUMN app.contacts.notes IS 'personal data';
CREATE INDEX contacts_organisation_id_idx ON app.contacts (organisation_id);

CREATE TABLE app.campaigns (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80),
  name          text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 200),
  goal          text CHECK (length(goal) <= 2000),
  language      text NOT NULL DEFAULT 'es' CHECK (language ~ '^[a-z]{2}$'),
  from_name     text CHECK (length(from_name) <= 200),
  from_email    text CHECK (from_email = lower(from_email) AND from_email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  -- Appended verbatim as {{firma}}.
  signature     text NOT NULL DEFAULT '' CHECK (length(signature) <= 2000),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  owner_id      uuid REFERENCES app.staff (user_id),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- A campaign's letter for a tier: a subject and body with {{fields}}, a soft word limit, and the sources of the claims
-- the template itself makes. Its version goes up with every change to the subject or body, and a sent target records
-- the version it was written from.
CREATE TABLE app.campaign_templates (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  campaign_id  uuid NOT NULL REFERENCES app.campaigns (id),
  tier         text NOT NULL CHECK (tier IN ('A', 'B')),
  subject      text NOT NULL CHECK (btrim(subject) <> '' AND length(subject) <= 300),
  body         text NOT NULL CHECK (btrim(body) <> '' AND length(body) <= 40000),
  max_words    integer CHECK (max_words > 0),
  sources      text[] NOT NULL DEFAULT '{}' CHECK (cardinality(sources) <= 50),
  notes        text CHECK (length(notes) <= 4000),
  version      integer NOT NULL DEFAULT 1,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, tier)
);

-- Evidence paragraphs, one dropped into each letter as {{anchor}}: every figure traces to a source.
CREATE TABLE app.campaign_anchors (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  campaign_id  uuid NOT NULL REFERENCES app.campaigns (id),
  key          text NOT NULL CHECK (key ~ '^[a-z0-9_-]{1,60}$'),
  label        text NOT NULL CHECK (btrim(label) <> '' AND length(label) <= 200),
  text         text NOT NULL CHECK (btrim(text) <> '' AND length(text) <= 4000),
  sources      text[] NOT NULL CHECK (cardinality(sources) BETWEEN 1 AND 30),
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, key)
);

-- A contact in a campaign (outreach spec §2): its status, owner, priority (1 goes first; none sorts last), next
-- action and dates. Nobody is made ready or sent to while their contact needs review or is on hold; a target that
-- arrives already sent is history (the importer's), not a send.
CREATE TABLE app.campaign_targets (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  campaign_id      uuid NOT NULL REFERENCES app.campaigns (id),
  contact_id       uuid NOT NULL REFERENCES app.contacts (id),
  status           app.target_status NOT NULL DEFAULT 'pending',
  owner_id         uuid REFERENCES app.staff (user_id),
  priority         integer CHECK (priority > 0),
  anchor           text CHECK (anchor ~ '^[a-z0-9_-]{1,60}$'),
  next_action      text CHECK (length(next_action) <= 300),
  next_action_due  date,
  sent_at          timestamptz,
  template_version integer,
  replied_at       timestamptz,
  meeting_at       timestamptz,
  notes            text CHECK (length(notes) <= 4000),
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);
COMMENT ON COLUMN app.campaign_targets.next_action IS 'personal data';
COMMENT ON COLUMN app.campaign_targets.notes IS 'personal data';
CREATE INDEX campaign_targets_contact_id_idx ON app.campaign_targets (contact_id);

-- The outreach timeline: append-only, as onboarding's.
CREATE TABLE app.contact_events (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  contact_id   uuid NOT NULL REFERENCES app.contacts (id),
  campaign_id  uuid REFERENCES app.campaigns (id),
  kind         app.contact_event_kind NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  channel      text CHECK (channel IN ('web', 'bot')),
  body         text CHECK (length(body) <= 4000),
  data         jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(data) = 'object')
);
COMMENT ON COLUMN app.contact_events.body IS 'personal data';
CREATE INDEX contact_events_contact_id_idx ON app.contact_events (contact_id, created_at DESC);

-- A contact's stage, owner and review write their events; a target's status its own, and its dates.
CREATE FUNCTION private.contact_timeline() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO app.contact_events (contact_id, kind, data)
      VALUES (NEW.id, CASE WHEN NEW.external_ref IS NULL THEN 'created'::app.contact_event_kind ELSE 'imported' END,
              jsonb_build_object('stage', NEW.stage));
      RETURN NULL;
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

CREATE FUNCTION private.target_rules() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.status IN ('ready', 'sent') AND (TG_OP = 'UPDATE' OR NEW.status = 'ready')
       AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
       AND EXISTS (SELECT 1 FROM app.contacts c
                    WHERE c.id = NEW.contact_id AND (c.needs_review OR c.hold OR c.anonymised_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'contact not ready' USING ERRCODE = 'check_violation', HINT = 'needsReview';
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

CREATE FUNCTION private.template_version() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF NEW.subject IS DISTINCT FROM OLD.subject OR NEW.body IS DISTINCT FROM OLD.body THEN
      NEW.version := OLD.version + 1;
    END IF;
    RETURN NEW;
  END
  $$;

CREATE FUNCTION private.target_timeline() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
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

CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.organisations
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.organisations
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.contacts
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER timeline AFTER INSERT OR UPDATE ON app.contacts
  FOR EACH ROW EXECUTE FUNCTION private.contact_timeline();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.contacts
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaigns
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.campaigns
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaign_templates
  FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');
CREATE TRIGGER version BEFORE UPDATE ON app.campaign_templates
  FOR EACH ROW EXECUTE FUNCTION private.template_version();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.campaign_templates
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaign_anchors
  FOR EACH ROW EXECUTE FUNCTION private.stamp('updated_by', 'updated_at');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.campaign_anchors
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT OR UPDATE ON app.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION private.stamp('created_by', 'created_at', 'updated_by', 'updated_at');
CREATE TRIGGER rules BEFORE INSERT OR UPDATE ON app.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION private.target_rules();
CREATE TRIGGER timeline AFTER UPDATE ON app.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION private.target_timeline();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.campaign_targets
  FOR EACH ROW EXECUTE FUNCTION private.audit();
CREATE TRIGGER stamp BEFORE INSERT ON app.contact_events
  FOR EACH ROW EXECUTE FUNCTION private.stamp('actor_id', 'created_at');
CREATE TRIGGER stamp_channel BEFORE INSERT ON app.contact_events
  FOR EACH ROW EXECUTE FUNCTION private.stamp_channel();
CREATE TRIGGER forbid_mutation BEFORE UPDATE OR DELETE ON app.contact_events
  FOR EACH ROW EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER forbid_truncate BEFORE TRUNCATE ON app.contact_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_mutation();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON app.contact_events
  FOR EACH ROW EXECUTE FUNCTION private.audit();

-- Grants and policies: outreach staff and admins, through the staff app ------------------------------------------

ALTER TABLE app.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.campaign_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.contact_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT (name, kind, territory, website, notes, external_ref),
      UPDATE (name, kind, territory, website, notes)
  ON app.organisations TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.organisations FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.organisations FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_update ON app.organisations FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));

GRANT SELECT,
      INSERT (organisation_id, org_display, person_name, role, treatment, greeting_name, email, emails_extra, phone,
              website, territory, scope, sector, tier, anchor, tags, stage, owner_id, reason, sources, needs_review,
              hold, hold_reason, notes, external_ref),
      UPDATE (organisation_id, org_display, person_name, role, treatment, greeting_name, email, emails_extra, phone,
              website, territory, scope, sector, tier, anchor, tags, stage, owner_id, reason, sources, needs_review,
              hold, hold_reason, notes)
  ON app.contacts TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.contacts FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.contacts FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
-- An anonymised contact stays as it was left.
CREATE POLICY outreach_update ON app.contacts FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')) AND anonymised_at IS NULL)
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));

GRANT SELECT, INSERT (slug, name, goal, language, from_name, from_email, signature, status, owner_id),
      UPDATE (name, goal, language, from_name, from_email, signature, status, owner_id)
  ON app.campaigns TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.campaigns FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.campaigns FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_update ON app.campaigns FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));

GRANT SELECT, INSERT (campaign_id, tier, subject, body, max_words, sources, notes),
      UPDATE (subject, body, max_words, sources, notes)
  ON app.campaign_templates TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.campaign_templates FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.campaign_templates FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_update ON app.campaign_templates FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));

GRANT SELECT, INSERT (campaign_id, key, label, text, sources), UPDATE (label, text, sources)
  ON app.campaign_anchors TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.campaign_anchors FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.campaign_anchors FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_update ON app.campaign_anchors FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));

GRANT SELECT, DELETE,
      INSERT (campaign_id, contact_id, status, owner_id, priority, anchor, next_action, next_action_due, sent_at,
              template_version, replied_at, meeting_at, notes),
      UPDATE (status, owner_id, priority, anchor, next_action, next_action_due, template_version, notes)
  ON app.campaign_targets TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.campaign_targets FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.campaign_targets FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_update ON app.campaign_targets FOR UPDATE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')))
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach')));
-- A target nobody has written to yet may be taken out of a campaign; one with history stays.
CREATE POLICY outreach_delete ON app.campaign_targets FOR DELETE TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')) AND status IN ('pending', 'ready', 'skip'));

GRANT SELECT, INSERT (contact_id, campaign_id, kind, body, data) ON app.contact_events TO pauseai_backoffice_app;
CREATE POLICY outreach_read ON app.contact_events FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'outreach')));
CREATE POLICY outreach_insert ON app.contact_events FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND (kind = 'note' OR pg_catalog.pg_trigger_depth() > 0));

-- Erasure for a contact (personal data spec, rights): the person's details, notes and timeline text go; the
-- organisation, the fact they were in a campaign and its status stay, and they are held so nobody writes again.
CREATE FUNCTION private.anonymise_contact(contact uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
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
    PERFORM set_config('app.redact', 'on', true);
    UPDATE app.contact_events e SET body = NULL WHERE e.contact_id = contact;
    PERFORM set_config('app.redact', '', true);
    UPDATE app.campaign_targets t SET notes = NULL, next_action = NULL, next_action_due = NULL
     WHERE t.contact_id = contact;
    UPDATE app.contacts c
       SET person_name = NULL, greeting_name = NULL, treatment = 'neutral', email = NULL, emails_extra = '{}',
           phone = NULL, notes = NULL, hold = true, hold_reason = NULL, owner_id = NULL, anonymised_at = now()
     WHERE c.id = contact;
    RETURN true;
  END
  $$;
GRANT EXECUTE ON FUNCTION private.anonymise_contact(uuid) TO pauseai_backoffice_app;

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
