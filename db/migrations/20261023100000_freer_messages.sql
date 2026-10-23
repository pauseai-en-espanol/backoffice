-- migrate:up

-- Messages longer, and their version for someone without a name optional (PLAN R76; Dani, 2026-10-23: "i think the
-- without name messages should not be mandatory", "the cap on the messages is too small i might want longer texts").
-- - Up to 10,000 characters, a message and its version without a name alike (2,000 until now).
-- - A message that uses {nombre} may say how it reads for someone without a name, or not: without it, the apps send
--   the message with {nombre} taken out ("Hola, {nombre}:" reads "Hola:"), as their editor previews. What it says
--   still never names anyone, and a message that names nobody still takes no second version.
ALTER TABLE app.message_templates
  DROP CONSTRAINT message_templates_body_check,
  ADD CONSTRAINT message_templates_body_check CHECK (btrim(body) <> '' AND length(body) <= 10000),
  DROP CONSTRAINT message_templates_body_nameless_check,
  ADD CONSTRAINT message_templates_body_nameless_check
    CHECK (btrim(body_nameless) <> '' AND length(body_nameless) <= 10000),
  DROP CONSTRAINT message_templates_nameless_check,
  ADD CONSTRAINT message_templates_nameless_check CHECK (
    CASE WHEN strpos(body, '{nombre}') > 0
         THEN body_nameless IS NULL OR strpos(body_nameless, '{nombre}') = 0
         ELSE body_nameless IS NULL END);

-- migrate:down
-- Forward-only: migrations are never rolled back. Recover by restoring a backup (ADR-0001).
