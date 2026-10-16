import { describe, expect, it } from 'vitest';

import { navGroups } from './nav';

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
        ],
      },
      { id: 'outreach', hrefs: ['/siguiente', '/campanas', '/contactos', '/organizaciones'] },
      { id: 'team', hrefs: ['/equipo', '/registro'] },
    ]);
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
