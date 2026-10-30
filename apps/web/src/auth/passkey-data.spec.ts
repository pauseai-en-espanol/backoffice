import { describe, expect, it } from 'vitest';

import { parsePasskeys } from './passkey-data';

describe('parsePasskeys', () => {
  it('takes the list the API gives', () => {
    const passkey = {
      id: 'una-llave',
      name: 'Portátil',
      provider: null,
      synced: true,
      createdAt: '2026-10-30T08:00:00.000Z',
    };
    expect(parsePasskeys({ passkeys: [passkey] })).toEqual([passkey]);
    expect(parsePasskeys({ passkeys: [] })).toEqual([]);
  });

  it('refuses anything else, so the page never shows half an answer', () => {
    expect(parsePasskeys(undefined)).toBeUndefined();
    expect(parsePasskeys({ passkeys: 'no' })).toBeUndefined();
    expect(parsePasskeys({ passkeys: [{ id: 'una-llave', synced: 'sí' }] })).toBeUndefined();
  });
});
