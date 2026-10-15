/**
 * Which runtime role may execute which function in `app`, `private` and `auth`, as "<role> <schema>.<function>(<args>)".
 * Adding an entry requires updating ADR-0002 (closed by default).
 */
export const EXECUTE_ALLOWLIST: readonly string[] = [
  'pauseai_backoffice_app private.accept_invitation(token_hash text)',
  'pauseai_backoffice_app private.bot_can(VARIADIC roles app.staff_role[])',
  'pauseai_backoffice_app private.current_aal()',
  'pauseai_backoffice_app private.current_channel()',
  'pauseai_backoffice_app private.current_user_id()',
  'pauseai_backoffice_app private.pending_invitation(token_hash text)',
  'pauseai_backoffice_app private.staff_can(VARIADIC roles app.staff_role[])',
];

/** SECURITY DEFINER functions allowed in `app`, `private` and `auth` (ADR-0002). */
export const SECURITY_DEFINER_ALLOWLIST: readonly string[] = [
  'private.accept_invitation',
  'private.audit',
  'private.bot_can',
  'private.keep_an_admin',
  'private.pending_invitation',
  'private.staff_can',
];

/**
 * Policies that admit the Telegram bot (ADR-0004), as "<table> <policy>": each one names private.bot_can on purpose.
 * Empty until M1, when the bot's commands get what they need.
 */
export const BOT_POLICIES: readonly string[] = [];
