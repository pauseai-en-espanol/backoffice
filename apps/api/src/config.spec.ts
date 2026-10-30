import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { readReceipts } from './config.js';

describe('readReceipts (ADR-0006 decision 7)', () => {
  const key = randomBytes(32).toString('base64');

  it('takes the volume’s folder and the key together, or neither', () => {
    expect(readReceipts({})).toBeUndefined();
    expect(readReceipts({ RECEIPTS_ROOT: '/data/receipts', RECEIPTS_KEY: key })).toMatchObject({
      root: '/data/receipts',
    });
    expect(() => readReceipts({ RECEIPTS_ROOT: '/data/receipts' })).toThrow('RECEIPTS_KEY not set');
    expect(() => readReceipts({ RECEIPTS_KEY: key })).toThrow('RECEIPTS_ROOT not set');
  });

  it('refuses a relative folder, and a key that isn’t 32 bytes, without echoing it', () => {
    expect(() => readReceipts({ RECEIPTS_ROOT: 'data', RECEIPTS_KEY: key })).toThrow('absolute');
    const short = randomBytes(16).toString('base64');
    expect(() => readReceipts({ RECEIPTS_ROOT: '/data/receipts', RECEIPTS_KEY: short })).toThrow(
      /^RECEIPTS_KEY must be 32 random bytes/u,
    );
    try {
      readReceipts({ RECEIPTS_ROOT: '/data/receipts', RECEIPTS_KEY: short });
    } catch (error) {
      expect((error as Error).message).not.toContain(short);
    }
  });
});
