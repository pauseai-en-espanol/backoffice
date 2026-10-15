import { expect, type Page } from '@playwright/test';

import { createAccount, makeStaff, PASSWORD, type StaffRole, visitorAddress } from './accounts.js';
import { totpCode } from './totp.js';

/** Plays a visitor of its own at the gateway, so tests don't share the sign-in rate limit. */
export const asVisitor = async (page: Page) => {
  await page.setExtraHTTPHeaders({ 'x-e2e-client-address': visitorAddress() });
};

/** Signs in with the password, and enrols TOTP through the page (the account has none yet); returns the setup key. */
export const signInAndEnrol = async (page: Page, email: string): Promise<string> => {
  await page.goto('/entrar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/verificacion\/alta$/u);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const key = (await page.getByTestId('setup-key').textContent()) ?? '';
  await page.getByLabel('Código de la aplicación').fill(totpCode(key));
  await page.getByRole('button', { name: 'Verificar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Guarda tus códigos de recuperación' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Hecho|Continuar|Ya los he guardado/u }).click();
  return key;
};

/** A staff member with these roles, signed in with their second factor in `page`. */
export const signedInStaff = async (page: Page, roles: StaffRole[]) => {
  await asVisitor(page);
  const account = await createAccount();
  await makeStaff(account, roles);
  const key = await signInAndEnrol(page, account.email);
  await expect(page).toHaveURL(/\/$/u);
  return { ...account, key };
};
