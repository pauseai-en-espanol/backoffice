import { createAccount, makeStaff, PASSWORD } from '../accounts.js';
import { expectAccessible } from '../axe.js';
import { asVisitor, signInAndEnrol } from '../staff.js';
import { expect, test } from '../test.js';
import { totpCode } from '../totp.js';

test('a new staff member enrols the second factor, and signs in with a code from then on', async ({
  page,
}) => {
  await asVisitor(page);
  const account = await createAccount();
  await makeStaff(account, ['onboarding']);
  await page.goto('/entrar');
  await expectAccessible(page);
  const key = await signInAndEnrol(page, account.email);
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Salir' }).first().click();
  await expect(page).toHaveURL(/\/entrar$/u);
  await page.getByLabel('Correo electrónico').fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/verificacion$/u);
  await expectAccessible(page);
  // A code from the next 30-second window, so it can't be the one enrolment just used.
  await page.getByLabel('Código', { exact: true }).fill(totpCode(key, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(page).toHaveURL(/\/$/u);
});

test('a wrong password says so in words, and a signed-out visitor reaches no page', async ({
  page,
}) => {
  await asVisitor(page);
  const account = await createAccount();
  await page.goto('/equipo');
  await expect(page).toHaveURL(/\/entrar$/u);
  await page.getByLabel('Correo electrónico').fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('no es la contraseña');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#sign-in-error')).toContainText(/\S/u);
});

test('an account that is not staff is told so after signing in', async ({ page }) => {
  await asVisitor(page);
  const account = await createAccount();
  await signInAndEnrol(page, account.email);
  await expect(page).toHaveURL(/\/sin-acceso$/u);
  await expect(page.getByRole('heading', { name: 'Tu cuenta no tiene acceso' })).toBeVisible();
});
