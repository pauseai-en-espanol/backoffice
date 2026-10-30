import { createAuthPool } from '@backoffice/db/auth-pool';
import { createDatabase } from '@backoffice/db/client';
import { madridToday } from '@backoffice/domain/days';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createReceiptStore } from '../src/accounting/receipt-store.js';
import { buildApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import {
  browser,
  createAccount,
  deleteAccount,
  limiterAddress,
  PASSWORD,
  SECRET,
  STAFF_ORIGIN,
  testAddress,
  TOTP_ISSUER,
  totpCode,
} from './auth-fixtures.js';
import './db.js';

/**
 * The books through the staff API (ADR-0006), against the matrix fixtures: the year before last closed, last year
 * open with its opening entry alone, this year open with a bank account, 5720001. What these tests post is committed
 * (posted entries are never deleted), so the clean-up puts the database back past the triggers.
 */

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.`);
  }
  return value;
};

const authPool = createAuthPool({
  connectionString: env('TEST_AUTH_DATABASE_URL'),
  maxConnections: 4,
});
const superuser = createAuthPool({
  connectionString: env('TEST_SUPERUSER_DATABASE_URL'),
  maxConnections: 1,
});
const appDb = createDatabase({ connectionString: env('TEST_APP_DATABASE_URL'), maxConnections: 2 });

/** The receipts' volume, a folder of its own for these tests. */
const volume = await mkdtemp(join(tmpdir(), 'justificantes-api-'));
const receipts = createReceiptStore(volume, randomBytes(32));

const app = buildApp({
  api: {
    auth: {
      auth: createAuth({
        pool: authPool,
        secret: SECRET,
        staffOrigin: STAFF_ORIGIN,
        totpIssuer: TOTP_ISSUER,
      }),
      staffOrigin: STAFF_ORIGIN,
    },
    app: appDb,
    receipts,
  },
});

const accounts: string[] = [];
const addresses: string[] = [];

const staffMember = async (...roles: string[]) => {
  const created = await createAccount(authPool);
  accounts.push(created.id);
  const address = testAddress();
  addresses.push(address);
  const who = browser(app, address);
  await who.send('POST', '/api/auth/sign-in/email', { email: created.email, password: PASSWORD });
  const { totpURI } = (
    await who.send('POST', '/api/auth/two-factor/enable', { password: PASSWORD })
  ).json<{ totpURI: string }>();
  await who.send('POST', '/api/auth/two-factor/verify-totp', { code: totpCode(totpURI) });
  await superuser.query(
    'INSERT INTO app.staff (user_id, display_name) SELECT id, name FROM auth.users WHERE id = $1',
    [created.id],
  );
  for (const role of roles) {
    await superuser.query('INSERT INTO app.staff_roles (user_id, role) VALUES ($1, $2)', [
      created.id,
      role,
    ]);
  }
  return { ...created, who };
};

const today = madridToday();
const year = Number(today.slice(0, 4));

let treasurer: Awaited<ReturnType<typeof staffMember>>;
let admin: Awaited<ReturnType<typeof staffMember>>;
let onboarder: Awaited<ReturnType<typeof staffMember>>;
/** Account ids by code, from the chart. */
const ids = new Map<string, string>();

beforeAll(async () => {
  await app.ready();
  treasurer = await staffMember('tesoreria');
  admin = await staffMember('admin');
  onboarder = await staffMember('onboarding');
  const { accounts: chart } = (await treasurer.who.send('GET', '/api/accounting/accounts')).json<{
    accounts: { id: string; code: string }[];
  }>();
  for (const account of chart) {
    ids.set(account.code, account.id);
  }
});

afterAll(async () => {
  await superuser.query("SET session_replication_role = 'replica'");
  const made = `(SELECT id FROM app.journal_entries WHERE created_by = ANY($1::uuid[]))`;
  await superuser.query(
    `UPDATE app.bank_statement_lines SET entry_id = NULL, matched_by = NULL, matched_at = NULL
      WHERE matched_by = ANY($1::uuid[]) OR entry_id IN ${made}`,
    [accounts],
  );
  await superuser.query(
    `DELETE FROM app.bank_statement_lines
      WHERE statement_id IN (SELECT id FROM app.bank_statements WHERE created_by = ANY($1::uuid[]))`,
    [accounts],
  );
  await superuser.query(`DELETE FROM app.receipts WHERE entry_id IN ${made}`, [accounts]);
  await superuser.query(`DELETE FROM app.journal_lines WHERE entry_id IN ${made}`, [accounts]);
  await superuser.query('DELETE FROM app.journal_entries WHERE created_by = ANY($1::uuid[])', [
    accounts,
  ]);
  await superuser.query(
    `UPDATE app.fiscal_years SET status = 'open', assembly_on = NULL, closed_at = NULL, closed_by = NULL
      WHERE closed_by = ANY($1::uuid[])`,
    [accounts],
  );
  for (const table of [
    'bank_statements',
    'budget_lines',
    'projects',
    'counterparties',
    'ledger_accounts',
    'exports',
    'fiscal_years',
  ]) {
    await superuser.query(`DELETE FROM app.${table} WHERE created_by = ANY($1::uuid[])`, [
      accounts,
    ]);
  }
  await superuser.query('DELETE FROM app.staff_roles WHERE user_id = ANY($1::uuid[])', [accounts]);
  await superuser.query('DELETE FROM app.staff WHERE user_id = ANY($1::uuid[])', [accounts]);
  await superuser.query("SET session_replication_role = 'origin'");
  for (const id of accounts) {
    await deleteAccount(authPool, id);
  }
  for (const address of addresses) {
    await authPool.query(
      `DELETE FROM rate_limits WHERE key LIKE $1 || '|%' OR key LIKE $2 || '|%'`,
      [address, limiterAddress(address)],
    );
  }
  await app.close();
  await appDb.destroy();
  await superuser.end();
  await authPool.end();
  await rm(volume, { recursive: true, force: true });
});

const account = (code: string): string => ids.get(code) ?? '';

const income = (fields: Record<string, unknown> = {}) => ({
  kind: 'income',
  date: today,
  description: 'Prueba: donación de ejemplo',
  amount: '1.234,56',
  treasuryAccountId: account('5720001'),
  accountId: account('7400002'),
  post: true,
  ...fields,
});

describe('who keeps the books (ADR-0006 decision 5)', () => {
  it('lets tesorería and admins read them, and nobody else', async () => {
    expect((await treasurer.who.send('GET', '/api/accounting/accounts')).statusCode).toBe(200);
    expect((await admin.who.send('GET', '/api/accounting/years')).statusCode).toBe(200);
    expect((await onboarder.who.send('GET', '/api/accounting/entries')).json()).toEqual({
      error: 'forbidden',
    });
    expect((await onboarder.who.send('GET', '/api/accounting/years')).statusCode).toBe(403);
  });

  it('lets tesorería alone record', async () => {
    expect((await admin.who.send('POST', '/api/accounting/entries', income())).json()).toEqual({
      error: 'forbidden',
    });
    expect(
      (
        await admin.who.send('POST', '/api/accounting/counterparties', {
          kind: 'person',
          name: 'Prueba Persona',
        })
      ).statusCode,
    ).toBe(403);
  });
});

describe('recording (accounting spec §2)', () => {
  it('posts an income written the Spanish way, and checks the donor’s tax ID', async () => {
    const refused = await treasurer.who.send('POST', '/api/accounting/counterparties', {
      kind: 'person',
      name: 'Prueba Persona donante',
      taxId: '00000000R',
    });
    expect(refused.json()).toEqual({ error: 'invalid', field: 'taxId' });
    const donor = await treasurer.who.send('POST', '/api/accounting/counterparties', {
      kind: 'person',
      name: 'Prueba Persona donante',
      taxId: '00000000-t',
      province: 'Teruel',
    });
    expect(donor.statusCode).toBe(201);
    const { id: counterpartyId } = donor.json<{ id: string }>();

    const posted = await treasurer.who.send(
      'POST',
      '/api/accounting/entries',
      income({ counterpartyId }),
    );
    expect(posted.statusCode).toBe(201);
    const { id, number } = posted.json<{ id: string; number: number }>();
    expect(number).toBeGreaterThan(0);
    const { entry } = (await admin.who.send('GET', `/api/accounting/entries/${id}`)).json<{
      entry: {
        status: string;
        amountCents: number;
        counterparty: { name: string };
        lines: unknown[];
      };
    }>();
    expect(entry).toMatchObject({
      status: 'posted',
      amountCents: 123_456,
      counterparty: { name: 'Prueba Persona donante' },
    });
    expect(entry.lines).toEqual([
      expect.objectContaining({ code: '5720001', debitCents: 123_456, creditCents: 0 }),
      expect.objectContaining({ code: '7400002', debitCents: 0, creditCents: 123_456 }),
    ]);
  });

  it('refuses accounts of the wrong kind, amounts that aren’t Spanish, and days it can’t take', async () => {
    const send = (fields: Record<string, unknown>) =>
      treasurer.who.send('POST', '/api/accounting/entries', income(fields));
    expect((await send({ accountId: account('626') })).json()).toEqual({
      error: 'invalid',
      field: 'accountId',
    });
    expect((await send({ treasuryAccountId: account('626') })).json()).toEqual({
      error: 'invalid',
      field: 'treasuryAccountId',
    });
    expect((await send({ accountId: account('740') })).json()).toEqual({
      error: 'invalid',
      field: 'accountId',
    });
    expect((await send({ amount: '12.34' })).json()).toEqual({ error: 'invalid', field: 'amount' });
    expect((await send({ amount: '0' })).json()).toEqual({ error: 'invalid', field: 'amount' });
    expect((await send({ date: `31/12/${year + 1}` })).json()).toEqual({
      error: 'future',
      field: 'date',
    });
    expect((await send({ date: `15/06/${year - 2}` })).json()).toEqual({
      error: 'yearClosed',
      field: 'date',
    });
  });

  it('never changes a posted entry; Corregir reverses it, once', async () => {
    const { id } = (await treasurer.who.send('POST', '/api/accounting/entries', income())).json<{
      id: string;
    }>();
    expect(
      (
        await treasurer.who.send(
          'PATCH',
          `/api/accounting/entries/${id}`,
          income({ amount: '1,00' }),
        )
      ).json(),
    ).toEqual({ error: 'posted' });
    expect((await treasurer.who.send('DELETE', `/api/accounting/entries/${id}`)).json()).toEqual({
      error: 'posted',
    });
    const reversal = await treasurer.who.send('POST', `/api/accounting/entries/${id}/reverse`, {});
    expect(reversal.statusCode).toBe(201);
    const { id: reversalId } = reversal.json<{ id: string }>();
    const { entry } = (
      await treasurer.who.send('GET', `/api/accounting/entries/${reversalId}`)
    ).json<{
      entry: { kind: string; reverses: string; description: string; lines: unknown[] };
    }>();
    expect(entry).toMatchObject({ kind: 'reversal', reverses: id });
    expect(entry.description).toMatch(
      /^Anula el asiento \d+ de \d{4}: Prueba: donación de ejemplo$/u,
    );
    expect(entry.lines).toEqual([
      expect.objectContaining({ code: '7400002', debitCents: 123_456 }),
      expect.objectContaining({ code: '5720001', creditCents: 123_456 }),
    ]);
    expect(
      (await treasurer.who.send('POST', `/api/accounting/entries/${id}/reverse`, {})).json(),
    ).toEqual({
      error: 'reversed',
    });
    expect(
      (
        await treasurer.who.send('POST', `/api/accounting/entries/${reversalId}/reverse`, {})
      ).json(),
    ).toEqual({ error: 'notReversible' });
  });

  it('keeps a manual entry as a draft until it balances, and deletes a draft', async () => {
    const lines = (debit: string, credit: string) => ({
      kind: 'manual',
      date: today,
      description: 'Prueba: asiento manual',
      lines: [
        { accountId: account('629'), debit },
        { accountId: account('5720001'), credit },
      ],
    });
    expect(
      (
        await treasurer.who.send('POST', '/api/accounting/entries', {
          ...lines('10', '9'),
          post: true,
        })
      ).json(),
    ).toEqual({ error: 'unbalanced' });
    const draft = await treasurer.who.send('POST', '/api/accounting/entries', lines('10', '9'));
    expect(draft.json()).toMatchObject({ number: null });
    const { id } = draft.json<{ id: string }>();
    expect((await treasurer.who.send('POST', `/api/accounting/entries/${id}/post`)).json()).toEqual(
      {
        error: 'unbalanced',
      },
    );
    const fixed = await treasurer.who.send('PATCH', `/api/accounting/entries/${id}`, {
      ...lines('10', '10'),
      post: true,
    });
    expect(fixed.json<{ number: number }>().number).toBeGreaterThan(0);
    const other = (
      await treasurer.who.send('POST', '/api/accounting/entries', lines('1', '2'))
    ).json<{
      id: string;
    }>();
    expect(
      (await treasurer.who.send('DELETE', `/api/accounting/entries/${other.id}`)).statusCode,
    ).toBe(204);
    expect(
      (await treasurer.who.send('GET', `/api/accounting/entries/${other.id}`)).statusCode,
    ).toBe(404);
  });
});

describe('reports (accounting spec §4)', () => {
  it('balance, and agree with each other', async () => {
    await treasurer.who.send('POST', '/api/accounting/entries', income({ amount: '50' }));
    const { report: balance } = (
      await admin.who.send('GET', `/api/accounting/reports/balance?year=${year}`)
    ).json<{
      report: {
        totalAssetsCents: number;
        totalLiabilitiesAndEquityCents: number;
        resultCents: number;
      };
    }>();
    expect(balance.totalAssetsCents).toBe(balance.totalLiabilitiesAndEquityCents);
    const { report: results } = (
      await admin.who.send('GET', `/api/accounting/reports/income-expenses?year=${year}`)
    ).json<{ report: { resultCents: number } }>();
    expect(results.resultCents).toBe(balance.resultCents);
    const { ledger } = (
      await admin.who.send(
        'GET',
        `/api/accounting/reports/ledger?year=${year}&account=${account('5720001')}`,
      )
    ).json<{
      ledger: { openingCents: number; closingCents: number; movements: { balanceCents: number }[] };
    }>();
    expect(ledger.movements.at(-1)?.balanceCents).toBe(ledger.closingCents);
    expect(ledger.closingCents).toBe(balance.totalAssetsCents);
    const { entries } = (
      await admin.who.send('GET', `/api/accounting/reports/journal?year=${year}`)
    ).json<{ entries: { description: string }[] }>();
    expect(entries.some((entry) => entry.description === 'Prueba: donación de ejemplo')).toBe(true);
  });

  it('refuses a range outside its year', async () => {
    expect(
      (
        await admin.who.send(
          'GET',
          `/api/accounting/reports/journal?year=${year}&from=01/01/${year - 1}`,
        )
      ).json(),
    ).toEqual({ error: 'invalid', field: 'to' });
  });

  it('exports as CSV, defused and recorded, only from the staff app', async () => {
    const csv = await treasurer.who.send('GET', `/api/accounting/exports/journal.csv?year=${year}`);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.headers['content-disposition']).toBe(`attachment; filename="diario-${year}.csv"`);
    expect(csv.body.startsWith('﻿"asiento","fecha","concepto"')).toBe(true);
    expect(csv.body).toContain('"1234,56"');
    const { rows } = await superuser.query<{ filter: { report: string } }>(
      `SELECT filter FROM app.exports WHERE kind = 'books_csv' AND created_by = $1`,
      [treasurer.id],
    );
    expect(rows.map((row) => row.filter.report)).toEqual(['journal']);
    expect(
      (
        await treasurer.who.send(
          'GET',
          `/api/accounting/exports/journal.csv?year=${year}`,
          undefined,
          {
            'sec-fetch-site': 'cross-site',
          },
        )
      ).statusCode,
    ).toBe(403);
  });
});

describe('closing a year (accounting spec §3)', () => {
  it('needs a recent second factor, the assembly’s date, and posts the next year’s opening entry', async () => {
    const late = await staffMember('tesoreria');
    await authPool.query(
      `UPDATE sessions SET created_at = now() - interval '13 hours' WHERE user_id = $1`,
      [late.id],
    );
    expect(
      (
        await late.who.send('POST', `/api/accounting/years/${year - 1}/close`, {
          assemblyOn: today,
        })
      ).json(),
    ).toEqual({ error: 'stepUp' });
    expect(
      (await late.who.send('GET', `/api/accounting/exports/balance.csv?year=${year}`)).json(),
    ).toEqual({ error: 'stepUp' });

    expect(
      (
        await treasurer.who.send('POST', `/api/accounting/years/${year - 1}/close`, {
          assemblyOn: `31/12/${year - 1}`,
        })
      ).json(),
    ).toEqual({ error: 'assemblyDate', field: 'assemblyOn' });
    expect(
      (
        await treasurer.who.send('POST', `/api/accounting/years/${year}/close`, {
          assemblyOn: today,
        })
      ).json(),
    ).toMatchObject({ error: 'assemblyDate' });
    const closed = await treasurer.who.send('POST', `/api/accounting/years/${year - 1}/close`, {
      assemblyOn: today,
    });
    expect(closed.statusCode).toBe(204);
    const { years } = (await admin.who.send('GET', '/api/accounting/years')).json<{
      years: { year: number; status: string; assemblyOn: string | null }[];
    }>();
    expect(years.find((each) => each.year === year - 1)).toMatchObject({
      status: 'closed',
      assemblyOn: today,
    });
    const { entries } = (
      await admin.who.send('GET', `/api/accounting/entries?year=${year}&status=posted`)
    ).json<{
      entries: { kind: string }[];
    }>();
    expect(entries.some((entry) => entry.kind === 'opening')).toBe(true);
    expect(
      (
        await treasurer.who.send('POST', `/api/accounting/years/${year - 1}/close`, {
          assemblyOn: today,
        })
      ).json(),
    ).toEqual({ error: 'alreadyClosed' });
  });
});

describe('receipts (ADR-0006 decision 7)', () => {
  const PDF = Buffer.from('%PDF-1.7\n% un justificante de ejemplo\n');

  /** A file as the staff app sends one: its bytes as the body, its name in X-File-Name. */
  const upload = (
    who: typeof treasurer.who,
    entryId: string,
    bytes: Buffer,
    /** null: no name at all. */
    name: string | null = 'factura de ejemplo.pdf',
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/accounting/entries/${entryId}/receipts`,
      headers: {
        host: new URL(STAFF_ORIGIN).host,
        origin: STAFF_ORIGIN,
        'x-forwarded-for': who.address,
        cookie: [...who.jar].map(([key, value]) => `${key}=${value}`).join('; '),
        'content-type': 'application/octet-stream',
        ...(name === null ? {} : { 'x-file-name': encodeURIComponent(name) }),
      },
      payload: bytes,
    });

  it('stores a receipt encrypted, recognised by its first bytes, and serves it only to the books’ readers', async () => {
    const { id: entryId } = (
      await treasurer.who.send('POST', '/api/accounting/entries', income())
    ).json<{
      id: string;
    }>();
    expect(
      (await upload(treasurer.who, entryId, Buffer.from('<html><script>'), 'factura.pdf')).json(),
    ).toEqual({
      error: 'fileType',
    });
    expect((await upload(treasurer.who, entryId, PDF, null)).json()).toEqual({
      error: 'invalid',
    });
    expect((await upload(admin.who, entryId, PDF)).json()).toEqual({ error: 'forbidden' });

    const stored = await upload(treasurer.who, entryId, PDF, 'factura de ejemplo ñ.pdf');
    expect(stored.statusCode).toBe(201);
    const { id } = stored.json<{ id: string }>();
    expect(stored.json()).toMatchObject({ contentType: 'application/pdf', byteSize: PDF.length });
    expect(await readdir(join(volume, 'receipts'))).toContain(id);

    const served = await admin.who.send('GET', `/api/accounting/receipts/${id}`);
    expect(served.statusCode).toBe(200);
    expect(served.rawPayload.equals(PDF)).toBe(true);
    expect(served.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="factura de ejemplo _.pdf"; filename*=UTF-8''${encodeURIComponent('factura de ejemplo ñ.pdf')}`,
      'content-security-policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
    });
    expect((await onboarder.who.send('GET', `/api/accounting/receipts/${id}`)).statusCode).toBe(
      403,
    );
    expect(
      (
        await admin.who.send('GET', `/api/accounting/receipts/${id}`, undefined, {
          'sec-fetch-site': 'cross-site',
        })
      ).statusCode,
    ).toBe(403);
    const { entry } = (await admin.who.send('GET', `/api/accounting/entries/${entryId}`)).json<{
      entry: { receiptList: { id: string; fileName: string }[] };
    }>();
    expect(entry.receiptList).toEqual([
      expect.objectContaining({ id, fileName: 'factura de ejemplo ñ.pdf' }),
    ]);
    // A posted entry's receipts stay with it.
    expect((await treasurer.who.send('DELETE', `/api/accounting/receipts/${id}`)).json()).toEqual({
      error: 'posted',
    });
    // Bytes that aren't the ones its row says are never served, whatever they are.
    await superuser.query(`UPDATE app.receipts SET sha256 = repeat('0', 64) WHERE id = $1`, [id]);
    const mismatched = await admin.who.send('GET', `/api/accounting/receipts/${id}`);
    expect(mismatched.statusCode).toBe(500);
    expect(mismatched.json()).toEqual({ error: 'unexpected' });
  });

  it('removes a draft’s receipts with their files, and attaches nothing in a closed year', async () => {
    const { id: draftId } = (
      await treasurer.who.send('POST', '/api/accounting/entries', income({ post: false }))
    ).json<{ id: string }>();
    const first = (await upload(treasurer.who, draftId, PDF)).json<{ id: string }>();
    const second = (await upload(treasurer.who, draftId, PDF)).json<{ id: string }>();
    expect(
      (await treasurer.who.send('DELETE', `/api/accounting/receipts/${first.id}`)).statusCode,
    ).toBe(204);
    expect(await receipts.get(first.id)).toBeUndefined();
    expect(
      (await treasurer.who.send('DELETE', `/api/accounting/entries/${draftId}`)).statusCode,
    ).toBe(204);
    expect(await receipts.get(second.id)).toBeUndefined();

    const { entries } = (
      await treasurer.who.send('GET', `/api/accounting/entries?year=${year - 2}&status=posted`)
    ).json<{ entries: { id: string; kind: string }[] }>();
    const closed = entries.find((each) => each.kind === 'income');
    expect((await upload(treasurer.who, closed?.id ?? '', PDF)).json()).toEqual({
      error: 'yearClosed',
    });
  });
});

describe('the bank (accounting spec §6, step 2)', () => {
  // Fictional Norma 43 files for the fixtures' bank account (bank and branch 0000, account 0000000001), built record
  // by record as packages/domain/src/norma43.spec.ts does.
  const pad = (text: string, length: number) => text.padEnd(length, ' ').slice(0, length);
  const digits = (value: number, length: number) => String(value).padStart(length, '0');
  const yymmdd = (day: string) => day.slice(2).replaceAll('-', '');

  interface Movement {
    day?: string;
    cents: number;
    text: string;
  }

  /** An account's records: its header, movements and footer. */
  const account43 = (
    movements: readonly Movement[],
    identity = '00000000' + '0000000001',
  ): string[] => {
    const days = movements.map((each) => each.day ?? today).sort();
    const from = yymmdd(days[0] ?? today);
    const to = yymmdd(days.at(-1) ?? today);
    const debits = movements.filter((each) => each.cents < 0);
    const credits = movements.filter((each) => each.cents > 0);
    const out = debits.reduce((sum, each) => sum - each.cents, 0);
    const into = credits.reduce((sum, each) => sum + each.cents, 0);
    const records = [
      `11${identity}${from}${to}2${digits(0, 14)}9783${pad('ASOCIACION DE EJEMPLO', 26)}${pad('', 3)}`,
      ...movements.flatMap((each) => [
        `22${pad('', 4)}0000${yymmdd(each.day ?? today)}${yymmdd(each.day ?? today)}04000${each.cents < 0 ? '1' : '2'}${digits(Math.abs(each.cents), 14)}${digits(0, 10)}${pad('', 12)}${pad('', 16)}`,
        `2301${pad(each.text, 38)}${pad('', 38)}`,
      ]),
      `33${identity}${digits(debits.length, 5)}${digits(out, 14)}${digits(credits.length, 5)}${digits(into, 14)}${into >= out ? '2' : '1'}${digits(Math.abs(into - out), 14)}978${pad('', 4)}`,
    ];
    return records;
  };

  /** A whole file of accounts' records, in ISO-8859-1 as banks write it, its end record counting them. */
  const file43 = (...accounts: readonly string[][]) => {
    const records = accounts.flat();
    return Buffer.from(
      [...records, `88${'9'.repeat(18)}${digits(records.length, 6)}${pad('', 54)}`].join('\r\n'),
      'latin1',
    );
  };

  const norma43 = (movements: readonly Movement[], identity?: string) =>
    file43(account43(movements, identity));

  /** A statement file as the staff app sends one: its bytes as the body; a dry run unless `apply`. */
  const send = (who: typeof treasurer.who, bytes: Buffer, apply = false) =>
    app.inject({
      method: 'POST',
      url: `/api/accounting/bank/statements${apply ? '?apply=true' : ''}`,
      headers: {
        host: new URL(STAFF_ORIGIN).host,
        origin: STAFF_ORIGIN,
        'x-forwarded-for': who.address,
        cookie: [...who.jar].map(([key, value]) => `${key}=${value}`).join('; '),
        'content-type': 'application/octet-stream',
      },
      payload: bytes,
    });

  interface Line {
    id: string;
    amountCents: number;
    description: string;
    entry: { id: string; corrected: boolean } | null;
    suggestions: { id: string }[];
  }

  const bank = async (who = treasurer.who, state = 'all') =>
    (
      await who.send('GET', `/api/accounting/bank?account=${account('5720001')}&state=${state}`)
    ).json<{
      lines: Line[];
      statements: { id: string; lines: number; matched: number }[];
      reconciliation: { asOf: string | null; bankCents: number | null; booksCents: number | null };
    }>();

  const mark = randomBytes(4).toString('hex').toUpperCase();
  const DONATION = { cents: 123_456, text: `TRANSFERENCIA DONACION ${mark}` };
  const FEE = { cents: -250, text: `COMISION MANTENIMIENTO ${mark}` };
  const lineOf = async (text: string) =>
    (await bank()).lines.find((each) => each.description === text);

  it('imports a statement as a dry run first, then for real, once; tesorería alone', async () => {
    const file = norma43([DONATION, FEE, { cents: 1000, text: `CUOTA ESPAÑA ${mark}` }]);
    const dry = await send(treasurer.who, file);
    expect(dry.statusCode).toBe(200);
    expect(dry.json()).toMatchObject({
      statements: [
        {
          iban: 'ES3600000000050000000001',
          account: { id: account('5720001'), code: '5720001' },
          lines: 3,
          new: 3,
          already: 0,
          closedYear: 0,
        },
      ],
      canApply: true,
    });
    // Read the way banks write it, in ISO-8859-1.
    expect(
      dry.json<{ preview: { description: string }[] }>().preview.map((each) => each.description),
    ).toEqual([DONATION.text, FEE.text, `CUOTA ESPAÑA ${mark}`]);
    expect(await lineOf(DONATION.text)).toBeUndefined();

    expect((await send(admin.who, file)).json()).toEqual({ error: 'forbidden' });
    expect((await send(admin.who, file, true)).statusCode).toBe(403);
    expect((await onboarder.who.send('GET', '/api/accounting/bank')).statusCode).toBe(403);

    const applied = await send(treasurer.who, file, true);
    expect(applied.statusCode).toBe(201);
    expect(await lineOf(DONATION.text)).toMatchObject({ amountCents: 123_456, entry: null });
    expect((await lineOf(FEE.text))?.amountCents).toBe(-250);
    // The same file again brings nothing: refused, and its dry run says why.
    expect((await send(treasurer.who, file, true)).json()).toEqual({ error: 'nothingNew' });
    expect((await send(treasurer.who, file)).json()).toMatchObject({
      statements: [{ new: 0, already: 3 }],
      canApply: false,
    });
    // An admin reads them.
    expect((await bank(admin.who)).lines.some((each) => each.description === FEE.text)).toBe(true);
  });

  it('refuses a file that isn’t Norma 43, an account not in the chart, and a closed year’s movements', async () => {
    expect((await send(treasurer.who, Buffer.from('fecha;concepto;importe\n'))).json()).toEqual({
      error: 'norma43',
      problem: 'record',
      line: 1,
    });
    const elsewhere = norma43([{ cents: 100, text: 'OTRA CUENTA' }], '99990000' + '0000000001');
    expect((await send(treasurer.who, elsewhere)).json()).toMatchObject({
      statements: [{ account: null, new: 0 }],
      canApply: false,
    });
    expect((await send(treasurer.who, elsewhere, true)).json()).toEqual({
      error: 'unknownAccount',
    });
    const closed = norma43([{ day: `${year - 2}-03-01`, cents: 100, text: `ANTIGUO ${mark}` }]);
    expect((await send(treasurer.who, closed)).json()).toMatchObject({
      statements: [{ new: 1, closedYear: 1 }],
      canApply: false,
    });
    expect((await send(treasurer.who, closed, true)).json()).toEqual({ error: 'yearClosed' });
  });

  it('counts each statement of a file on its own, the same account twice included', async () => {
    const twice = file43(
      account43([{ cents: 300, text: `PRIMERO ${mark}` }]),
      account43([
        { cents: 400, text: `SEGUNDO ${mark}` },
        { cents: 500, text: `TERCERO ${mark}` },
      ]),
    );
    expect((await send(treasurer.who, twice)).json()).toMatchObject({
      statements: [
        { lines: 1, new: 1, account: { code: '5720001' } },
        { lines: 2, new: 2, account: { code: '5720001' } },
      ],
      canApply: true,
    });
  });

  it('suggests the entry that records a line, and matches it when tesorería says so', async () => {
    const line = await lineOf(DONATION.text);
    const { id: entryId } = (
      await treasurer.who.send('POST', '/api/accounting/entries', income())
    ).json<{ id: string }>();
    expect(line?.suggestions.map((each) => each.id)).toBeDefined();
    expect((await lineOf(DONATION.text))?.suggestions.map((each) => each.id)).toContain(entryId);

    const match = (who: typeof treasurer.who, id: string) =>
      who.send('PUT', `/api/accounting/bank/lines/${line?.id}/match`, { entryId: id });
    expect((await match(admin.who, entryId)).statusCode).toBe(403);
    const other = (
      await treasurer.who.send('POST', '/api/accounting/entries', income({ amount: '1.234,55' }))
    ).json<{ id: string }>();
    // Of another amount: never suggested, never matched.
    expect((await lineOf(DONATION.text))?.suggestions.map((each) => each.id)).not.toContain(
      other.id,
    );
    expect((await match(treasurer.who, other.id)).json()).toEqual({ error: 'notAMatch' });
    expect((await match(treasurer.who, entryId)).statusCode).toBe(204);
    expect((await lineOf(DONATION.text))?.entry).toMatchObject({ id: entryId, corrected: false });
    expect((await match(treasurer.who, entryId)).json()).toEqual({ error: 'matchedAlready' });
    const { entry } = (await admin.who.send('GET', `/api/accounting/entries/${entryId}`)).json<{
      entry: { bankLines: { id: string; amountCents: number }[] };
    }>();
    expect(entry.bankLines).toEqual([
      expect.objectContaining({ id: line?.id, amountCents: 123_456 }),
    ]);

    // Undone, and matched again.
    const undo = () => treasurer.who.send('DELETE', `/api/accounting/bank/lines/${line?.id}/match`);
    expect((await undo()).statusCode).toBe(204);
    expect((await undo()).json()).toEqual({ error: 'notMatched' });
    expect((await match(treasurer.who, entryId)).statusCode).toBe(204);
    // Corrected, the entry stays matched, and the line waits for the right one.
    await treasurer.who.send('POST', `/api/accounting/entries/${entryId}/reverse`, {});
    expect((await lineOf(DONATION.text))?.entry).toMatchObject({ id: entryId, corrected: true });
    expect((await bank(treasurer.who, 'pending')).lines.map((each) => each.id)).toContain(line?.id);
  });

  it('records a line no entry records yet: Anotar posts the entry and matches it at once', async () => {
    const line = await lineOf(FEE.text);
    const fee = (fields: Record<string, unknown>) =>
      treasurer.who.send('POST', '/api/accounting/entries', {
        kind: 'expense',
        date: today,
        description: FEE.text,
        amount: '2,50',
        treasuryAccountId: account('5720001'),
        accountId: account('626'),
        bankLineId: line?.id,
        post: true,
        ...fields,
      });
    expect((await fee({ post: false })).json()).toEqual({ error: 'invalid', field: 'bankLineId' });
    expect((await fee({ amount: '2,51' })).json()).toEqual({ error: 'bankLine', field: 'amount' });
    const posted = await fee({});
    expect(posted.statusCode).toBe(201);
    const { id } = posted.json<{ id: string }>();
    expect((await lineOf(FEE.text))?.entry).toMatchObject({ id, corrected: false });
    expect((await fee({})).json()).toEqual({ error: 'bankLine', field: 'amount' });
  });

  it('tells what the bank and the books say, and undoes an import with nothing matched', async () => {
    const { reconciliation, statements } = await bank();
    expect(reconciliation.asOf).toBe(today);
    expect(reconciliation.bankCents).toBe(123_456 - 250 + 1000);
    // Last year is closed by now (closing a year, above): this year's opening entry carries all before it, so the
    // books say what this year's ledger of the account ends with.
    const { ledger } = (
      await treasurer.who.send(
        'GET',
        `/api/accounting/reports/ledger?year=${year}&account=${account('5720001')}`,
      )
    ).json<{ ledger: { closingCents: number } }>();
    expect(reconciliation.booksCents).toBe(ledger.closingCents);
    const matched = statements.find((each) => each.matched > 0 && each.lines === 3);
    expect(
      (await treasurer.who.send('DELETE', `/api/accounting/bank/statements/${matched?.id}`)).json(),
    ).toEqual({ error: 'matched' });
    const loose = await send(
      treasurer.who,
      norma43([{ cents: 700, text: `SUELTO ${mark}` }]),
      true,
    );
    const { statements: made } = loose.json<{ statements: { statementId: string }[] }>();
    const id = made[0]?.statementId;
    expect(
      (await admin.who.send('DELETE', `/api/accounting/bank/statements/${id}`)).statusCode,
    ).toBe(403);
    expect(
      (await treasurer.who.send('DELETE', `/api/accounting/bank/statements/${id}`)).statusCode,
    ).toBe(204);
    expect(await lineOf(`SUELTO ${mark}`)).toBeUndefined();
  });
});

describe('the budget (accounting spec §6, step 2)', () => {
  interface Budget {
    status: string;
    lines: { id: string; account: { code: string }; budgetCents: number; actualCents: number }[];
    unbudgeted: { account: { code: string } }[];
    income: { budgetCents: number; actualCents: number };
    expenses: { budgetCents: number; actualCents: number };
  }
  const budget = async (who = treasurer.who, of = year) =>
    (await who.send('GET', `/api/accounting/budget?year=${of}`)).json<{ budget: Budget }>().budget;

  it('sets a year’s budget by account, tesorería alone, and shows what came in and went out against it', async () => {
    const add = (who: typeof treasurer.who, code: string, amount = '300,00', of = year) =>
      who.send('POST', '/api/accounting/budget', { year: of, accountId: account(code), amount });
    expect((await add(admin.who, '7400002')).statusCode).toBe(403);
    expect((await onboarder.who.send('GET', '/api/accounting/budget')).statusCode).toBe(403);
    const added = await add(treasurer.who, '7400002', '1.500,00');
    expect(added.statusCode).toBe(201);
    const { id } = added.json<{ id: string }>();
    expect((await add(treasurer.who, '7400002')).json()).toEqual({
      error: 'taken',
      field: 'accountId',
    });
    expect((await add(treasurer.who, '626')).json()).toEqual({
      error: 'nested',
      field: 'accountId',
    });
    expect((await add(treasurer.who, '74')).json()).toEqual({
      error: 'nested',
      field: 'accountId',
    });
    expect((await add(treasurer.who, '5720001')).json()).toEqual({
      error: 'account',
      field: 'accountId',
    });
    expect((await add(treasurer.who, '720', '300,00', year - 2)).json()).toEqual({
      error: 'yearClosed',
      field: 'year',
    });
    expect((await add(treasurer.who, '720', '0,00')).json()).toEqual({
      error: 'invalid',
      field: 'amount',
    });

    await treasurer.who.send('POST', '/api/accounting/entries', income());
    const read = await budget(admin.who);
    const donations = read.lines.find((line) => line.account.code === '7400002');
    expect(donations).toMatchObject({ id, budgetCents: 150_000 });
    expect(donations?.actualCents).toBeGreaterThanOrEqual(123_456);
    // 62 counts its accounts': the bank's fee went to 626 (the bank, above).
    expect(read.lines.find((line) => line.account.code === '62')).toMatchObject({
      budgetCents: 50_000,
    });
    expect(
      read.lines.find((line) => line.account.code === '62')?.actualCents,
    ).toBeGreaterThanOrEqual(250);
    expect(read.income.budgetCents).toBe(150_000);
    expect(read.unbudgeted.map((each) => each.account.code)).not.toContain('7400002');

    expect(
      (await treasurer.who.send('PATCH', `/api/accounting/budget/${id}`, { amount: '1.600,00' }))
        .statusCode,
    ).toBe(204);
    expect((await budget()).lines.find((line) => line.id === id)?.budgetCents).toBe(160_000);
    expect((await treasurer.who.send('DELETE', `/api/accounting/budget/${id}`)).statusCode).toBe(
      204,
    );
    expect((await budget()).lines.some((line) => line.id === id)).toBe(false);
    // A closed year's is read, and never changed.
    const closed = await budget(treasurer.who, year - 2);
    expect(closed.status).toBe('closed');
    const line = closed.lines[0];
    expect(
      (
        await treasurer.who.send('PATCH', `/api/accounting/budget/${line?.id}`, { amount: '1,00' })
      ).json(),
    ).toEqual({ error: 'yearClosed' });
    expect(
      (await treasurer.who.send('GET', `/api/accounting/budget?year=${year + 5}`)).json(),
    ).toEqual({
      error: 'yearNotOpen',
    });
  });
});
