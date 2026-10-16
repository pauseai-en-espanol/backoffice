-- migrate:up

-- A target starts in the queue (PLAN, open from the review): pending, ready or skip, with no send, reply or meeting
-- dated. History that happened outside the app (a sent letter, a reply) comes in only through the importer, which is
-- an admin's; so an outreach volunteer, or a bug in the API, can't make up a letter nobody sent.

DROP POLICY outreach_insert ON app.campaign_targets;
CREATE POLICY outreach_insert ON app.campaign_targets FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((SELECT private.staff_can('admin', 'outreach'))
              AND ((status IN ('pending', 'ready', 'skip')
                    AND sent_at IS NULL AND replied_at IS NULL AND meeting_at IS NULL)
                   OR (SELECT private.staff_can('admin'))));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
