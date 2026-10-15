import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { FORMS_URL } from '../servers.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/** The API takes an answer filled in at least this long after the form loaded (MIN_FILL_MS, plus a margin). */
const FILL_MS = 3_500;

test('a personal census link: made in Censo, answered in the form, shown on the person’s page', async ({
  page,
  newContext,
}) => {
  await signedInStaff(page, ['onboarding']);
  const name = uniqueName();
  const added = await page.request.post('/api/intake', {
    headers: { origin: new URL(page.url()).origin },
    data: { name, phone: phone(), decision: 'new' },
  });
  expect(added.status()).toBe(201);
  const { personId } = (await added.json()) as { personId: string };

  await page.goto('/censo');
  await expectAccessible(page);
  await expect(page.getByRole('textbox', { name: 'Enlace general' })).toHaveValue(FORMS_URL);
  const row = page.getByRole('listitem').filter({ hasText: name });
  await row.getByRole('button', { name: `Crear enlace para ${name}` }).click();
  await expect(row.getByText('Enlace creado.', { exact: false })).toBeVisible();
  const link = await row.getByRole('textbox', { name: 'Enlace personal' }).inputValue();
  expect(link).toMatch(new RegExp(`^${FORMS_URL}/c#token=[\\w-]{43}$`, 'u'));
  await expect(row.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/346\d{8}\?text=/u,
  );

  // The person, in a browser of their own: greeted by first name, the token out of the address bar at once.
  const visitor = await (await newContext()).newPage();
  await visitor.goto(link);
  const first = name.split(' ')[0] ?? name;
  await expect(visitor.getByText(`Hola, ${first}.`, { exact: false })).toBeVisible();
  const loadedAt = Date.now();
  await expect(visitor).toHaveURL(`${FORMS_URL}/c`);
  await expectAccessible(visitor);
  await visitor.getByRole('textbox', { name: 'Nombre y apellidos' }).fill(`${name} Ejemplo`);
  await visitor.getByRole('textbox', { name: 'Cómo prefieres que te llamemos' }).fill(first);
  await visitor
    .getByRole('textbox', { name: 'Correo electrónico' })
    .fill(`${first.toLowerCase()}.censo@ejemplo.test`);
  await visitor.getByRole('checkbox', { name: 'Diseño' }).check();
  await visitor.getByRole('checkbox', { name: 'He leído y acepto el aviso de privacidad' }).check();
  await visitor.getByRole('checkbox', { name: 'Tengo 14 años o más' }).check();
  // A bot answers at once; a person takes a few seconds, which the API checks.
  await expect.poll(() => Date.now() - loadedAt, { timeout: FILL_MS * 3 }).toBeGreaterThan(FILL_MS);
  await visitor.getByRole('button', { name: 'Enviar' }).click();
  await expect(visitor.getByText('Hemos puesto al día tu ficha.', { exact: false })).toBeVisible();
  await expectAccessible(visitor);

  // Staff see the answer on the person's page, and the link as used in Censo.
  await page.goto(`/personas/${personId}`);
  const census = page.getByRole('region', { name: 'Censo' });
  await expect(census.getByText(/^Perfil completado el /u)).toBeVisible();
  await expect(census.getByText('Diseño')).toBeVisible();
  await expectAccessible(page);
});

test('the generic link takes an answer from someone new, and refuses one sent too fast', async ({
  page,
}) => {
  await page.goto(FORMS_URL);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Censo de PauseAI España' }),
  ).toBeVisible();
  const loadedAt = Date.now();
  await expectAccessible(page);
  const name = uniqueName();
  await page.getByRole('textbox', { name: 'Nombre y apellidos' }).fill(name);
  await page.getByRole('textbox', { name: 'Teléfono' }).fill(phone());
  await page.getByRole('checkbox', { name: 'He leído y acepto el aviso de privacidad' }).check();
  await page.getByRole('checkbox', { name: 'Tengo 14 años o más' }).check();
  if (Date.now() - loadedAt < 2_000) {
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Lo has enviado muy deprisa.', { exact: false })).toBeVisible();
  }
  await expect.poll(() => Date.now() - loadedAt, { timeout: FILL_MS * 3 }).toBeGreaterThan(FILL_MS);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Ya estás en el censo.', { exact: false })).toBeVisible();
});
