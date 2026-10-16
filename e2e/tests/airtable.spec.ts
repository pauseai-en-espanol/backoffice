import type { Page } from '@playwright/test';

import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * Global's Airtable link in Ajustes (ADR-0005): admins paste it, and it is never shown again, to them either; they turn
 * the sync on and off, and remove the link. Other staff don't see the section. The link is fictional.
 */
const LINK = 'https://airtable.com/appEjemplo000001/shrEjemplo0000001';
const SECTION = 'Formulario de PauseAI Global (Airtable)';

// The settings are one row for the whole backoffice: one test at a time changes them.
test.describe.configure({ mode: 'serial' });

const withoutLink = async (page: Page) => {
  const section = page.getByRole('region', { name: SECTION });
  // A run before may have left one.
  const remove = section.getByRole('button', { name: 'Quitar el enlace' });
  if (await remove.isVisible()) {
    await remove.click();
    await section.getByRole('button', { name: 'Quitar el enlace' }).last().click();
  }
  await expect(section.getByText('Sin enlace todavía.')).toBeVisible();
  return section;
};

test('an admin sets the Airtable link, never sees it again, turns the sync on and off, and removes it', async ({
  page,
}) => {
  await signedInStaff(page, ['admin']);
  await page.goto('/ajustes');
  const section = await withoutLink(page);
  const field = section.getByRole('textbox', { name: 'Enlace de la vista compartida' });

  await field.fill('https://ejemplo.test/appEjemplo000001/shrEjemplo0000001');
  await section.getByRole('button', { name: 'Guardar el enlace' }).click();
  await expect(
    section.getByText('Eso no es el enlace de una vista compartida', { exact: false }),
  ).toBeVisible();

  await field.fill(LINK);
  await section.getByRole('button', { name: 'Guardar el enlace' }).click();
  await expect(section.getByText(/^Enlace configurado el .+ por .+\.$/u)).toBeVisible();
  await expect(section.getByText('Sincronización apagada.', { exact: true })).toBeVisible();
  // Never shown again: the field is empty, it asks for another, and the page holds nothing of it.
  const another = section.getByRole('textbox', { name: 'Otro enlace' });
  await expect(another).toHaveValue('');
  await page.reload();
  expect(await page.content()).not.toContain('shrEjemplo');
  await expectAccessible(page);

  await section.getByRole('button', { name: 'Encender la sincronización' }).click();
  await expect(section.getByText('Sincronización encendida: se trae cada hora.')).toBeVisible();
  await expect(section.getByText('Aún no se ha sincronizado con este enlace.')).toBeVisible();
  await section.getByRole('button', { name: 'Apagar la sincronización' }).click();
  await expect(section.getByText('Sincronización apagada.', { exact: true })).toBeVisible();

  await section.getByRole('button', { name: 'Quitar el enlace' }).click();
  await expect(section.getByText('¿Quitar el enlace?', { exact: false })).toBeVisible();
  await section.getByRole('button', { name: 'Quitar el enlace' }).last().click();
  await expect(section.getByText('Sin enlace todavía.')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Encender la sincronización' })).toHaveCount(0);
});

test('onboarding and outreach staff don’t see the Airtable link', async ({ page }) => {
  await signedInStaff(page, ['onboarding', 'outreach']);
  await page.goto('/ajustes');
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: SECTION })).toHaveCount(0);
  const refused = await page.request.get('/api/airtable');
  expect(refused.status()).toBe(403);
});
