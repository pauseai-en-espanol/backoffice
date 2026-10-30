import { randomBytes, randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createReceiptStore, readReceiptsKey, ReceiptKeyError } from './receipt-store.js';

const RECEIPT = new TextEncoder().encode('%PDF-1.7 un justificante de ejemplo');

let root: string;
const key = randomBytes(32);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'justificantes-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the receipt store (ADR-0006 decision 7)', () => {
  it('writes a receipt encrypted, under its id alone, and reads it back', async () => {
    const store = createReceiptStore(root, key);
    const id = randomUUID();
    await store.put(id, RECEIPT);
    expect(await readdir(join(root, 'receipts'))).toEqual([id]);
    const onDisk = await readFile(join(root, 'receipts', id));
    expect(onDisk.includes(Buffer.from('justificante'))).toBe(false);
    expect(new Uint8Array((await store.get(id)) ?? [])).toEqual(RECEIPT);
    // Nothing temporary is left behind.
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it("refuses to open a file with another deployment's key, or as another receipt", async () => {
    const id = randomUUID();
    await createReceiptStore(root, key).put(id, RECEIPT);
    await expect(createReceiptStore(root, randomBytes(32)).get(id)).rejects.toBeInstanceOf(
      ReceiptKeyError,
    );
    const other = randomUUID();
    await copyFile(join(root, 'receipts', id), join(root, 'receipts', other));
    await expect(createReceiptStore(root, key).get(other)).rejects.toBeInstanceOf(ReceiptKeyError);
  });

  it('never writes over a receipt, answers nothing for one without a file, and removes one', async () => {
    const store = createReceiptStore(root, key);
    const id = randomUUID();
    await store.put(id, RECEIPT);
    await expect(store.put(id, new TextEncoder().encode('otro'))).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(new Uint8Array((await store.get(id)) ?? [])).toEqual(RECEIPT);
    expect(await store.get(randomUUID())).toBeUndefined();
    await store.remove(id);
    expect(await store.get(id)).toBeUndefined();
    await expect(store.get('../receipts')).rejects.toBeInstanceOf(TypeError);
  });

  it('sets aside files without a row, puts back those whose row came back, and clears old temporary files', async () => {
    const store = createReceiptStore(root, key);
    const kept = randomUUID();
    const stray = randomUUID();
    const returning = randomUUID();
    await store.put(kept, RECEIPT);
    await store.put(stray, RECEIPT);
    await store.put(returning, RECEIPT);
    await mkdir(join(root, 'orphans'), { recursive: true });
    await copyFile(join(root, 'receipts', returning), join(root, 'orphans', returning));
    await rm(join(root, 'receipts', returning));
    await writeFile(join(root, 'receipts', 'no-es-un-justificante'), 'x');
    const old = join(root, 'tmp', 'cortado');
    await writeFile(old, 'x');
    await utimes(
      old,
      new Date(Date.now() - 2 * 60 * 60_000),
      new Date(Date.now() - 2 * 60 * 60_000),
    );
    await writeFile(join(root, 'tmp', 'en-curso'), 'x');

    // Written once the API had started: an upload whose row may not be committed yet.
    const startedAt = new Date();
    const uploading = randomUUID();
    await store.put(uploading, RECEIPT);
    const past = new Date(startedAt.getTime() - 60_000);
    for (const id of [kept, stray]) {
      await utimes(join(root, 'receipts', id), past, past);
    }
    await utimes(
      join(root, 'receipts', uploading),
      new Date(startedAt.getTime() + 1000),
      new Date(startedAt.getTime() + 1000),
    );

    const rows = new Set<string>([kept, returning]);
    const result = await store.reconcile(
      async (ids) => ids.filter((id) => !rows.has(id)),
      startedAt,
    );
    expect(result).toEqual({ setAside: 1, restored: 1, temporary: 1 });
    expect((await readdir(join(root, 'receipts'))).sort()).toEqual(
      [kept, returning, uploading, 'no-es-un-justificante'].sort(),
    );
    expect(await readdir(join(root, 'orphans'))).toEqual([stray]);
    expect(await readdir(join(root, 'tmp'))).toEqual(['en-curso']);
    // Set aside, never served: its row is gone.
    expect(await store.get(stray)).toBeUndefined();
    expect(new Uint8Array((await store.get(returning)) ?? [])).toEqual(RECEIPT);
  });

  it('probes that it can write', async () => {
    await createReceiptStore(root, key).probe();
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
    await expect(createReceiptStore(join(root, 'no', '\0'), key).probe()).rejects.toThrow();
  });
});

describe('readReceiptsKey', () => {
  it('takes 32 random bytes in base64 and nothing else', () => {
    expect(readReceiptsKey(randomBytes(32).toString('base64'))?.length).toBe(32);
    expect(readReceiptsKey(randomBytes(16).toString('base64'))).toBeUndefined();
    expect(readReceiptsKey('no es una clave')).toBeUndefined();
    expect(readReceiptsKey(undefined)).toBeUndefined();
  });
});
