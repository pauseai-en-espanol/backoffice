import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

const tag = () => crypto.randomUUID().slice(0, 8);

test('Siguiente: take the next target, open the letter in my own mail, and record that it went', async ({
  page,
}) => {
  await signedInStaff(page, ['outreach']);
  const origin = new URL(page.url()).origin;
  const post = async (method: 'POST' | 'PUT', url: string, data: object) => {
    const response = await page.request.fetch(url, { method, headers: { origin }, data });
    expect(response.status(), url).toBeLessThan(300);
    return response.status() === 204 ? {} : ((await response.json()) as { id?: string });
  };
  const name = `Carta de prueba ${tag()}`;
  const { id: campaign } = await post('POST', '/api/outreach/campaigns', {
    slug: `prueba-${tag()}`,
    name,
    signature: 'Equipo de ejemplo',
    status: 'active',
  });
  await post('PUT', `/api/outreach/campaigns/${campaign}/templates/A`, {
    subject: 'Para {{org}}',
    body: '{{saludo}}\n\n{{anchor}}\n\n{{firma}}',
    sources: ['https://ejemplo.test/carta'],
  });
  await post('PUT', `/api/outreach/campaigns/${campaign}/anchors/empleo`, {
    label: 'Empleo',
    text: 'Un párrafo de ejemplo con una cifra inventada.',
    sources: ['https://ejemplo.test/cifra'],
  });
  const person = `Berta Prueba ${tag()}`;
  const { id: contact } = await post('POST', '/api/outreach/contacts', {
    orgDisplay: `Asociación de prueba ${tag()}`,
    personName: person,
    email: `berta.${tag()}@ejemplo.test`,
    tier: 'A',
    anchor: 'empleo',
    reason: 'Preside una asociación de ejemplo',
    sources: ['https://ejemplo.test/fuente'],
  });
  await post('POST', `/api/outreach/campaigns/${campaign}/targets`, { contactIds: [contact] });

  await page.goto(`/siguiente?campana=${campaign}`);
  await expect(page.getByRole('heading', { name: person })).toBeVisible();
  await expect(page.getByText(`Estimado/a ${person}:`, { exact: false })).toBeVisible();
  // Nobody's yet: it is taken before anything can be sent.
  await expect(page.getByRole('link', { name: 'Abrir en mi correo' })).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Me lo quedo' }).click();
  const mail = page.getByRole('link', { name: 'Abrir en mi correo' });
  await expect(mail).toHaveAttribute('href', /^mailto:berta\.[\da-f]{8}@ejemplo\.test\?subject=/u);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Sí, enviada' }).click();
  await expect(page.getByText('No te queda nadie a quien escribir ahora mismo.')).toBeVisible();

  await page.goto(`/contactos/${contact}`);
  await expect(page.getByRole('link', { name })).toBeVisible();
  await expectAccessible(page);
});
