import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * The menu in groups by role (PLAN M5): each group's list named by its label, only the groups a role opens, the
 * current page marked. On a computer the groups are a sidebar, always shown.
 */
test('onboarding staff see the Onboarding group, Censo in it, and not Relaciones externas', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/personas');
  const menu = page.getByRole('navigation', { name: 'Secciones' });
  const onboarding = menu.getByRole('list', { name: 'Onboarding' });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByRole('link', { name: 'Personas' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // The e2e servers configure the census form, so Censo is listed (its absence is nav.spec.ts's).
  await expect(onboarding.getByRole('link', { name: 'Censo' })).toBeVisible();
  await expect(menu.getByRole('list', { name: 'Relaciones externas' })).toHaveCount(0);
  await expect(menu.getByRole('list', { name: 'Equipo' }).getByRole('link')).toHaveText(['Equipo']);
  await expect(menu.getByRole('link', { name: 'Ajustes' })).toBeVisible();
  await expectAccessible(page);
});

test('outreach staff see Relaciones externas, and not the Onboarding group', async ({ page }) => {
  await signedInStaff(page, ['outreach']);
  await page.goto('/contactos');
  const menu = page.getByRole('navigation', { name: 'Secciones' });
  await expect(menu.getByRole('list', { name: 'Relaciones externas' })).toBeVisible();
  await expect(menu.getByRole('list', { name: 'Onboarding' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Contactos' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expectAccessible(page);
});

test('an admin sees every group, Registro included, all of it on a laptop’s screen', async ({
  page,
}) => {
  await signedInStaff(page, ['admin']);
  await page.goto('/equipo');
  const menu = page.getByRole('navigation', { name: 'Secciones' });
  for (const group of ['Onboarding', 'Relaciones externas', 'Equipo']) {
    await expect(menu.getByRole('list', { name: group })).toBeVisible();
  }
  await expect(menu.getByRole('list', { name: 'Equipo' }).getByRole('link')).toHaveText([
    'Equipo',
    'Registro',
  ]);
  // The longest menu there is (every group, Censo too) fits 1280×720 without scrolling, Ajustes and Salir included.
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  await expect(menu.getByRole('link', { name: 'Ajustes' })).toBeInViewport({ ratio: 1 });
  await expect(menu.getByRole('button', { name: 'Salir' })).toBeInViewport({ ratio: 1 });
});
