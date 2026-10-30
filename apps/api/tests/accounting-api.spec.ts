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
