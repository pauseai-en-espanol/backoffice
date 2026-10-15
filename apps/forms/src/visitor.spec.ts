import { describe, expect, it } from 'vitest';

import { visitorAddress } from './visitor';

describe('visitorAddress', () => {
  it("takes the last X-Forwarded-For entry, the gateway's, never an earlier one a client wrote", () => {
    expect(visitorAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(visitorAddress('198.51.100.1, 203.0.113.7')).toBe('203.0.113.7');
    expect(visitorAddress(' 198.51.100.1 ,2001:db8::7 , ')).toBe('2001:db8::7');
  });

  it('gives nothing for a missing or invalid last entry, rather than an earlier one', () => {
    expect(visitorAddress(undefined)).toBeUndefined();
    expect(visitorAddress(null)).toBeUndefined();
    expect(visitorAddress('')).toBeUndefined();
    expect(visitorAddress('203.0.113.7, not-an-address')).toBeUndefined();
  });
});
