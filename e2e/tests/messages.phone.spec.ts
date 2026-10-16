import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * Writing a message on a phone (Mensajes, PLAN M5): the editor, its problems and its previews fit the screen without
 * sideways scrolling, a long link included, and pass axe. Nothing is saved.
 */
test('a message is written on a phone without sideways scrolling', async ({ page }) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/mensajes');
  const census = page.getByRole('region', { name: 'Enlace del censo' });
  await census.getByRole('button', { name: 'Escribir un mensaje de Enlace del censo' }).click();
  await census.getByLabel('Título').fill('Censo largo');
  await census
    .getByLabel('Mensaje', { exact: true })
    .fill(
      'Hola, {nombre}: soy {yo}. Más en https://ejemplo.test/una/direccion/muy/larga/que/no/cabe/en/un/telefono {url}',
    );
  await expect(census.getByText('Antes de guardar:')).toBeVisible();
  await expect(census.getByText('Tiene que llevar {enlace}', { exact: false })).toBeVisible();
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow, `Mensajes scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  await expectAccessible(page);
});
