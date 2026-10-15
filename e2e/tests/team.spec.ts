import { createAccount, PASSWORD } from '../accounts.js';
import { expectAccessible } from '../axe.js';
import { mailFor } from '../mail.js';
import { asVisitor, signedInStaff, signInAndEnrol } from '../staff.js';
import { expect, test } from '../test.js';

test('an admin invites someone, who makes an account, enrols and joins the team', async ({
  page,
  newContext,
}) => {
  await signedInStaff(page, ['admin']);
  await page.goto('/equipo');
  await expectAccessible(page);
  const email = `nueva-${crypto.randomUUID()}@ejemplo.test`;
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('checkbox', { name: /Acogida/u }).check();
  await page.getByRole('button', { name: 'Enviar la invitación' }).click();
  await expect(page.getByText(`Invitación enviada a ${email}.`)).toBeVisible();

  await expect.poll(async () => (await mailFor(email)).length).toBe(1);
  const [mail] = await mailFor(email);
  const link = /https?:\/\/\S+\/invitacion#token=\S+/u.exec(mail?.text ?? '')?.[0];
  expect(link).toBeDefined();

  const invitee = await (await newContext()).newPage();
  await asVisitor(invitee);
  await invitee.goto(link ?? '');
  await expect(invitee.getByText(email)).toBeVisible();
  const name = `Persona invitada ${crypto.randomUUID().slice(0, 8)}`;
  await invitee.getByLabel('Tu nombre').fill(name);
  await invitee.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await invitee.getByLabel('Repite la contraseña').fill(PASSWORD);
  await invitee.getByRole('button', { name: 'Crear la cuenta y aceptar' }).click();
  await expect(invitee.getByText(/Tu cuenta está lista/u)).toBeVisible();
  await signInAndEnrol(invitee, email);
  await expect(invitee).toHaveURL(/\/$/u);

  await page.reload();
  await expect(page.getByRole('heading', { name })).toBeVisible();
});

test('the audit log is for admins only', async ({ page }) => {
  await signedInStaff(page, ['onboarding']);
  const response = await page.goto('/registro');
  expect(response?.status()).toBe(404);
});

test('an admin sees the audit log, without anyone’s email', async ({ page }) => {
  await signedInStaff(page, ['admin']);
  await page.goto('/registro');
  await expectAccessible(page);
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.content()).not.toMatch(/@ejemplo\.test/u);
});

test('a staff member without the second factor reaches only enrolment', async ({ page }) => {
  await asVisitor(page);
  const account = await createAccount();
  await page.goto('/entrar');
  await page.getByLabel('Correo electrónico').fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/verificacion\/alta$/u);
  await page.goto('/equipo');
  await expect(page).toHaveURL(/\/verificacion\/alta$/u);
});
