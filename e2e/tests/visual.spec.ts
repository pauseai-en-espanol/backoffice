import type { Page } from '@playwright/test';

import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * The visual review's steps 4 and 5 (PLAN R65 to R68): a person's page says where they are under their name, edits
 * are buttons with their icon, the Panel draws its bars to scale, the menu and the stage filters carry their icons,
 * Hoy shows two figures, Contactos folds its filters and shows its contacts' tier and relationship, the Bandeja marks
 * what agrees in green, and Ajustes adds an option from a field with its button beside it.
 */

const tag = () => crypto.randomUUID().slice(0, 8);

const addPerson = async (page: Page, name: string): Promise<string> => {
  const added = await page.request.post('/api/intake', {
    headers: { origin: new URL(page.url()).origin },
    data: { name, phone: phone(), decision: 'new' },
  });
  expect(added.status()).toBe(201);
  return ((await added.json()) as { personId: string }).personId;
};

test('a person’s page: the stage and next step under the name, edits as buttons, each label said once (PLAN R65)', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const name = uniqueName();
  await page.goto(`/personas/${await addPerson(page, name)}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // Where they are, under the name and above Seguimiento.
  const strip = page.getByText('Sin siguiente paso', { exact: true }).first();
  const followUp = page.getByRole('heading', { name: 'Seguimiento' });
  expect((await strip.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(
    (await followUp.boundingBox())?.y ?? 0,
  );

  // From a wide screen up, Seguimiento follows the name, not Escribirle, which heads the cards beside it, lined up with
  // them (PLAN R90).
  const [handover, contact, following] = await Promise.all(
    ['Escribirle', 'Contacto', 'Seguimiento'].map((name) =>
      page.getByRole('region', { name }).boundingBox(),
    ),
  );
  expect(following?.y ?? Number.POSITIVE_INFINITY, 'Seguimiento beside Escribirle').toBeLessThan(
    (handover?.y ?? 0) + (handover?.height ?? 0),
  );
  expect(
    Math.abs((handover?.x ?? 0) - (contact?.x ?? Number.NaN)),
    'Escribirle starts where Contacto does',
  ).toBeLessThan(1);
  expect(
    Math.abs((handover?.width ?? 0) - (contact?.width ?? Number.NaN)),
    'Escribirle as wide as Contacto',
  ).toBeLessThan(1);

  // Each edit is a button with its icon beside its words.
  const change = page.getByRole('button', { name: 'Cambiar la etapa' });
  await expect(change.locator('svg')).toHaveCount(1);
  await change.click();
  // "Etapa" shows once, the form's own: it opens under the name, where no row says it (PLAN R89).
  await expect(page.getByLabel('Etapa', { exact: true })).toBeVisible();
  const label = await page.locator('label[for="etapa-persona"]').boundingBox();
  expect(label?.width ?? 0).toBeGreaterThan(1);
  await expect(page.getByText('Etapa', { exact: true })).toHaveCount(1);
  await expectAccessible(page);
});

test('Hoy, the Panel, Personas and the menu: figures, bars to scale and icons (PLAN R66)', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await addPerson(page, uniqueName());

  await page.goto('/');
  // Two figures at a glance: each number with its words.
  const unassigned = page.locator('dl > div', { hasText: 'sin asignar' });
  await expect(unassigned.locator('dd')).toHaveText(/^\d+$/u);
  const menu = page.getByRole('navigation', { name: 'Secciones' });
  await expect(menu.getByRole('link', { name: 'Personas' }).locator('svg')).toHaveCount(1);
  await expect(menu.getByRole('button', { name: 'Salir' }).locator('svg')).toHaveCount(1);

  await page.goto('/panel');
  const rows = page.getByRole('table', { name: 'Por etapa' }).locator('tbody tr');
  const counts: number[] = [];
  const widths: number[] = [];
  for (let index = 0; index < (await rows.count()); index += 1) {
    const cell = rows.nth(index).locator('td');
    counts.push(Number(await cell.innerText()));
    widths.push((await cell.locator('span[aria-hidden="true"]').boundingBox())?.width ?? 0);
  }
  const most = Math.max(...counts);
  const longest = Math.max(...widths);
  expect(longest, 'the stage with most people has the longest bar').toBeGreaterThan(100);
  counts.forEach((count, index) => {
    expect(Math.abs((widths[index] ?? 0) - (count / most) * longest), `bar ${index}`).toBeLessThan(
      2,
    );
  });

  await page.goto('/personas');
  const stages = page.getByRole('navigation', { name: 'Etapas' });
  await expect(stages.getByRole('link', { name: /^Nuevo/u }).locator('svg')).toHaveCount(1);
});

test('Contactos folds its filters, and its cards show tier and relationship (PLAN R67)', async ({
  page,
}) => {
  await signedInStaff(page, ['outreach']);
  const org = `Prueba Medio ${tag()}`;
  const added = await page.request.post('/api/outreach/contacts', {
    headers: { origin: new URL(page.url()).origin },
    data: { orgDisplay: org, reason: 'Cubre tecnología', sources: ['https://ejemplo.test/fuente'] },
  });
  expect(added.status()).toBe(201);

  await page.goto(`/contactos?buscar=${encodeURIComponent(org)}`);
  await expect(page.locator('#nivel')).toBeHidden();
  await page.getByText('Más filtros').click();
  await expect(page.locator('#nivel')).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: org });
  await expect(card.getByText('Identificado', { exact: true }).locator('svg')).toHaveCount(1);
  await expect(card.getByText(/^Nivel [AB]$/u).locator('svg')).toHaveCount(1);
  await expectAccessible(page);
});

test('the Bandeja marks what agrees in green, with its icon and word (PLAN R68)', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const origin = new URL(page.url()).origin;
  const name = uniqueName();
  await page.request.post('/api/intake', { headers: { origin }, data: { name, decision: 'new' } });
  const second = await page.request.post('/api/intake', {
    headers: { origin },
    data: { name, town: 'Pueblo' },
  });
  expect(((await second.json()) as { status: string }).status).toBe('review');

  await page.goto('/bandeja');
  const same = page.getByText('igual', { exact: true }).first();
  await expect(same).toBeVisible();
  await expect(same.locator('svg')).toHaveCount(1);
  await expectAccessible(page);
});

test('Ajustes adds an option from a field with its button beside it (PLAN R66)', async ({
  page,
}) => {
  await signedInStaff(page, ['admin', 'onboarding']);
  await page.goto('/ajustes');
  const list = page.getByRole('region', { name: 'Canales de alta' });
  const field = await list.getByLabel('Nueva opción').boundingBox();
  const add = await list.getByRole('button', { name: 'Añadir a la lista' }).boundingBox();
  const middle = (box: typeof field) => (box ? box.y + box.height / 2 : Number.NaN);
  expect(Math.abs(middle(field) - middle(add)), 'side by side').toBeLessThan(4);
  expect(add?.x ?? 0).toBeGreaterThan(field?.x ?? Number.POSITIVE_INFINITY);
});
