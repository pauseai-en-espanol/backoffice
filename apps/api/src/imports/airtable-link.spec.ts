import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { LinkKeyError, openLink, readLinkKey, sealLink } from './airtable-link.js';

const LINK = 'https://airtable.com/appEjemplo000001/shrEjemplo0000001';
const key = () => randomBytes(32);

describe('the Airtable link, sealed for the database (ADR-0005)', () => {
  it('opens with the key it was sealed with, and holds nothing readable of the link', () => {
    const k = key();
    const sealed = sealLink(LINK, k);
    expect(sealed).toMatch(/^v1\.[\w-]+$/u);
    expect(sealed).not.toContain('airtable');
    expect(sealed).not.toContain('shrEjemplo');
    expect(openLink(sealed, k)).toBe(LINK);
  });

  it('seals the same link differently every time', () => {
    const k = key();
    expect(sealLink(LINK, k)).not.toBe(sealLink(LINK, k));
  });

  it("doesn't open with another key, nor once tampered with, nor shortened, and says nothing of the link", () => {
    const k = key();
    const sealed = sealLink(LINK, k);
    const raw = Buffer.from(sealed.slice(3), 'base64url');
    const flipped = (at: number) => {
      const copy = Buffer.from(raw);
      copy[at] = (copy[at] ?? 0) ^ 1;
      return `v1.${copy.toString('base64url')}`;
    };
    for (const [what, attempt] of [
      ['another key', () => openLink(sealed, key())],
      ['the nonce changed', () => openLink(flipped(0), k)],
      ['the tag changed', () => openLink(flipped(12), k)],
      ['the ciphertext changed', () => openLink(flipped(raw.length - 1), k)],
      ['cut short', () => openLink(`v1.${raw.subarray(0, 28).toString('base64url')}`, k)],
      ['another version', () => openLink(`v2.${sealed.slice(3)}`, k)],
      ['the link itself', () => openLink(LINK, k)],
    ] as const) {
      expect(attempt, what).toThrow(LinkKeyError);
      try {
        attempt();
      } catch (error) {
        expect(String(error), what).not.toContain('airtable.com');
      }
    }
  });

  it('takes a key of 32 bytes in base64, as `openssl rand -base64 32` writes it, and nothing else', () => {
    const good = randomBytes(32).toString('base64');
    expect(readLinkKey(good)?.length).toBe(32);
    for (const bad of [
      undefined,
      '',
      randomBytes(16).toString('base64'),
      randomBytes(33).toString('base64'),
      randomBytes(32).toString('base64url'),
      'x'.repeat(44),
    ]) {
      expect(readLinkKey(bad), String(bad)).toBeUndefined();
    }
  });
});
