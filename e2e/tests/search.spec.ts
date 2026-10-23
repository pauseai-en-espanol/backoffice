import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * The search from anywhere (PLAN R80): Ctrl K opens it on any page; it finds a person as their name is typed, best
 * first, and Enter opens them; empty, it offers who one last worked with; and it goes to a section by its name.
 */
test('Ctrl K finds a person as it is typed, opens them, and goes to a section', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const origin = new URL(page.url()).origin;
  const name = uniqueName();
  const added = await page.request.post('/api/intake', {
    headers: { origin },
    data: { name, phone: phone(), decision: 'new' },
  });
  const { personId } = (await added.json()) as { personId: string };

  await page.goto('/personas');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  const box = dialog.getByRole('combobox', { name: 'Buscar' });
  await expect(box).toBeFocused();
  // Nothing typed: who one last worked with.
  await expect(dialog.getByRole('group', { name: 'Recientes' })).toContainText(name);
  await expectAccessible(page);

  await box.fill(name.split(' ').slice(0, 2).join(' ').toLowerCase());
  const people = dialog.getByRole('group', { name: 'Personas' });
  await expect(people.getByRole('option').first()).toContainText(name);
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/personas/${personId}$`, 'u'));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Its button, and a section by name.
  await page.getByRole('button', { name: /^Buscar/u }).click();
  await dialog.getByRole('combobox', { name: 'Buscar' }).fill('bandej');
  await dialog
    .getByRole('group', { name: 'Ir a' })
    .getByRole('option', { name: 'Bandeja' })
    .click();
  await expect(page).toHaveURL(/\/bandeja$/u);
  await expect(dialog).toHaveCount(0);
});
