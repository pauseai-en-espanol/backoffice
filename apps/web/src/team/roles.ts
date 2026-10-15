import { STAFF_ROLES, type StaffRole } from '@/staff-roles';

/** The roles ticked in a form (RoleCheckboxes). */
export const checkedRoles = (form: HTMLFormElement): StaffRole[] =>
  new FormData(form)
    .getAll('roles')
    .filter((role): role is StaffRole => (STAFF_ROLES as readonly unknown[]).includes(role));
