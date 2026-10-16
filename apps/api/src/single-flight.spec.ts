import { describe, expect, it } from 'vitest';

import { singleFlight } from './single-flight.js';

describe('singleFlight', () => {
  it('shares a run under way, and starts a new one once it is done, even after a failure', async () => {
    let runs = 0;
    let fail = false;
    const once = singleFlight(async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (fail) {
        throw new Error('Fallo de ejemplo');
      }
      return runs;
    });
    expect(await Promise.all([once(), once(), once()])).toEqual([1, 1, 1]);
    expect(await once()).toBe(2);
    fail = true;
    await expect(once()).rejects.toThrow('Fallo de ejemplo');
    fail = false;
    expect(await once()).toBe(4);
  });
});
