import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * Hoy keeps what one just did at hand (PLAN R79): someone taken and given a step weeks away needs nothing today, and is
 * still among "Mis personas", after what does, and first in "Recientes".
 */
test('someone just worked with stays on Hoy: in "Recientes", and among "Mis personas"', async ({
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
  expect(
    (await page.request.post(`/api/people/${personId}/claim`, { headers: { origin } })).status(),
  ).toBe(204);
  const later = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  expect(
    (
      await page.request.patch(`/api/people/${personId}`, {
        headers: { origin },
        data: { nextAction: 'Llamar', nextActionDue: later },
      })
    ).status(),
  ).toBe(204);

  await page.goto('/');
  const recent = page.getByRole('region', { name: 'Recientes' });
  await expect(recent.getByRole('listitem').first()).toContainText(name);
  await expect(recent.getByRole('link', { name })).toHaveAttribute('href', `/personas/${personId}`);
  const mine = page.getByRole('region', { name: 'Mis personas' });
  await expect(mine.getByRole('link', { name })).toBeVisible();
  await expectAccessible(page);
});
