/**
 * The staff roles (ADR-0002; tesorería, ADR-0006). Roles combine: one account may hold several. Usable from server and
 * client code.
 */
export const STAFF_ROLES = ['admin', 'onboarding', 'outreach', 'tesoreria'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
