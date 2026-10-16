/**
 * Which runtime role may execute which function in `app`, `private` and `auth`, as "<role> <schema>.<function>(<args>)".
 * Adding an entry requires updating ADR-0002 (closed by default).
 */
export const EXECUTE_ALLOWLIST: readonly string[] = [
  'pauseai_backoffice_app private.accept_invitation(token_hash text)',
  'pauseai_backoffice_app private.anonymise_contact(contact uuid)',
  'pauseai_backoffice_app private.anonymise_person(person uuid)',
  'pauseai_backoffice_app private.bot_can(VARIADIC roles app.staff_role[])',
  'pauseai_backoffice_app private.bot_candidates(arrival_name text, province text, phones text[], emails text[])',
  'pauseai_backoffice_app private.bot_people(scope text, query text, phones text[], emails text[])',
  'pauseai_backoffice_app private.bot_summary()',
  'pauseai_backoffice_app private.claim_person(person uuid)',
  'pauseai_backoffice_app private.current_aal()',
  'pauseai_backoffice_app private.current_channel()',
  'pauseai_backoffice_app private.current_user_id()',
  'pauseai_backoffice_app private.fold_name(input text)',
  'pauseai_backoffice_app private.import_csv(file_sha256 text, rows jsonb)',
  'pauseai_backoffice_app private.merge_people(survivor uuid, merged uuid)',
  'pauseai_backoffice_app private.pending_invitation(token_hash text)',
  'pauseai_backoffice_app private.report_leave(person uuid, left_on date)',
  'pauseai_backoffice_app private.resolve_intake(intake_id uuid, decision text, target uuid)',
  'pauseai_backoffice_app private.staff_can(VARIADIC roles app.staff_role[])',
  'pauseai_backoffice_app private.staff_person_suggestions()',
  'pauseai_backoffice_app private.submit_intake(source app.source_kind, external_id text, payload jsonb, decision text, target uuid)',
  'pauseai_backoffice_app private.team_card(person uuid)',
  'pauseai_backoffice_app private.team_unposted(chat bigint)',
  // The Airtable sync's one function (ADR-0005): nothing else is granted to the ingest role.
  'pauseai_backoffice_ingest private.ingest_airtable(records jsonb)',
  // The census form's (ADR-0002 §7): its lists and greeting, and one answer at a time; nothing else.
  'pauseai_backoffice_public private.census_form(token_hash text)',
  'pauseai_backoffice_public private.submit_census(token_hash text, answer jsonb)',
];

/** SECURITY DEFINER functions allowed in `app`, `private` and `auth` (ADR-0002). */
export const SECURITY_DEFINER_ALLOWLIST: readonly string[] = [
  'private.accept_invitation',
  // Erasure (personal data spec, rights): admins only, through the staff app.
  'private.anonymise_contact',
  'private.anonymise_person',
  'private.audit',
  'private.bot_can',
  // The bot's reads and acts, each checking its caller and channel itself (ADR-0004).
  'private.bot_candidates',
  'private.bot_people',
  'private.bot_summary',
  // The census form's two (ADR-0002 §7), for the public role alone.
  'private.census_form',
  'private.claim_person',
  'private.import_csv',
  'private.ingest_airtable',
  'private.keep_an_admin',
  'private.merge_people',
  'private.pending_invitation',
  'private.report_leave',
  'private.resolve_intake',
  'private.staff_can',
  // A team account's person, suggested by a shared email (PLAN M5): admins only, ids only, reaching `auth`.
  'private.staff_person_suggestions',
  'private.submit_census',
  'private.submit_intake',
  // The bot is the onboarding team's (ADR-0004): codes and links only for it, unlinked when the role or the
  // account goes. Triggers, reading the staff tables for Better Auth's role and reaching `auth` for the app role.
  'private.telegram_needs_onboarding',
  // The team group's posts (ADR-0004): without an actor, only what a post shows, of the last 48 hours' arrivals.
  'private.team_card',
  'private.team_unposted',
  'private.unlink_telegram',
];

/**
 * Policies that admit the Telegram bot (ADR-0004), as "<table> <policy>": each one names private.bot_can on purpose.
 * None: the bot reaches people only through the definer functions of migration intake (bot_people, bot_candidates,
 * submit_intake, claim_person, report_leave), which check the channel themselves and never return contact details.
 */
export const BOT_POLICIES: readonly string[] = [];
