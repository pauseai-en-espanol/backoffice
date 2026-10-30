import type { StaffRole } from '@/staff-roles';

/** A section of the staff app: its address, and the key of its name under `web.nav`. */
export interface NavItem {
  href: string;
  label:
    | 'today'
    | 'people'
    | 'board'
    | 'add'
    | 'bandeja'
    | 'imports'
    | 'panel'
    | 'census'
    | 'messages'
    | 'next'
    | 'campaigns'
    | 'contacts'
    | 'organisations'
    | 'movements'
    | 'newMovement'
    | 'reports'
    | 'chart'
    | 'years'
    | 'team'
    | 'audit';
}

/** A group of sections in the menu, named under `web.nav` (groupOnboarding, groupOutreach, groupBooks, groupTeam). */
export interface NavGroup {
  id: 'onboarding' | 'outreach' | 'books' | 'team';
  items: NavItem[];
}

/**
 * The menu's groups for a staff member's roles (PLAN M5): Onboarding to onboarding staff and admins, Relaciones
 * externas to outreach staff and admins, Cuentas to tesorería and admins (Nuevo movimiento to tesorería only, which
 * alone records; ADR-0006), Equipo to everyone (Registro in it to admins only). Censo is listed only while
 * the census form is configured (CENSUS_URL): with it off there is nothing to send or to read there. Mensajes, the
 * WhatsApp messages the team writes, closes Onboarding. Ajustes and Salir follow the groups, for everyone.
 */
export const navGroups = (
  roles: readonly StaffRole[],
  { census }: { census: boolean },
): NavGroup[] => {
  const admin = roles.includes('admin');
  const onboarding = admin || roles.includes('onboarding');
  const outreach = admin || roles.includes('outreach');
  const keepsBooks = roles.includes('tesoreria');
  const groups: NavGroup[] = [];
  if (onboarding) {
    groups.push({
      id: 'onboarding',
      items: [
        { href: '/', label: 'today' },
        { href: '/personas', label: 'people' },
        { href: '/pipeline', label: 'board' },
        { href: '/anadir', label: 'add' },
        { href: '/bandeja', label: 'bandeja' },
        { href: '/importar', label: 'imports' },
        { href: '/panel', label: 'panel' },
        ...(census ? [{ href: '/censo', label: 'census' } as const] : []),
        { href: '/mensajes', label: 'messages' },
      ],
    });
  }
  if (outreach) {
    groups.push({
      id: 'outreach',
      items: [
        { href: '/siguiente', label: 'next' },
        { href: '/campanas', label: 'campaigns' },
        { href: '/contactos', label: 'contacts' },
        { href: '/organizaciones', label: 'organisations' },
      ],
    });
  }
  if (admin || keepsBooks) {
    groups.push({
      id: 'books',
      items: [
        { href: '/cuentas', label: 'movements' },
        ...(keepsBooks ? [{ href: '/cuentas/nuevo', label: 'newMovement' } as const] : []),
        { href: '/cuentas/informes', label: 'reports' },
        { href: '/cuentas/plan', label: 'chart' },
        { href: '/cuentas/ejercicios', label: 'years' },
      ],
    });
  }
  groups.push({
    id: 'team',
    items: [
      { href: '/equipo', label: 'team' },
      ...(admin ? [{ href: '/registro', label: 'audit' } as const] : []),
    ],
  });
  return groups;
};
