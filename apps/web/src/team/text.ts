import type { getTranslator } from '@backoffice/i18n/messages';

import type { StaffRole } from '@/staff-roles';

type Translator = ReturnType<typeof getTranslator>;

/** Each role's name, as the team and the invitation show it. */
export const roleNames = (t: Translator): Record<StaffRole, string> => ({
  admin: t('roles.admin'),
  onboarding: t('roles.onboarding'),
  outreach: t('roles.outreach'),
});

/** What each role may do, under its checkbox. */
export const roleHelp = (t: Translator): Record<StaffRole, string> => ({
  admin: t('team.roleHelp.admin'),
  onboarding: t('team.roleHelp.onboarding'),
  outreach: t('team.roleHelp.outreach'),
});

/**
 * Every refusal a write on the team page can meet, in Spanish, by the API's code (write.ts messageFor): the shared
 * ones (`errors`), the team's own, and the fields an `invalid` may name.
 */
export const teamErrors = (t: Translator): Record<string, string> => ({
  unexpected: t('errors.unexpected'),
  forbidden: t('errors.forbidden'),
  stale: t('errors.stale'),
  incomplete: t('errors.incomplete'),
  taken: t('errors.taken'),
  linked: t('errors.linked'),
  invalid: t('errors.invalid'),
  limit: t('errors.limit'),
  signIn: t('errors.signIn'),
  notFound: t('errors.notFound'),
  network: t('errors.network'),
  lastAdmin: t('team.errors.lastAdmin'),
  alreadyStaff: t('team.errors.alreadyStaff'),
  mail: t('team.errors.mail'),
  unavailable: t('team.errors.unavailable'),
  notEnrolled: t('team.errors.notEnrolled'),
  email: t('team.errors.email'),
  roles: t('team.errors.roles'),
  displayName: t('team.errors.displayName'),
});
