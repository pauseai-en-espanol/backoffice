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

/** A fictional Spanish IBAN for bank and branch 0000 and this account number, its check digits right. */
const ibanFor = (account: string): string => {
  const bban = `0000000000${account}`;
  let remainder = 0;
  for (const digit of `${bban}142800`) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return `ES${String(98 - remainder).padStart(2, '0')}${bban}`;
};

/** A fictional Norma 43 statement of that account, today, with these movements, built as the standard lays it out. */
const norma43 = (
  account: string,
  movements: readonly { cents: number; text: string }[],
): Buffer => {
  const pad = (text: string, length: number) => text.padEnd(length, ' ').slice(0, length);
  const digits = (value: number, length: number) => String(value).padStart(length, '0');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(new Date())
    .slice(2)
    .replaceAll('-', '');
  const identity = `00000000${account}`;
  const out = movements.filter((each) => each.cents < 0);
  const into = movements.filter((each) => each.cents > 0);
  const outCents = out.reduce((sum, each) => sum - each.cents, 0);
  const intoCents = into.reduce((sum, each) => sum + each.cents, 0);
  const records = [
    `11${identity}${day}${day}2${digits(0, 14)}9783${pad('ASOCIACION DE EJEMPLO', 26)}${pad('', 3)}`,
    ...movements.flatMap((each) => [
      `22${pad('', 4)}0000${day}${day}04000${each.cents < 0 ? '1' : '2'}${digits(Math.abs(each.cents), 14)}${digits(0, 10)}${pad('', 12)}${pad('', 16)}`,
      `2301${pad(each.text, 38)}${pad('', 38)}`,
    ]),
    `33${identity}${digits(out.length, 5)}${digits(outCents, 14)}${digits(into.length, 5)}${digits(intoCents, 14)}2${digits(intoCents - outCents, 14)}978${pad('', 4)}`,
  ];
  return Buffer.from(
    [...records, `88${'9'.repeat(18)}${digits(records.length, 6)}${pad('', 54)}`].join('\r\n'),
    'latin1',
  );
};

test('Cuentas: tesorería imports a statement, matches one line and records the other, and sets a budget; an admin reads', async ({
  page,
  newContext,
}) => {
  await signedInStaff(page, ['tesoreria']);
  await openThisYear(page);
  const origin = new URL(page.url()).origin;
  const mark = tag();
  const number = String(Number.parseInt(mark, 16) % 10_000_000_000).padStart(10, '0');
  const suffix = String(Number.parseInt(mark.slice(0, 4), 16) % 10_000).padStart(4, '0');
  // A bank account of its own, and an expense account of its own, so earlier runs' data never get in the way.
  const create = async (body: Record<string, unknown>) => {
    const answer = await page.request.post('/api/accounting/accounts', {
      headers: { origin },
      data: body,
    });
    expect(answer.status()).toBe(201);
    return ((await answer.json()) as { id: string }).id;
  };
  const bankName = `Banco de prueba ${mark}`;
  const bank = await create({
    code: `572${suffix}`,
    name: bankName,
    parentCode: '572',
    treasury: true,
    iban: ibanFor(number),
  });
  const feesName = `Comisiones de prueba ${mark}`;
  await create({ code: `629${suffix}`, name: feesName, parentCode: '629' });
  const posted = await page.request.post('/api/accounting/entries', {
    headers: { origin },
    data: {
      kind: 'income',
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()),
      description: `Cuota de prueba ${mark}`,
      amount: '50,00',
      treasuryAccountId: bank,
      accountId: (
        (await (await page.request.get('/api/accounting/accounts')).json()) as {
          accounts: { id: string; code: string }[];
        }
      ).accounts.find((each) => each.code === '7400002')?.id,
      post: true,
    },
  });
  expect(posted.status()).toBe(201);
  const { number: entryNumber } = (await posted.json()) as { number: number };

  // Banco isn't in the menu (PLAN R95): Movimientos leads there. The statement, reviewed first: nothing is written
  // until "Importar".
  await page.goto('/cuentas');
  await page
    .getByRole('link', { name: 'Banco: los extractos importados y su conciliación' })
    .click();
  // Movimientos has a "Cuenta" too: choose in Banco's, once it is there.
  await expect(page.getByRole('heading', { name: 'Banco', level: 1 })).toBeVisible();
  await page
    .getByLabel('Cuenta', { exact: true })
    .selectOption({ label: `572${suffix} · ${bankName}` });
  await page.getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`cuenta=${bank}`, 'u'));
  await expectAccessible(page);
  await page.locator('#extracto').setInputFiles({
    name: 'extracto de prueba.n43',
    mimeType: 'text/plain',
    buffer: norma43(number, [
      { cents: 5000, text: `TRANSFERENCIA CUOTA ${mark}` },
      { cents: -150, text: `COMISION MANTENIMIENTO ${mark}` },
    ]),
  });
  await page.getByRole('button', { name: 'Revisar' }).click();
  await expect(page.getByText(`Va a 572${suffix} · ${bankName}.`)).toBeVisible();
  await expect(page.getByText('Movimientos: 2 · nuevos: 2 · ya importados: 0')).toBeVisible();
  await expectAccessible(page);
  await expect(page.getByRole('cell', { name: `COMISION MANTENIMIENTO ${mark}` })).toBeVisible();
  await expect(page.getByText('No hay movimientos del banco con este filtro.')).toBeVisible();
  await page.getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(page.getByText('Movimientos: 2 · nuevos: 2')).toHaveCount(0);
  const transfer = page.getByRole('row').filter({ hasText: `TRANSFERENCIA CUOTA ${mark}` });
  const fee = page.getByRole('row').filter({ hasText: `COMISION MANTENIMIENTO ${mark}` });
  await expect(transfer).toBeVisible();
  await expect(fee).toBeVisible();

  // The income posted before is suggested for the transfer, and matched when tesorería says so.
  await transfer
    .getByRole('button', { name: `Conciliar con el asiento ${entryNumber} de ${thisYear}` })
    .click();
  await expect(transfer).toHaveCount(0);
  // The fee has no entry yet: "Anotar" writes it, posted and matched at once, then Banco again.
  await fee.getByRole('link', { name: /^Anotar/u }).click();
  await expect(page.getByText('Anotas un movimiento del banco')).toBeVisible();
  await expect(page.getByLabel('Importe')).toHaveValue('1,50');
  await expect(page.getByRole('button', { name: 'Guardar borrador' })).toHaveCount(0);
  await page.getByLabel('Tipo de gasto').selectOption({ label: `629${suffix} · ${feesName}` });
  await page.getByRole('button', { name: 'Contabilizar' }).click();
  await expect(page).toHaveURL(/\/cuentas\/banco\?cuenta=/u);
  await expect(page.getByText('Ningún movimiento del banco por conciliar.')).toBeVisible();
  await expect(page.getByText('Coinciden.')).toBeVisible();
  await page.goto(`/cuentas/banco?cuenta=${bank}&estado=all`);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: `TRANSFERENCIA CUOTA ${mark}` })
      .getByRole('link', { name: `Asiento ${entryNumber} de ${thisYear}` }),
  ).toBeVisible();
  await expectAccessible(page);

  // A budget for the fees' account: what was posted against it.
  await page.goto(`/cuentas/presupuesto?ejercicio=${thisYear}`);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Añadir una línea' }).click();
  await page
    .getByLabel('Cuenta de ingresos o de gastos')
    .selectOption({ label: `629${suffix} · ${feesName}` });
  await page.getByLabel('Importe presupuestado').fill('10,00');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  // Its row, once a budget line: what was used of it, then what was posted (until then it was "Sin presupuestar").
  const budgeted = page.getByRole('row').filter({ hasText: feesName });
  await expect(budgeted.getByRole('cell', { name: '15 %' })).toBeVisible();
  await expect(budgeted.getByRole('cell', { name: '1,50 €' })).toHaveCount(1);
  await expectAccessible(page);

  // An admin reads both, and changes neither.
  const other = await newContext();
  const adminPage = await other.newPage();
  await signedInStaff(adminPage, ['admin']);
  await adminPage.goto(`/cuentas/banco?cuenta=${bank}&estado=all`);
  await expect(adminPage.getByText(`TRANSFERENCIA CUOTA ${mark}`)).toBeVisible();
  await expect(adminPage.getByText('Solo Tesorería importa extractos y concilia.')).toBeVisible();
  await expect(adminPage.locator('#extracto')).toHaveCount(0);
  await expect(adminPage.getByRole('button', { name: /^Deshacer/u })).toHaveCount(0);
  await adminPage.goto(`/cuentas/presupuesto?ejercicio=${thisYear}`);
  await expect(
    adminPage.getByRole('row').filter({ hasText: feesName }).getByRole('cell', { name: '10,00 €' }),
  ).toBeVisible();
  await expect(adminPage.getByRole('button', { name: 'Añadir una línea' })).toHaveCount(0);
  await other.close();
});

test('Cuentas: someone without Tesorería or admin hears whom to ask', async ({ page }) => {
  await signedInStaff(page, ['onboarding']);
  await expect(page.getByRole('link', { name: 'Movimientos' })).toHaveCount(0);
  await page.goto('/cuentas');
  await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible();
  await expect(page.getByText('pide el rol de Tesorería')).toBeVisible();
});
