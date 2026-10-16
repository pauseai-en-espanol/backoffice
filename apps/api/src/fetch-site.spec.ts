import { describe, expect, it } from 'vitest';

import { fromAnotherSite } from './fetch-site.js';

describe('fromAnotherSite', () => {
  it.each([
    ['cross-site', true],
    ['same-site', true],
    ['same-origin', false],
    ['none', false],
    [undefined, false],
  ])('%s → %s', (site, refused) => {
    expect(fromAnotherSite({ headers: site === undefined ? {} : { 'sec-fetch-site': site } })).toBe(
      refused,
    );
  });
});
