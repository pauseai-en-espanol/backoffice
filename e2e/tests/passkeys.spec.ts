import type { Page } from '@playwright/test';

import { alive } from '../alive.js';
import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * A device with a passkey store that checks who holds it, as a phone's fingerprint or a laptop's Touch ID would:
 * Chromium's virtual authenticator, which answers every prompt at once.
 */
const withPasskeyDevice = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
};

const signOut = async (page: Page) => {
  await page.getByRole('button', { name: 'Salir' }).first().click();
  await expect(page).toHaveURL(/\/entrar$/u);
  await alive(page);
};

test('a staff member adds a passkey in Ajustes, signs in with it alone, and removes it (PLAN D22)', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await withPasskeyDevice(page);

  await page.goto('/ajustes');
  await alive(page);
  const section = page.getByRole('region', { name: 'Llaves de acceso' });
  await expect(section.getByText('Aún no tienes ninguna llave de acceso.')).toBeVisible();
  await section.getByLabel('Nombre (opcional)').fill('Portátil');
  await section.getByRole('button', { name: 'Añadir una llave de acceso' }).click();
  const list = section.getByRole('list', { name: 'Tus llaves de acceso' });
  await expect(list.getByText('Portátil', { exact: true })).toBeVisible();
  await expectAccessible(page);

  // Signed out, the passkey alone signs in: no email, password or code.
  await signOut(page);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Usar una llave de acceso' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Removed, it opens nothing, and the page says so in words.
  await page.goto('/ajustes');
  await alive(page);
  await list.getByRole('button', { name: 'Quitar la llave «Portátil»' }).click();
  await section.getByRole('button', { name: 'Sí, continuar' }).click();
  await expect(section.getByText('Aún no tienes ninguna llave de acceso.')).toBeVisible();
  await signOut(page);
  await page.getByRole('button', { name: 'Usar una llave de acceso' }).click();
  await expect(page.locator('#passkey-error')).toContainText(/\S/u);
  await expect(page).toHaveURL(/\/entrar$/u);
});
