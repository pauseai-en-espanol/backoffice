import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * Cards that say who someone is (PLAN M5, step 4): the name with the province, the team's one-line summary, and what
 * is missing in plain words, on the person's page and on their card in Personas, on a phone's screen.
 */
test('a card says who someone is and what is missing, and fits a phone’s screen', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/anadir');
  const name = uniqueName();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Teléfono').fill(phone());
  await page.getByRole('combobox', { name: 'Provincia o región' }).fill('Provincia de ejemplo');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
  await expect(page.getByText('Falta: correo · qué quiere hacer')).toBeVisible();

  await page.getByRole('button', { name: 'Editar el perfil' }).click();
  await page.getByLabel('Resumen interno').fill('Quiere ayudar con las redes');
  await page.getByRole('button', { name: 'Guardar el perfil' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  await expect(page.getByText('Quiere ayudar con las redes')).toBeVisible();

  await page.goto(`/personas?q=${encodeURIComponent(name)}`);
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(card).toContainText(`${name} (Provincia de ejemplo)`);
  await expect(card).toContainText('Quiere ayudar con las redes');
  await expect(card).toContainText('Falta: correo · qué quiere hacer');

  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow, `Personas scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  await expectAccessible(page);
});
