import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * Where someone lives, and where they're from (PLAN R74): a country picked by typing part of its name, Spain's
 * provinces offered while the country is Spain, a region abroad written as it's said there. The person's page and
 * their card say it as a line, the country when it isn't Spain, and Personas finds them by country.
 */
test('a country and a province are picked by typing, and said where someone lives and is from', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/anadir');
  const name = uniqueName();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Teléfono').fill(phone());
  // Spain's provinces while no country is said, picked from what is typed.
  const province = page.getByRole('combobox', { name: 'Provincia o región' });
  await province.fill('vizc');
  await page.getByRole('option', { name: 'Bizkaia' }).click();
  await expect(province).toHaveValue('Bizkaia');
  // Where they're from, folded until asked for (PLAN R75).
  await page.getByRole('button', { name: 'Añadir de dónde es' }).click();
  const quickFrom = page.getByRole('group', { name: 'De dónde es' });
  await expect(quickFrom.getByRole('combobox', { name: 'País' })).toBeFocused();
  await quickFrom.getByRole('combobox', { name: 'Provincia o región' }).fill('Cádiz');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);

  await page.getByRole('button', { name: 'Editar el perfil' }).click();
  const lives = page.getByRole('group', { name: 'Dónde vive' });
  const country = lives.getByRole('combobox', { name: 'País' });
  await country.fill('alema');
  await page.getByRole('option', { name: 'Alemania' }).click();
  await expect(country).toHaveValue('Alemania');
  // The list closes, and focus is back on the country, before going on to the next field.
  await expect(country).toHaveAttribute('aria-expanded', 'false');
  // Abroad, a region as it's said there: no provinces offered.
  await expect(lives.getByText('Estado, región o provincia, como se diga allí.')).toBeVisible();
  const region = lives.getByRole('combobox', { name: 'Provincia o región' });
  await region.fill('Baviera');
  await expect(lives.getByRole('listbox')).toHaveCount(0);
  await lives.getByLabel('Localidad').fill('Múnich');
  const from = page.getByRole('group', { name: 'De dónde es' });
  const origin = from.getByRole('combobox', { name: 'País' });
  await origin.fill('España');
  await page.getByRole('option', { name: 'España' }).click();
  await expect(origin).toHaveValue('España');
  await expect(origin).toHaveAttribute('aria-expanded', 'false');
  await from.getByRole('combobox', { name: 'Provincia o región' }).fill('sevi');
  await page.getByRole('option', { name: 'Sevilla' }).click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Guardar el perfil' }).click();

  const facts = page.locator('dl');
  await expect(facts.getByText('Múnich, Baviera, Alemania')).toBeVisible();
  await expect(facts.getByText('Sevilla', { exact: true })).toBeVisible();
  // Living abroad, nobody is asked for a province.
  await expect(page.getByText('dónde vive', { exact: true })).toHaveCount(0);

  await page.goto(`/personas?buscar=${encodeURIComponent(name)}&pais=de`);
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card).toContainText(`${name} (Baviera, Alemania)`);
  await page.goto(`/personas?buscar=${encodeURIComponent(name)}&pais=es`);
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});
