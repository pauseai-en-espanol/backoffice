import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

const tag = () => crypto.randomUUID().slice(0, 6);

test('quick-add someone, find them through Hoy’s unassigned queue, and claim from it', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const origin = new URL(page.url()).origin;
  // More than Hoy lists (PLAN M5): it shows the ten oldest, and links to all of them.
  for (let index = 0; index < 11; index += 1) {
    const response = await page.request.post('/api/intake', {
      headers: { origin },
      data: { name: uniqueName(), decision: 'new' },
    });
    expect(response.status()).toBe(201);
  }
  await page.goto('/anadir');
  await expectAccessible(page);
  const name = uniqueName();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Teléfono').fill(phone());
  await page.getByLabel('Provincia').fill('Provincia de ejemplo');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expectAccessible(page);

  await page.goto('/');
  await expectAccessible(page);
  const queue = page.getByRole('region', { name: 'Sin asignar' });
  await expect(queue.getByRole('button', { name: /^Me quedo a /u })).toHaveCount(10);
  await queue.getByRole('link', { name: /^Ver los \d+ sin asignar$/u }).click();
  await expect(page).toHaveURL(/\/personas\?motivo=sin-asignar$/u);
  const card = page.getByRole('listitem').filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sin asignar');

  await page.goto('/');
  const oldest = queue.getByRole('button', { name: /^Me quedo a /u }).first();
  const claimed = ((await oldest.getAttribute('aria-label')) ?? '').replace(/^Me quedo a /u, '');
  await oldest.click();
  await expect(page.getByText(`Ahora ${claimed} está a tu cargo.`)).toBeVisible();
});

test('quick-add someone with only a phone, shown as «Sin nombre» until named (PLAN R37)', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/anadir');
  await page.getByLabel('Teléfono').fill(phone());
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
  await expect(page.getByRole('heading', { level: 1, name: 'Sin nombre' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute(
    'href',
    /\?text=Hola%3A%20soy%20/u,
  );
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Editar el perfil' }).click();
  const name = uniqueName();
  await page.getByLabel('Nombre completo').fill(name);
  await page.getByRole('button', { name: 'Guardar el perfil' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
});

test('a person’s page: next action, a contact attempt, a note, a phone, and leaving', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const name = uniqueName();
  const response = await page.request.post('/api/intake', {
    headers: { origin: new URL(page.url()).origin },
    data: { name, decision: 'new' },
  });
  expect(response.status()).toBe(201);
  const { personId } = (await response.json()) as { personId: string };
  await page.goto(`/personas/${personId}`);

  await page.getByLabel('Qué hay que hacer').fill('Llamar el jueves');
  await page.getByRole('button', { name: 'Guardar el siguiente paso' }).click();
  await expect(page.getByText('Siguiente paso guardado.')).toBeVisible();

  // Attempts and notes are folded behind their buttons (PLAN M5).
  await page.getByRole('button', { name: 'Registrar un intento de contacto' }).click();
  await page.getByLabel('Por dónde').selectOption({ label: 'WhatsApp' });
  await page.getByLabel('Cómo fue').selectOption({ label: 'Ha respondido' });
  await page.getByRole('button', { name: 'Registrar el intento' }).click();
  await expect(page.getByText('Intento registrado.')).toBeVisible();

  await page.getByRole('button', { name: 'Añadir una nota' }).click();
  await page.getByLabel('Nota', { exact: true }).fill('Le interesa la divulgación');
  await page.getByRole('button', { name: 'Guardar la nota' }).click();
  await expect(page.getByText('Nota guardada.')).toBeVisible();

  await page.getByLabel('Teléfono, correo o usuario de Discord').fill(phone());
  await page.getByRole('button', { name: 'Añadir teléfono, correo o Discord' }).click();
  await expect(page.getByText('Dato de contacto añadido.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/34\d{9}/u,
  );

  await page.reload();
  // The attempt moved them on to "En contacto" (PLAN M5); the timeline tells what happened, in words.
  await expect(page.getByText('Etapa: de «Nuevo» a «En contacto»')).toBeVisible();
  await expect(page.getByText('Le interesa la divulgación')).toBeVisible();
  await expectAccessible(page);
});

test('a likely duplicate is caught as you type, and a decided one goes through', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const origin = new URL(page.url()).origin;
  const name = uniqueName();
  const first = await page.request.post('/api/intake', {
    headers: { origin },
    data: { name, decision: 'new' },
  });
  expect(first.status()).toBe(201);

  await page.goto('/anadir');
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Correo').fill(`nerea.${tag()}@ejemplo.test`);
  await expect(page.getByRole('group', { name: 'Puede que ya esté' })).toBeVisible();
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByText('Elige si es una de estas personas o una nueva.')).toBeVisible();
  await page.getByRole('radio', { name: 'Es una persona nueva' }).check();
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
});

test('the Bandeja: a duplicate reported without a decision is attached to its candidate', async ({
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
  await expectAccessible(page);
  await page.getByRole('button', { name: `Es ${name}` }).click();
  await expect(page.getByText('Decisión guardada.')).toBeVisible();
});

test('a CSV import: a dry run, then applying it once', async ({ page }) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/importar');
  await expectAccessible(page);
  const rosa = uniqueName();
  const sara = uniqueName();
  const csv = `Nombre;Teléfono;Provincia\n${rosa};${phone()};Provincia CSV\n${sara};;\n`;
  await page.locator('input[type="file"]').setInputFiles({
    name: 'personas.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await expect(page.getByText(rosa)).toBeVisible();
  await page.getByRole('button', { name: /Aplicar/u }).click();
  await expect(page.getByText(/Importación hecha|importad/iu).first()).toBeVisible();
  // Personas searches by `buscar` (`q` would be ignored, listing everyone: newest first, so with other tests adding
  // people at the same time, these two could fall off the first page).
  for (const name of [rosa, sara]) {
    await page.goto(`/personas?buscar=${encodeURIComponent(name)}`);
    await expect(page.getByRole('link', { name: new RegExp(name, 'u') })).toBeVisible();
  }
});

test('outreach-only staff are kept out of onboarding, in words', async ({ page }) => {
  await signedInStaff(page, ['outreach']);
  for (const path of ['/personas', '/pipeline', '/anadir', '/bandeja', '/importar']) {
    await page.goto(path);
    await expect(page.getByText('Esta sección es del equipo de onboarding')).toBeVisible();
  }
});

test('admins change the settings and export the people listed', async ({ page }) => {
  await signedInStaff(page, ['admin']);
  await page.goto('/ajustes');
  await expectAccessible(page);
  await page.getByLabel('Chats de la comunidad').fill(`Chat general\nChat ${tag()}`);
  await page.getByRole('button', { name: 'Guardar los ajustes' }).click();
  await expect(page.getByText('Ajustes guardados.')).toBeVisible();

  await page.goto('/personas');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar CSV' }).click();
  expect((await download).suggestedFilename()).toBe('personas.csv');
});

test('the board shows every stage in words', async ({ page }) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/pipeline');
  await expectAccessible(page);
  for (const label of ['Nuevo', 'En contacto', 'Bienvenida hecha', 'Activo']) {
    await expect(page.getByRole('heading', { name: new RegExp(label, 'u') }).first()).toBeVisible();
  }
});

test('the Panel: people by stage, arrivals by week, the first contact, and who waits with nobody', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  const response = await page.request.post('/api/intake', {
    headers: { origin: new URL(page.url()).origin },
    data: { name: uniqueName(), phone: phone(), decision: 'new' },
  });
  expect(response.status()).toBe(201);
  await page.goto('/panel?semanas=4');
  await expect(page.getByRole('heading', { level: 1, name: 'Panel' })).toBeVisible();
  await expect(page.getByLabel('Periodo')).toHaveValue('4');
  const arrivals = page.getByRole('table', { name: 'Llegadas por semana' });
  // This week first, with the person just added among its arrivals.
  const thisWeek = arrivals.getByRole('row').nth(1);
  await expect(thisWeek.getByRole('cell').last()).not.toHaveText('0');
  await expect(arrivals.getByRole('row')).toHaveCount(5);
  await expect(
    page.getByRole('table', { name: 'Por etapa' }).getByRole('row', { name: /Nuevo/u }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Más de 48 horas sin nadie/u })).toBeVisible();
  await expectAccessible(page);
});

test('an older member entered after the fact: no arrival day, where from, Discord, and a dated note (PLAN M5)', async ({
  page,
}) => {
  await signedInStaff(page, ['admin', 'onboarding']);
  await page.goto('/anadir');
  const name = uniqueName();
  const username = `miembro_${tag()}`;
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Discord', { exact: true }).fill(`@${username}`);
  await page.getByLabel('Llegó por').selectOption({ label: 'Discord' });
  // Nobody knows when they arrived: emptied, "No se sabe".
  await page.getByLabel('Llegó el').fill('');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page).toHaveURL(/\/personas\/[0-9a-f-]{36}$/u);
  const facts = page.getByRole('region', { name: 'Perfil' });
  await expect(page.getByText('No se sabe')).toBeVisible();
  await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Sin asignar', { exact: true })).toHaveCount(0);
  const personUrl = page.url();

  // Found by not knowing when, and by where from.
  await page.goto('/personas?fecha=no-se-sabe');
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expectAccessible(page);

  // Dated afterwards, and a note about a day gone by.
  await page.goto(personUrl);
  await page.getByRole('button', { name: 'Editar el perfil' }).click();
  await page.getByLabel('Llegó el').fill('2025-03-01');
  await page.getByRole('button', { name: 'Guardar el perfil' }).click();
  await expect(page.getByText('1 de marzo de 2025')).toBeVisible();
  await page.getByRole('button', { name: 'Añadir una nota' }).click();
  await page.getByLabel('Nota', { exact: true }).fill('Nos conocimos en una charla');
  // The note's own date field (the attempt form, folded, has one too).
  await page.locator('#nota-fecha').fill('2025-03-01');
  await page.getByRole('button', { name: 'Guardar la nota' }).click();
  await expect(page.getByText('Nota guardada.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Fue el 1 de marzo de 2025')).toBeVisible();
  await expect(facts).toBeVisible();
  await expectAccessible(page);

  // Admins edit the list "Llegó por" chooses from.
  await page.goto('/ajustes');
  const list = page.getByRole('region', { name: 'Por dónde llega la gente' });
  const label = `Evento ${tag()}`;
  await list.getByLabel('Nueva opción').fill(label);
  await list.getByRole('button', { name: 'Añadir a la lista' }).click();
  await expect(list.getByText(label)).toBeVisible();
  await expectAccessible(page);
});
