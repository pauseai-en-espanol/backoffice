-- migrate:up

-- Each onboarder's own messages (PLAN R71; Dani, 2026-10-21: "i want members of the onboarding team to be able to use
-- their own messages (and the default one still be editable by someone)"). A message in Mensajes is the team's, as
-- every one was until now, or its writer's own (`private_to`), which they alone see, offer and change: not the rest of
-- the team, nor admins. Opening WhatsApp offers one's own in use first, then the team's.
-- - The team's are written by admins only now (the forward migration R39 foresaw): they're what everyone is offered,
--   so no one onboarder changes what the rest send. Those written until now stay the team's.
-- - A message is the team's or someone's for good: `private_to` is set when it's written, never after.
-- - A title is unique among the team's, and among each person's own, by purpose.
-- - The triggers that check which message went out (a contact attempt, a census link) run as the writer, who sees the
--   team's and their own only: no one names someone else's.
ALTER TABLE app.message_templates ADD COLUMN private_to uuid REFERENCES app.staff (user_id);
CREATE INDEX message_templates_private_to_idx ON app.message_templates (private_to) WHERE private_to IS NOT NULL;

ALTER TABLE app.message_templates
  DROP CONSTRAINT message_templates_purpose_title_key,
  ADD CONSTRAINT message_templates_purpose_private_to_title_key UNIQUE NULLS NOT DISTINCT (purpose, private_to, title);

GRANT INSERT (private_to) ON app.message_templates TO pauseai_backoffice_app;

DROP POLICY onboarding_read ON app.message_templates;
CREATE POLICY onboarding_read ON app.message_templates FOR SELECT TO pauseai_backoffice_app
  USING ((SELECT private.staff_can('admin', 'onboarding'))
         AND (private_to IS NULL OR private_to = (SELECT private.current_user_id())));
DROP POLICY onboarding_insert ON app.message_templates;
CREATE POLICY team_or_own_insert ON app.message_templates FOR INSERT TO pauseai_backoffice_app
  WITH CHECK ((private_to IS NULL AND (SELECT private.staff_can('admin')))
              OR (private_to = (SELECT private.current_user_id())
                  AND (SELECT private.staff_can('admin', 'onboarding'))));
DROP POLICY onboarding_update ON app.message_templates;
CREATE POLICY team_or_own_update ON app.message_templates FOR UPDATE TO pauseai_backoffice_app
  USING ((private_to IS NULL AND (SELECT private.staff_can('admin')))
         OR (private_to = (SELECT private.current_user_id())
             AND (SELECT private.staff_can('admin', 'onboarding'))))
  WITH CHECK ((private_to IS NULL AND (SELECT private.staff_can('admin')))
              OR (private_to = (SELECT private.current_user_id())
                  AND (SELECT private.staff_can('admin', 'onboarding'))));

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
