import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * The Bandeja says what's going on (PLAN R78): someone reported again as a person who has a record, under another name,
 * waits beside that record, row by row, with what using it would change and what each answer does; the menu counts it
 * on every page.
 */
test('a conflict shows the record beside what came in, what would change, and the menu counts it', async ({
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
  const other = `${name} Otra`;
  const reported = await page.request.post('/api/intake', {
    headers: { origin },
    data: { name: other, decision: 'attach', target: personId },
  });
  expect(((await reported.json()) as { status: string }).status).toBe('conflict');

  // Counted in the menu wherever one is.
  await page.goto('/personas');
  await expect(
    page
      .getByRole('navigation', { name: 'Secciones' })
      .getByRole('link', { name: /^Bandeja \(\d+\)/u }),
  ).toBeVisible();

  await page.goto('/bandeja');
  const item = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: other }) });
  await expect(
    item.getByText(/^Ya tiene ficha, pero lo que ha llegado no coincide/u),
  ).toBeVisible();
  const compared = item.getByRole('region', { name: 'Lo que ha llegado y la ficha' });
  await expect(compared.getByRole('row', { name: /Nombre/u })).toContainText('distinto');
  await expect(item.getByRole('heading', { name: 'Qué cambiaría' })).toBeVisible();
  await expect(item.getByRole('row', { name: new RegExp(`${name}.*${other}`, 'u') })).toBeVisible();
  await expectAccessible(page);
  await item.getByRole('button', { name: 'Mantener la ficha' }).click();
  await expect(page.getByRole('heading', { name: other })).toHaveCount(0);
});
