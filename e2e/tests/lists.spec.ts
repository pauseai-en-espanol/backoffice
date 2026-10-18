import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * The lists (PLAN R61, R62): Hoy lays its people out as a grid of cards, Personas as rows lined up under their columns'
 * names, and every stage is a pill with its icon beside its word, never a colour alone.
 */
test('Hoy is a grid of cards, Personas rows under their columns, each stage with its icon and word', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const origin = new URL(page.url()).origin;
  const name = uniqueName();
  for (const someone of [name, uniqueName()]) {
    const added = await page.request.post('/api/intake', {
      headers: { origin },
      data: { name: someone, phone: phone(), decision: 'new' },
    });
    expect(added.status()).toBe(201);
  }

  await page.goto('/');
  const queue = page.getByRole('region', { name: 'Sin asignar' });
  // Side by side on a laptop: the first two cards share a top edge.
  const cards = queue.getByRole('list').first().locator(':scope > li');
  const [first, second] = await Promise.all([
    cards.nth(0).boundingBox(),
    cards.nth(1).boundingBox(),
  ]);
  expect(first?.y, 'cards side by side on a laptop').toBe(second?.y);
  expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? Number.POSITIVE_INFINITY);
  await expectAccessible(page);

  await page.goto(`/personas?buscar=${encodeURIComponent(name)}`);
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
  const stage = row.getByText('Nuevo', { exact: true });
  await expect(stage).toBeVisible();
  await expect(stage.locator('svg')).toHaveCount(1);
  // The stage's cell starts where its column's name does.
  const head = page.getByRole('region', { name: 'Resultados' }).locator('div[aria-hidden="true"]');
  const named = await head.getByText('Etapa', { exact: true }).boundingBox();
  const placed = await stage.boundingBox();
  expect(
    Math.abs((named?.x ?? 0) - (placed?.x ?? Number.NaN)),
    'the stage under "Etapa"',
  ).toBeLessThan(2);
  await expect(row).toContainText('Sin asignar');
  await expectAccessible(page);
});
