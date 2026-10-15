import { describe, expect, it } from 'vitest';

import { isToken, tokenFromHash } from './token';

// Made up for the tests: the shape of a token, not one.
const TOKEN = 'abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ-0123';

describe('tokenFromHash', () => {
  it('reads the token from the fragment, with or without its #', () => {
    expect(tokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash(`token=${TOKEN}&other=1`)).toBe(TOKEN);
  });

  it('finds none when there is none, or it is not a token', () => {
    expect(tokenFromHash('')).toBeUndefined();
    expect(tokenFromHash('#other=1')).toBeUndefined();
    expect(tokenFromHash('#token=short')).toBeUndefined();
    expect(tokenFromHash(`#token=${TOKEN}%20`)).toBeUndefined();
    expect(tokenFromHash(`#token=${'a'.repeat(201)}`)).toBeUndefined();
  });
});

describe('isToken', () => {
  it('checks a body token has a token shape', () => {
    expect(isToken(TOKEN)).toBe(true);
    expect(isToken(42)).toBe(false);
    expect(isToken('a/b'.repeat(10))).toBe(false);
  });
});
