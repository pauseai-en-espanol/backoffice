import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

const tag = () => crypto.randomUUID().slice(0, 8);

/**
 * "Solo yo" (PLAN M5, step 6): a contact kept private is its own person's alone, nobody else on the team sees it, an
 * admin neither; sharing it offers to merge it into the team's contact that is the same person, its notes too when
 * ticked.
 */
test('a private contact: mine alone, then shared into the team contact that is the same person', async ({
  page,
  newContext,
}) => {
  await signedInStaff(page, ['outreach']);
  const origin = new URL(page.url()).origin;
  const email = `privada.${tag()}@ejemplo.test`;
  const team = await page.request.post('/api/outreach/contacts', {
    headers: { origin },
    data: {
      orgDisplay: `Prueba Medio ${tag()}`,
      personName: 'Persona del equipo',
      email,
      reason: 'Cubre tecnología',
      sources: ['https://ejemplo.test/fuente'],
    },
  });
  expect(team.status()).toBe(201);
  const { id: teamId } = (await team.json()) as { id: string };

  // Made in Contactos, "Solo yo".
  const org = `Prueba Privada ${tag()}`;
  await page.goto('/contactos#nuevo');
  const form = page.locator('#nuevo');
  await form.getByRole('textbox', { name: 'Organización, como sale en el listado' }).fill(org);
  await form.getByRole('textbox', { name: 'Correo', exact: true }).fill(email);
  await form.getByRole('radio', { name: 'Solo yo' }).check();
  await form.getByRole('button', { name: 'Crear el contacto' }).click();
  await expect(page).toHaveURL(/\/contactos\/[0-9a-f-]{36}$/u);
  const privateUrl = page.url();
  await expect(page.getByText('Solo tú lo ves').first()).toBeVisible();
  await expectAccessible(page);

  // Nobody else sees it: another outreach member, nor an admin.
  for (const roles of [['outreach'], ['admin']] as const) {
    const other = await (await newContext()).newPage();
    await signedInStaff(other, [...roles]);
    await other.goto('/contactos?quien=yo');
    await expect(other.getByRole('link', { name: org })).toHaveCount(0);
    await other.goto(privateUrl);
    await expect(other.getByRole('heading', { level: 1, name: org })).toHaveCount(0);
  }

  // A note while it's mine alone.
  const note = `Lo que hablamos ${tag()}`;
  const privateId = privateUrl.split('/').at(-1) ?? '';
  const noted = await page.request.post(`/api/outreach/contacts/${privateId}/notes`, {
    headers: { origin },
    data: { body: note },
  });
  expect(noted.status()).toBe(201);

  // Sharing: the team already has them, so merge into theirs, notes and all (PLAN R52).
  await page.goto(privateUrl);
  const history = page.getByRole('checkbox', { name: 'Compartir también mis notas' });
  await expect(history).not.toBeChecked();
  await history.check();
  const merge = page.getByRole('button', { name: /^Fusionar con Persona del equipo/u });
  await expect(merge).toBeVisible();
  await merge.click();
  await expect(page).toHaveURL(new RegExp(`/contactos/${teamId}$`, 'u'));
  await expect(
    page.getByText('Compartido con el equipo, fusionado en este contacto'),
  ).toBeVisible();
  const colleague = await (await newContext()).newPage();
  await signedInStaff(colleague, ['outreach']);
  await colleague.goto(`/contactos/${teamId}`);
  await expect(colleague.getByText(note)).toBeVisible();
});
