import { expectAccessible } from '../axe.js';
import { phone, uniqueName } from '../names.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

/**
 * Mensajes (PLAN M5): an onboarder writes a welcome newcomers get by WhatsApp, their own (PLAN R71), the page saying
 * what a placeholder typo would do before anything is saved, and drafting how it reads for someone without a name. A
 * person's page then opens WhatsApp with it, and "Sí, lo he enviado" logs which message and version went out. The
 * message is retired at the end.
 */
test('an onboarder writes a welcome, offered on a person’s page and named in their history', async ({
  page,
}) => {
  await signedInStaff(page, ['onboarding']);
  await page.goto('/mensajes');
  await expect(page.getByRole('heading', { level: 1, name: 'Mensajes' })).toBeVisible();
  const welcome = page.getByRole('region', { name: 'Bienvenida' });

  await welcome.getByRole('button', { name: 'Escribir un mensaje de Bienvenida' }).click();
  const title = `Bienvenida ${uniqueName()}`;
  await welcome.getByLabel('Título').fill(title);
  const body = welcome.getByLabel('Mensaje', { exact: true });
  await body.fill('Hola, {nombre}: soy {nombe}.');
  await expect(
    welcome.getByText('{nombe} no es un hueco de este mensaje: los suyos son {nombre}, {yo}.'),
  ).toBeVisible();
  await body.fill('Hola, {nombre}: soy {yo}, de PauseAI España. ¿Hablamos?');
  // The version without a name is optional (PLAN R76): empty, it shows what goes out instead, {nombre} taken out.
  const nameless = welcome.getByLabel('Para quien no tiene nombre (opcional)');
  await expect(nameless).toHaveValue('');
  await expect(nameless).toHaveAttribute(
    'placeholder',
    'Hola: soy {yo}, de PauseAI España. ¿Hablamos?',
  );
  await expect(
    welcome.getByText(/^Hola, Persona: soy .+, de PauseAI España\. ¿Hablamos\?$/u),
  ).toBeVisible();
  await expect(
    welcome.locator('form').getByText(/^Hola: soy .+, de PauseAI España\. ¿Hablamos\?$/u),
  ).toBeVisible();
  await expectAccessible(page);
  await welcome.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Mensaje guardado.')).toBeVisible();
  await expect(welcome.getByRole('heading', { level: 3, name: title })).toBeVisible();
  await expect(
    welcome.getByRole('article', { name: title }).getByText('Solo tú lo ves'),
  ).toBeVisible();

  const name = uniqueName();
  const response = await page.request.post('/api/intake', {
    headers: { origin: new URL(page.url()).origin },
    data: { name, phone: phone(), decision: 'new' },
  });
  expect(response.status()).toBe(201);
  const { personId } = (await response.json()) as { personId: string };
  await page.goto(`/personas/${personId}`);
  // Other runs' messages may be in use too: then it's picked from the list.
  const picker = page.getByLabel('Mensaje', { exact: true });
  if ((await picker.count()) > 0) {
    await picker.selectOption({ label: title });
  }
  const open = page.getByRole('link', { name: 'Abrir WhatsApp' });
  const first = name.split(' ')[0] ?? name;
  await expect(open).toHaveAttribute(
    'href',
    new RegExp(`\\?text=${encodeURIComponent(`Hola, ${first}: soy `)}`, 'u'),
  );

  // WhatsApp itself isn't reached: its tab opens on an empty page.
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ body: '' }));
  const tab = page.waitForEvent('popup');
  await open.click();
  await (await tab).close();
  await page.getByRole('button', { name: 'Sí, lo he enviado' }).click();
  await expect(page.getByText('Mensaje registrado en la historia.')).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      `Intento de contacto por WhatsApp: Mensaje dejado, con el mensaje «${title}» (versión 1)`,
    ),
  ).toBeVisible();

  await page.goto('/mensajes');
  await welcome.getByRole('button', { name: `Retirar «${title}»` }).click();
  await welcome.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(page.getByText('Mensaje retirado.')).toBeVisible();
  await expect(welcome.getByRole('heading', { level: 3, name: title })).toBeHidden();
});

/**
 * One's own and the team's (PLAN R71): an admin writes the team's welcome; an onboarder sees it without changing it,
 * writes their own, which nobody else sees, an admin neither, and a person's page offers theirs first, each kind under
 * its name. Both are retired at the end.
 */
test('an onboarder’s welcome is theirs alone, offered before the team’s, which an admin writes', async ({
  page,
  newContext,
}) => {
  await signedInStaff(page, ['admin']);
  await page.goto('/mensajes');
  const teams = page.getByRole('region', { name: 'Bienvenida' });
  await teams.getByRole('button', { name: 'Escribir un mensaje de Bienvenida' }).click();
  const teamTitle = `Del equipo ${uniqueName()}`;
  await teams.getByLabel('Título').fill(teamTitle);
  await teams.getByLabel('Mensaje', { exact: true }).fill('Hola: soy {yo}, del equipo.');
  await expect(teams.getByRole('radio', { name: 'El equipo' })).toBeChecked();
  await expectAccessible(page);
  await teams.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Mensaje guardado.')).toBeVisible();
  await expect(teams.getByRole('heading', { level: 3, name: teamTitle })).toBeVisible();

  const onboarder = await (await newContext()).newPage();
  await signedInStaff(onboarder, ['onboarding']);
  await onboarder.goto('/mensajes');
  const welcome = onboarder.getByRole('region', { name: 'Bienvenida' });
  const team = welcome.getByRole('article', { name: teamTitle });
  await expect(team.getByText('Es del equipo: lo cambia quien administra.')).toBeVisible();
  await expect(team.getByRole('button')).toHaveCount(0);
  await welcome.getByRole('button', { name: 'Escribir un mensaje de Bienvenida' }).click();
  await expect(welcome.getByText(/^Será tuyo: solo tú lo ves/u)).toBeVisible();
  await expect(welcome.getByRole('radio')).toHaveCount(0);
  const ownTitle = `Mía ${uniqueName()}`;
  await welcome.getByLabel('Título').fill(ownTitle);
  await welcome.getByLabel('Mensaje', { exact: true }).fill('Hola: soy {yo}, y este es mío.');
  await welcome.getByRole('button', { name: 'Guardar' }).click();
  await expect(onboarder.getByText('Mensaje guardado.')).toBeVisible();
  await expect(
    welcome.getByRole('article', { name: ownTitle }).getByText('Solo tú lo ves'),
  ).toBeVisible();
  await expectAccessible(onboarder);

  await page.reload();
  await expect(teams.getByRole('heading', { level: 3, name: teamTitle })).toBeVisible();
  await expect(teams.getByRole('heading', { level: 3, name: ownTitle })).toHaveCount(0);

  const response = await onboarder.request.post('/api/intake', {
    headers: { origin: new URL(onboarder.url()).origin },
    data: { name: uniqueName(), phone: phone(), decision: 'new' },
  });
  expect(response.status()).toBe(201);
  const { personId } = (await response.json()) as { personId: string };
  await onboarder.goto(`/personas/${personId}`);
  const picker = onboarder.getByLabel('Mensaje', { exact: true });
  await expect(picker.locator('option:checked')).toHaveText(ownTitle);
  await expect(picker.locator('optgroup[label="Tuyos"] option')).toHaveText([ownTitle]);
  await expect(
    picker.locator('optgroup[label="Del equipo"] option', { hasText: teamTitle }),
  ).toHaveCount(1);
  const href = await onboarder.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(href?.split('?text=')[1] ?? '')).toMatch(
    /^Hola: soy .+, y este es mío\.$/u,
  );

  await onboarder.goto('/mensajes');
  await welcome.getByRole('button', { name: `Retirar «${ownTitle}»` }).click();
  await welcome.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(onboarder.getByText('Mensaje retirado.')).toBeVisible();
  await teams.getByRole('button', { name: `Retirar «${teamTitle}»` }).click();
  await teams.getByRole('button', { name: 'Retirar', exact: true }).click();
  await expect(page.getByText('Mensaje retirado.')).toBeVisible();
});

/**
 * "Escribirle" (PLAN R77): a message goes anywhere, not only WhatsApp. Someone with only an email and a Discord username
 * is written to by the mail app, with the message written, or by copying it; back on the page, a copied one is asked
 * where it went, and the history names its channel. The message's text is a fold away.
 */
test('a message is sent by email or copied for Discord, and logged on that channel', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signedInStaff(page, ['onboarding']);
  const name = uniqueName();
  const tag = crypto.randomUUID().slice(0, 8);
  const response = await page.request.post('/api/intake', {
    headers: { origin: new URL(page.url()).origin },
    data: {
      name,
      email: `escribir.${tag}@ejemplo.test`,
      discord: `escribir_${tag}`,
      decision: 'new',
    },
  });
  expect(response.status()).toBe(201);
  const { personId } = (await response.json()) as { personId: string };
  await page.goto(`/personas/${personId}`);
  const write = page.getByRole('region', { name: 'Escribirle' });
  await expect(write.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveCount(0);
  const mail = write.getByRole('link', { name: 'Abrir el correo' });
  await expect(mail).toHaveAttribute(
    'href',
    new RegExp(`^mailto:escribir\\.${tag}@ejemplo\\.test\\?subject=.+&body=`, 'u'),
  );
  await write.getByRole('button', { name: 'Ver el mensaje' }).click();
  // Other tests' messages may be in use too: the one picked is what's shown, and what's copied.
  const shown = (
    await write
      .locator('#escribir-' + personId + '-texto div')
      .first()
      .innerText()
  ).trim();
  expect(shown).not.toBe('');
  await expectAccessible(page);

  await write.getByRole('button', { name: 'Copiar el mensaje' }).click();
  await expect(page.getByText('Mensaje copiado: pégalo donde le escribas.')).toBeAttached();
  expect((await page.evaluate<string>('navigator.clipboard.readText()')).trim()).toBe(shown);
  // Discord first, since they have it.
  await expect(write.getByLabel('Por dónde')).toHaveValue('discord');
  await write.getByRole('button', { name: 'Sí, lo he enviado' }).click();
  await expect(page.getByText('Mensaje registrado en la historia.')).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^Intento de contacto por Discord: Mensaje dejado/u)).toBeVisible();
});
