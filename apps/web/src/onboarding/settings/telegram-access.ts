/**
 * Whether a staff member may connect the Telegram bot: the onboarding role alone, not admin without it (Dani,
 * 2026-10-16; ADR-0004). The API and the database refuse anyone else; this only decides what Ajustes offers.
 */
export const usesTelegramBot = (roles: readonly string[]): boolean => roles.includes('onboarding');
