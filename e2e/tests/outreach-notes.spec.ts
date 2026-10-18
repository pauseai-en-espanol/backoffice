import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

const tag = () => crypto.randomUUID().slice(0, 8);

/**
 * An organisation's timeline (PLAN M5, step 6): notes, each dated when the conversation happened if not today, shown
 * with who wrote it and when.
 */
test('an organisation keeps notes of past conversations, dated when they happened', async ({
  page,
}) => {
  await signedInStaff(page, ['outreach']);
  const origin = new URL(page.url()).origin;
  const name = `Prueba Fundación ${tag()}`;
  const made = await page.request.post('/api/outreach/organisations', {
    headers: { origin },
    data: { name, kind: 'ngo' },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };

  await page.goto(`/organizaciones/${id}`);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByText('Aún no hay notas.')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Nota', exact: true })
    .fill('Su junta nos recibió en su sede');
  await page.getByLabel('Cuándo fue', { exact: true }).fill('2026-03-01');
  await page.getByRole('button', { name: 'Guardar la nota' }).click();
  await expect(page.getByText('Nota guardada.')).toBeVisible();

  const notes = page.getByRole('region', { name: 'Notas' }).getByRole('listitem');
  await expect(notes).toHaveCount(1);
  await expect(notes.first()).toContainText('Su junta nos recibió en su sede');
  await expect(notes.first()).toContainText('Fue el 1 de marzo de 2026');
  await expect(notes.first()).toContainText('anotado el');
  await expectAccessible(page);
});
