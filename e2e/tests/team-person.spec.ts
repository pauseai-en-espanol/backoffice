import { createAccount, makeStaff } from '../accounts.js';
import { expectAccessible } from '../axe.js';
import { uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * A team account linked to its person (PLAN M5, step 5): an admin links it from the person's page, where the account
 * sharing their email comes first; the person then shows "Equipo", Personas finds them as such, and Equipo leads to
 * their page.
 */
test('an admin links a team account to its person, suggested by a shared email', async ({
  page,
}) => {
  await signedInStaff(page, ['admin', 'onboarding']);
  const colleague = await createAccount();
  await makeStaff(colleague, ['outreach']);

  await page.goto('/anadir');
  const name = uniqueName();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Correo', { exact: true }).fill(colleague.email);
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
  const personPage = page.url();

  const account = page.getByLabel('Cuenta', { exact: true });
  await expect(account.locator('option:checked')).toHaveText(`${colleague.name} (mismo correo)`);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(page.getByText('Cuenta vinculada con esta ficha.')).toBeVisible();
  // Under the name: "Equipo" and the account, as everyone who opens the page sees them.
  await expect(
    page.getByRole('listitem').filter({ hasText: `Cuenta del equipo: ${colleague.name}` }),
  ).toContainText('Equipo');

  await page.goto('/personas?equipo=si');
  const card = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(card).toContainText('Equipo');

  await page.goto('/equipo');
  const member = page.getByRole('listitem').filter({ hasText: colleague.name });
  await member.getByRole('link', { name: 'Ver su ficha' }).click();
  await expect(page).toHaveURL(personPage);
});
