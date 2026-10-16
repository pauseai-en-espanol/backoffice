import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/** Every section of the staff app, as an admin who also onboards and does outreach sees it. */
const PAGES = [
  '/',
  '/personas',
  '/pipeline',
  '/anadir',
  '/bandeja',
  '/censo',
  '/mensajes',
  '/panel',
  '/importar',
  '/siguiente',
  '/campanas',
  '/contactos',
  '/organizaciones',
  '/ajustes',
  '/equipo',
  '/registro',
];

test('every section fits a phone’s screen without sideways scrolling, and passes axe', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signedInStaff(page, ['admin', 'onboarding', 'outreach']);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible();
    // The page itself never scrolls sideways; a wide table scrolls inside its own frame.
    const overflow = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
    await expectAccessible(page);
  }
});
