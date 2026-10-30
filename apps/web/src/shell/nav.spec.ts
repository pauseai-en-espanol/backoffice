import { describe, expect, it } from 'vitest';

import { currentHref, navGroups } from './nav';

const groups = (roles: Parameters<typeof navGroups>[0], census = true) =>
  navGroups(roles, { census }).map((group) => ({
    id: group.id,
    hrefs: group.items.map((item) => item.href),
  }));

describe('the menu in groups by role (PLAN M5)', () => {
  it('gives an admin every group, Registro included', () => {
    expect(groups(['admin'])).toEqual([
      {
        id: 'onboarding',
        hrefs: [
          '/',
          '/personas',
          '/pipeline',
          '/anadir',
          '/bandeja',
          '/importar',
          '/panel',
          '/censo',
          '/mensajes',
        ],
      },
      { id: 'outreach', hrefs: ['/siguiente', '/campanas', '/contactos', '/organizaciones'] },
      // Admins read the books, and record nothing in them unless they hold Tesorería too (ADR-0006).
      {
        id: 'books',
        hrefs: ['/cuentas', '/cuentas/informes', '/cuentas/plan', '/cuentas/ejercicios'],
      },
      { id: 'team', hrefs: ['/equipo', '/registro'] },
    ]);
  });

  it('gives tesorería Cuentas, Nuevo movimiento included, and Equipo, nothing else', () => {
    expect(groups(['tesoreria'])).toEqual([
      {
        id: 'books',
        hrefs: [
          '/cuentas',
          '/cuentas/nuevo',
          '/cuentas/informes',
          '/cuentas/plan',
          '/cuentas/ejercicios',
        ],
      },
      { id: 'team', hrefs: ['/equipo'] },
    ]);
    expect(groups(['admin', 'tesoreria']).find((group) => group.id === 'books')?.hrefs).toContain(
      '/cuentas/nuevo',
    );
  });

  it('gives onboarding staff Onboarding and Equipo, without Relaciones externas or Registro', () => {
    expect(groups(['onboarding']).map((group) => group.id)).toEqual(['onboarding', 'team']);
    expect(groups(['onboarding']).at(-1)?.hrefs).toEqual(['/equipo']);
  });

  it('gives outreach staff Relaciones externas and Equipo, without Onboarding', () => {
    expect(groups(['outreach']).map((group) => group.id)).toEqual(['outreach', 'team']);
  });

  it('gives both groups to someone with both roles', () => {
    expect(groups(['onboarding', 'outreach']).map((group) => group.id)).toEqual([
      'onboarding',
      'outreach',
      'team',
    ]);
  });

  it('lists Censo only while the census form is configured', () => {
    expect(groups(['onboarding'], false)[0]?.hrefs).not.toContain('/censo');
    expect(groups(['admin'], false)[0]?.hrefs).not.toContain('/censo');
    expect(groups(['onboarding'], true)[0]?.hrefs).toContain('/censo');
  });

  it('leaves staff with no role only Equipo', () => {
    expect(groups([])).toEqual([{ id: 'team', hrefs: ['/equipo'] }]);
  });
});

describe('the section a page is in', () => {
  const hrefs = [
    '/',
    '/personas',
    '/cuentas',
    '/cuentas/informes',
    '/cuentas/ejercicios',
    '/ajustes',
  ];

  it('is the nearest of the menu’s links, not the first that starts the same', () => {
    expect(currentHref('/cuentas/ejercicios', hrefs)).toBe('/cuentas/ejercicios');
    expect(currentHref('/cuentas/informes', hrefs)).toBe('/cuentas/informes');
    expect(currentHref('/cuentas', hrefs)).toBe('/cuentas');
  });

  it('takes in the pages under a section, and the books’ pages outside the menu under Movimientos', () => {
    expect(currentHref('/personas/0190f8c4-0000-7000-8000-000000000001', hrefs)).toBe('/personas');
    expect(currentHref('/cuentas/0190f8c4-0000-7000-8000-0000000006d4', hrefs)).toBe('/cuentas');
    expect(currentHref('/cuentas/banco', hrefs)).toBe('/cuentas');
  });

  it('is Hoy only on Hoy, and nothing for a page in no section', () => {
    expect(currentHref('/', hrefs)).toBe('/');
    expect(currentHref('/cuentasx', hrefs)).toBeUndefined();
    expect(currentHref('/equipo', hrefs)).toBeUndefined();
  });
});
