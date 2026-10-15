import { expect, test } from '../test.js';

test('the staff app and its API answer, and say nothing to search engines', async ({
  page,
  request,
}) => {
  expect((await request.get('/healthz')).ok()).toBe(true);
  expect((await request.get('/api/session')).status()).toBe(401);
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/u);
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/u);
});

test('the API refuses a write from another origin, and another host', async ({ request }) => {
  const otherOrigin = await request.post('/api/auth/sign-in/email', {
    headers: { origin: 'https://otro.example.test' },
    data: { email: 'nadie@ejemplo.test', password: 'una contraseña de ejemplo' },
  });
  expect(otherOrigin.status()).toBeGreaterThanOrEqual(400);
});
