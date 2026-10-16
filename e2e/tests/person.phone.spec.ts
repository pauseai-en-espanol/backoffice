import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * A person's page on a phone: what the bot's "Abrir" opens, from the team group or a private chat. It fits the screen
 * without sideways scrolling, passes axe, and its owner controls work there.
 */
test('a person’s page fits a phone’s screen, passes axe, and can be claimed there', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/anadir');
  const name = uniqueName();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Teléfono').fill(phone());
  await page.getByLabel('Provincia').fill('Provincia de ejemplo');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(overflow, `the person's page scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  await expectAccessible(page);

  // What is done most is on the first screen (PLAN M5): claiming, WhatsApp and the stage.
  const claim = page.getByRole('button', { name: 'Me lo quedo' });
  await expect(claim).toBeInViewport();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp' })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 2, name: 'Acciones rápidas' })).toBeInViewport();
  await claim.click();
  await expect(page.getByText(`Ahora ${name} está a tu cargo.`)).toBeVisible();
});
