import type { FileHandle } from 'node:fs/promises';

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { link, mkdir, open, readdir, readFile, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Receipts' bytes on the API's volume (ADR-0006 decision 7): each file named by its receipt's id, never by what the
 * uploader called it, and encrypted with RECEIPTS_KEY before it is written (AES-256-GCM, a fresh 12-byte nonce, the
 * receipt's id as associated data), so a copy of the volume reveals nothing without the key and a file can't stand in
 * for another receipt's. Written as aiontheballot's file store writes (its ADR-0004): to a temporary name on the same
 * volume, flushed, then linked into place (never over another file) and the folder flushed, so a reader never sees half
 * a file. The row is the database's, under RLS: the routes read it first, and only then this store.
 *
 * A file without a row (a crash between writing it and committing its row, or a database restored from before it) is
 * set aside in `orphans/`, never served and never deleted here; one set aside whose row has come back is put back
 * (`reconcile`, as the API starts). Deleting them for good is a person's step (docs/runbooks/receipts.md).
 */

const RECEIPTS = 'receipts';
const ORPHANS = 'orphans';
const TMP = 'tmp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** `BKR1`: the format's mark and version, before the nonce, the tag and the ciphertext. */
const MAGIC = Buffer.from('BKR1', 'latin1');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** A file that doesn't open with this key and this receipt's id: another deployment's key, or not this receipt's. */
export class ReceiptKeyError extends Error {
  constructor() {
    super("A receipt's file doesn't open with this deployment's key and its own id");
    this.name = 'ReceiptKeyError';
  }
}

/** RECEIPTS_KEY: 32 random bytes in base64 (`openssl rand -base64 32`), or undefined if it isn't one. */
export const readReceiptsKey = (value: string | undefined): Buffer | undefined => {
  if (value === undefined || !/^[A-Za-z0-9+/]{43}=$/u.test(value)) {
    return undefined;
  }
  const key = Buffer.from(value, 'base64');
  return key.length === 32 ? key : undefined;
};

const purposeOf = (id: string): Buffer => Buffer.from(`backoffice:receipt:v1:${id}`, 'utf8');

export const sealReceipt = (id: string, bytes: Uint8Array, key: Buffer): Buffer => {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(purposeOf(id));
  const body = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]);
};

/** The bytes a sealed file holds. Throws ReceiptKeyError if it doesn't open with `key` as receipt `id`'s. */
export const openReceipt = (id: string, sealed: Buffer, key: Buffer): Buffer => {
  const head = MAGIC.length + NONCE_BYTES + TAG_BYTES;
  if (sealed.length < head || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new ReceiptKeyError();
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      sealed.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(purposeOf(id));
    decipher.setAuthTag(sealed.subarray(MAGIC.length + NONCE_BYTES, head));
    return Buffer.concat([decipher.update(sealed.subarray(head)), decipher.final()]);
  } catch {
    throw new ReceiptKeyError();
  }
};

export interface ReceiptStore {
  /** Encrypts and writes a receipt's bytes under its id; refuses an id that has a file already. */
  put: (id: string, bytes: Uint8Array) => Promise<void>;
  /** A receipt's bytes, decrypted; undefined if it has no file. Throws ReceiptKeyError if it doesn't open. */
  get: (id: string) => Promise<Buffer | undefined>;
  /** Deletes a receipt's file, if there is one: a draft's receipt removed by tesorería. */
  remove: (id: string) => Promise<void>;
  /**
   * As the API starts: deletes temporary files older than an hour (a write cut short), sets aside every file written
   * before `startedAt` whose receipt has no row, and puts back every file set aside whose row has come back. Files
   * written since are an upload in progress, whose row may not be committed yet: left alone, so the API can serve while
   * this runs. `withoutRow` says which of the ids it is given have no row (private.receipts_without_row). Names that
   * aren't a receipt's id are left alone.
   */
  reconcile: (
    withoutRow: (ids: string[]) => Promise<string[]>,
    startedAt: Date,
  ) => Promise<{ setAside: number; restored: number; temporary: number }>;
  /** Writes, flushes and deletes a probe file, so the API can say at start whether it can store a receipt. */
  probe: () => Promise<void>;
}

/** Flushes a folder, so a link into it survives a crash. */
const syncDirectory = async (path: string): Promise<void> => {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/** Writes the whole file and flushes it to the disk before returning. */
const writeSynced = async (path: string, bytes: Uint8Array): Promise<void> => {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, 'wx');
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle?.close();
  }
};

const missing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';

/** A folder's receipt ids, or none if it doesn't exist. */
const idsIn = async (path: string): Promise<string[]> => {
  try {
    return (await readdir(path)).filter((name) => UUID.test(name));
  } catch (error) {
    if (missing(error)) {
      return [];
    }
    throw error;
  }
};

/**
 * Moves a file to another folder, never over one already there (`link` refuses that): false if one was, and the file
 * stays where it was.
 */
const moveWithoutReplacing = async (from: string, to: string): Promise<boolean> => {
  try {
    await link(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    throw error;
  }
  await unlink(from);
  return true;
};

const BATCH = 1000;

export const createReceiptStore = (root: string, key: Buffer): ReceiptStore => {
  const receipts = join(root, RECEIPTS);
  const orphans = join(root, ORPHANS);
  const temporary = join(root, TMP);
  const pathOf = (folder: string, id: string): string => {
    if (!UUID.test(id)) {
      throw new TypeError("Not a receipt's id");
    }
    return join(folder, id);
  };

  /** Which of `ids` have no row, asked in batches. */
  const askWithoutRow = async (
    ids: string[],
    withoutRow: (ids: string[]) => Promise<string[]>,
  ): Promise<Set<string>> => {
    const found = new Set<string>();
    for (let start = 0; start < ids.length; start += BATCH) {
      for (const id of await withoutRow(ids.slice(start, start + BATCH))) {
        found.add(id);
      }
    }
    return found;
  };

  return {
    put: async (id, bytes) => {
      const target = pathOf(receipts, id);
      await mkdir(receipts, { recursive: true });
      await mkdir(temporary, { recursive: true });
      const written = join(temporary, randomUUID());
      try {
        await writeSynced(written, sealReceipt(id, bytes, key));
        // The temporary folder is on the same volume, so the link is atomic; it never replaces a file.
        await link(written, target);
        await syncDirectory(receipts);
      } finally {
        await rm(written, { force: true });
      }
    },
    get: async (id) => {
      let sealed: Buffer;
      try {
        sealed = await readFile(pathOf(receipts, id));
      } catch (error) {
        if (missing(error)) {
          return undefined;
        }
        throw error;
      }
      return openReceipt(id, sealed, key);
    },
    remove: async (id) => {
      await rm(pathOf(receipts, id), { force: true });
    },
    reconcile: async (withoutRow, startedAt) => {
      let removed = 0;
      for (const name of await readdir(temporary).catch((error: unknown) => {
        if (missing(error)) {
          return [];
        }
        throw error;
      })) {
        const path = join(temporary, name);
        const { mtimeMs } = await stat(path).catch(() => ({ mtimeMs: Date.now() }));
        if (Date.now() - mtimeMs > 60 * 60_000) {
          await rm(path, { force: true });
          removed += 1;
        }
      }

      await mkdir(orphans, { recursive: true });
      let setAside = 0;
      const stored = await idsIn(receipts);
      for (const id of await askWithoutRow(stored, withoutRow)) {
        const { mtimeMs } = await stat(pathOf(receipts, id));
        if (mtimeMs < startedAt.getTime()) {
          setAside += (await moveWithoutReplacing(pathOf(receipts, id), pathOf(orphans, id)))
            ? 1
            : 0;
        }
      }
      let restored = 0;
      const aside = await idsIn(orphans);
      const stillWithout = await askWithoutRow(aside, withoutRow);
      for (const id of aside.filter((each) => !stillWithout.has(each))) {
        await mkdir(receipts, { recursive: true });
        restored += (await moveWithoutReplacing(pathOf(orphans, id), pathOf(receipts, id))) ? 1 : 0;
      }
      if (setAside + restored > 0) {
        await syncDirectory(orphans);
        await syncDirectory(receipts);
      }
      return { setAside, restored, temporary: removed };
    },
    probe: async () => {
      await mkdir(temporary, { recursive: true });
      const path = join(temporary, `probe-${randomUUID()}`);
      try {
        await writeSynced(path, new TextEncoder().encode('probe'));
      } finally {
        await rm(path, { force: true });
      }
    },
  };
};
