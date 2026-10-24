import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * The search from anywhere (PLAN R80): Ctrl K, ⌘K on a Mac (R85), opens it on any page; it finds a person as their
 * name is typed, best first, and Enter opens them; empty, it offers who one last worked with; and it goes to a section
 * by its name.
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
  // Desktop Chrome, as Playwright plays it, says it's on Windows, wherever the test runs: Ctrl K.
  await expect(page.getByRole('button', { name: 'Buscar en todo' })).toHaveAttribute(
    'aria-keyshortcuts',
    'Control+K',
  );
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  const box = dialog.getByRole('combobox', { name: 'Buscar' });
  await expect(box).toBeFocused();
  await expect(dialog).toContainText('desde cualquier página con Ctrl K.');
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

test.describe('on a Mac', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  });

  test('⌘K opens the search, and Ctrl K is left to the text fields', async ({ page }) => {
    await signedInStaff(page, ['onboarding']);
    await page.goto('/personas');
    const button = page.getByRole('button', { name: 'Buscar en todo' });
    await expect(button).toHaveAttribute('aria-keyshortcuts', 'Meta+K');
    await expect(button).toContainText('⌘K');
    const dialog = page.getByRole('dialog', { name: 'Buscar' });

    await page.keyboard.press('Control+k');
    // A moment, in the page, for the dialog to open in, were it to.
    await page.evaluate(() => new Promise((done) => setTimeout(done, 100)));
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press('Meta+k');
    await expect(dialog.getByRole('combobox', { name: 'Buscar' })).toBeFocused();
    await expect(dialog).toContainText('desde cualquier página con ⌘K.');
  });
});
