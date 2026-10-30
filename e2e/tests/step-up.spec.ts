import type { Page } from '@playwright/test';

import { asOwner } from '../accounts.js';
import { alive } from '../alive.js';
import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';
import { totpCode } from '../totp.js';

/** The account signed in 13 hours ago: its second factor is no longer recent (PLAN D23). */
const signedInLongAgo = (userId: string) =>
  asOwner(
    `UPDATE auth.sessions SET created_at = now() - interval '13 hours', expires_at = now() + interval '1 hour'
      WHERE user_id = $1`,
    [userId],
  );

const confirmWithCode = async (page: Page, key: string) => {
  await alive(page);
  // A code from the next 30-second window, as the sign-in test does: never the one enrolment just used.
  await page.getByLabel('Código', { exact: true }).fill(totpCode(key, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Confirmar' }).click();
};

test('an admin signed in long ago confirms with a code before the audit log, and lands back on it (PLAN D23)', async ({
  page,
}) => {
  const admin = await signedInStaff(page, ['admin']);
  await signedInLongAgo(admin.id);

  await page.goto('/registro');
  await expect(page).toHaveURL(/\/confirmar\?next=%2Fregistro$/u);
  await expect(page.getByRole('heading', { name: 'Confirma que eres tú' })).toBeVisible();
  await expectAccessible(page);
  await confirmWithCode(page, admin.key);
  await expect(page).toHaveURL(/\/registro$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Registro' })).toBeVisible();
});

test('a write among the riskiest actions asks to confirm, then the page is there to try again (PLAN D23)', async ({
  page,
}) => {
  const admin = await signedInStaff(page, ['admin']);
  await signedInLongAgo(admin.id);

  // Everyday pages don't ask.
  await page.goto('/equipo');
  await alive(page);
  await expect(page).toHaveURL(/\/equipo$/u);
  await page.getByLabel('Correo electrónico').fill(`nueva-${crypto.randomUUID()}@ejemplo.test`);
  await page.getByRole('checkbox', { name: /Onboarding/u }).check();
  await page.getByRole('button', { name: 'Enviar la invitación' }).click();
  await expect(page).toHaveURL(/\/confirmar\?next=%2Fequipo$/u);
  await confirmWithCode(page, admin.key);
  await expect(page).toHaveURL(/\/equipo$/u);

  const email = `nueva-${crypto.randomUUID()}@ejemplo.test`;
  await alive(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('checkbox', { name: /Onboarding/u }).check();
  await page.getByRole('button', { name: 'Enviar la invitación' }).click();
  await expect(page.getByText(`Invitación enviada a ${email}.`)).toBeVisible();
});
