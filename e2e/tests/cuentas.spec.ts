import type { Page } from '@playwright/test';

import { readFile } from 'node:fs/promises';

import { expectAccessible } from '../axe.js';
import { signedInStaff } from '../staff.js';
import { expect, test } from '../test.js';

const tag = () => crypto.randomUUID().slice(0, 8);

/** This year in Madrid, as the books date it. */
const thisYear = Number(
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Europe/Madrid' }).format(
    new Date(),
  ),
);

/** A fictional receipt: a PDF's first bytes are what the API recognises it by. */
const RECEIPT = Buffer.from('%PDF-1.7\n% un justificante de prueba, inventado\n');

/**
 * This year open, as tesorería opens it in Ejercicios: the years after the last one, in order, or this one first. The
 * local database keeps what e2e runs write (fictional), so it may be open already.
 */
const openThisYear = async (page: Page) => {
  const origin = new URL(page.url()).origin;
  const { years } = (await (await page.request.get('/api/accounting/years')).json()) as {
    years: { year: number }[];
  };
  let last = years.length === 0 ? thisYear - 1 : Math.max(...years.map((each) => each.year));
  while (last < thisYear) {
    last += 1;
    const opened = await page.request.post('/api/accounting/years', {
      headers: { origin },
      data: { year: last },
    });
    expect(opened.status()).toBe(201);
  }
};

test('Cuentas: tesorería records an income with its receipt, corrects it, reads the reports and exports them; an admin reads', async ({
  page,
  newContext,
}) => {
  await signedInStaff(page, ['tesoreria']);
  await expect(page.getByRole('link', { name: 'Movimientos' })).toBeVisible();
  await openThisYear(page);
  const mark = tag();

  // The bank account, a sub-account of 572, and a donor with the tax ID and province the modelo 182 asks (D24).
  await page.goto('/cuentas/plan');
  await expectAccessible(page);
  const code = `572${String(Number.parseInt(mark.slice(0, 4), 16) % 10_000).padStart(4, '0')}`;
  const bank = `Cuenta de prueba ${mark}`;
  await page.getByRole('button', { name: 'Añadir una subcuenta' }).click();
  const newAccount = page.locator('#nueva-cuenta');
  await newAccount
    .getByLabel('Dentro de la cuenta')
    .selectOption({ label: '572 · Bancos e instituciones de crédito c/c vista, euros' });
  await newAccount.getByLabel('Código').fill(code);
  await newAccount.getByLabel('Nombre').fill(bank);
  await newAccount.getByRole('checkbox', { name: 'Cuenta de tesorería' }).check();
  await newAccount.getByLabel('IBAN').fill('ES55 0000 0000 0000 0000 0001');
  await newAccount.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(
    page.getByRole('rowheader', { name: new RegExp(`${code} · ${bank}`, 'u') }),
  ).toBeVisible();
  const donor = `Persona donante de prueba ${mark}`;
  await page.getByRole('button', { name: 'Añadir una contraparte' }).click();
  const newCounterparty = page.locator('#contraparte-nueva-formulario');
  await newCounterparty.getByLabel('Nombre').fill(donor);
  await newCounterparty.getByLabel('NIF').fill('00000000-T');
  await newCounterparty.getByLabel('Provincia').fill('Teruel');
  await newCounterparty.getByRole('button', { name: 'Añadir', exact: true }).click();
  const card = page
    .getByRole('listitem')
    .filter({ has: page.locator('strong', { hasText: donor }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('00000000T')).toBeVisible();

  // An income, written the Spanish way, posted at once.
  await page.goto('/cuentas/nuevo');
  await expectAccessible(page);
  const concept = `Donación de prueba ${mark}`;
  await page.getByLabel('Importe').fill('1.234,56');
  await page.getByLabel('Cuenta (banco o caja)').selectOption({ label: `${code} · ${bank}` });
  await page.getByLabel('Tipo de ingreso').selectOption({ label: '7400002 · Donaciones' });
  await page.getByLabel('Contraparte').selectOption({ label: donor });
  await page.getByLabel('Concepto').fill(concept);
  await page.getByRole('button', { name: 'Contabilizar' }).click();
  await expect(page).toHaveURL(/\/cuentas\/[\da-f-]{36}$/u);
  const original = page.url();
  await expect(
    page.getByRole('heading', { name: new RegExp(`^Asiento \\d+ de ${thisYear}$`, 'u') }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: '1.234,56 €' }).first()).toBeVisible();
  await expectAccessible(page);

  // Its receipt: stored encrypted, recognised by its first bytes, downloaded as it went in.
  await page.locator('#justificante').setInputFiles({
    name: 'factura de prueba.pdf',
    mimeType: 'application/pdf',
    buffer: RECEIPT,
  });
  await page.getByRole('button', { name: 'Adjuntar', exact: true }).click();
  const link = page.getByRole('link', { name: 'Descargar factura de prueba.pdf' });
  await expect(link).toBeVisible();
  const downloading = page.waitForEvent('download');
  await link.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('factura de prueba.pdf');
  expect((await readFile(await download.path())).equals(RECEIPT)).toBe(true);
  // Anything else, whatever its name, is refused.
  await page.locator('#justificante').setInputFiles({
    name: 'factura.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('<html><script>alert(1)</script>'),
  });
  await page.getByRole('button', { name: 'Adjuntar', exact: true }).click();
  await expect(page.getByText('El archivo no es un PDF, JPEG, PNG ni WebP.')).toBeVisible();

  // Movimientos lists it; a posted entry is corrected, never changed: its reversal, then the right one.
  await page.goto(`/cuentas?ejercicio=${thisYear}&buscar=${encodeURIComponent(mark)}`);
  await expect(page.getByRole('link', { name: new RegExp(concept, 'u') })).toBeVisible();
  await expectAccessible(page);
  await page.goto(original);
  await page.getByRole('button', { name: 'Corregir' }).click();
  await page.getByRole('button', { name: 'Sí, corregirlo' }).click();
  await expect(page).toHaveURL(/\/cuentas\/nuevo\?desde=/u);
  await expect(page.getByText('Escribe el movimiento correcto.')).toBeVisible();
  await expect(page.getByLabel('Importe')).toHaveValue('1234,56');
  await page.getByLabel('Importe').fill('1.200,00');
  await page.getByRole('button', { name: 'Contabilizar' }).click();
  await expect(page).toHaveURL(/\/cuentas\/[\da-f-]{36}$/u);
  await expect(page.getByRole('cell', { name: '1.200,00 €' }).first()).toBeVisible();
  await page.goto(original);
  await expect(page.getByText('Lo corrige un asiento posterior')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Corregir' })).toHaveCount(0);

  // The reports agree with what was posted, and the balance sheet balances.
  await page.goto(`/cuentas/informes?informe=balance&ejercicio=${thisYear}`);
  await expect(page.getByRole('heading', { name: `Balance · ${thisYear}` })).toBeVisible();
  await expect(page.getByText('El balance no cuadra')).toHaveCount(0);
  await expectAccessible(page);
  await page.goto(`/cuentas/informes?informe=ingresos-y-gastos&ejercicio=${thisYear}`);
  await expect(page.getByRole('rowheader', { name: '7400002 · Donaciones' })).toBeVisible();
  await page.goto(`/cuentas/informes?informe=diario&ejercicio=${thisYear}`);
  const exporting = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Exportar a CSV' }).click();
  const csv = await readFile(await (await exporting).path(), 'utf8');
  expect(csv.startsWith('﻿"asiento","fecha","concepto"')).toBe(true);
  expect(csv).toContain(concept);

  // An admin reads the books, and records nothing.
  const other = await newContext();
  const adminPage = await other.newPage();
  await signedInStaff(adminPage, ['admin']);
  await adminPage.goto(`/cuentas?ejercicio=${thisYear}&buscar=${encodeURIComponent(mark)}`);
  await expect(
    adminPage.getByRole('link', { name: new RegExp(concept, 'u') }).first(),
  ).toBeVisible();
  await expect(adminPage.getByRole('link', { name: 'Nuevo movimiento' })).toHaveCount(0);
  await adminPage.goto(original);
  await expect(
    adminPage.getByRole('link', { name: 'Descargar factura de prueba.pdf' }),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Adjuntar' })).toHaveCount(0);
  await adminPage.goto('/cuentas/nuevo');
  await expect(adminPage.getByText('Solo Tesorería anota movimientos.')).toBeVisible();
  await other.close();
});

test('Cuentas: someone without Tesorería or admin hears whom to ask', async ({ page }) => {
  await signedInStaff(page, ['onboarding']);
  await expect(page.getByRole('link', { name: 'Movimientos' })).toHaveCount(0);
  await page.goto('/cuentas');
  await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible();
  await expect(page.getByText('pide el rol de Tesorería')).toBeVisible();
});
