import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/** On a phone the same groups are inside "Menú" (PLAN M5): closed until opened, Escape closes them again. */
test('on a phone the groups open under «Menú», and Escape closes them', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'a phone’s menu');
  await signedInStaff(page, ['admin', 'onboarding', 'outreach']);
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Menú' });
  const onboarding = page.getByRole('list', { name: 'Onboarding' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(onboarding).toBeHidden();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  for (const group of ['Onboarding', 'Relaciones externas', 'Equipo']) {
    await expect(page.getByRole('list', { name: group })).toBeVisible();
  }
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(onboarding).toBeHidden();
  await expect(button).toBeFocused();
});
