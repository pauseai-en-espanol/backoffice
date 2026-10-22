import { describe, expect, it } from 'vitest';

import { type KnownDetails, missingDetails } from './missing.js';

const known: KnownDetails = {
  stage: 'new',
  hasPhone: true,
  hasEmail: true,
  province: 'Provincia de ejemplo',
  country: null,
  hasInterests: true,
};

describe('missingDetails', () => {
  it('says nothing is missing when the card knows it all', () => {
    expect(missingDetails(known)).toEqual([]);
  });

  it('lists what is missing in the order the card says it', () => {
    expect(
      missingDetails({
        ...known,
        hasPhone: false,
        hasEmail: false,
        province: null,
        hasInterests: false,
      }),
    ).toEqual(['phone', 'email', 'province', 'interests']);
    expect(missingDetails({ ...known, hasEmail: false, hasInterests: false })).toEqual([
      'email',
      'interests',
    ]);
  });

  it('counts a blank province as missing', () => {
    expect(missingDetails({ ...known, province: '  ' })).toEqual(['province']);
    expect(missingDetails({ ...known, province: null, country: 'ES' })).toEqual(['province']);
  });

  it('asks no region of someone living abroad (PLAN R74)', () => {
    expect(missingDetails({ ...known, province: null, country: 'DE' })).toEqual([]);
  });

  it('asks nothing of someone who left or was discarded, but still of someone dormant or unresponsive', () => {
    const nothing = { ...known, hasPhone: false, province: null };
    expect(missingDetails({ ...nothing, stage: 'left' })).toEqual([]);
    expect(missingDetails({ ...nothing, stage: 'discarded' })).toEqual([]);
    expect(missingDetails({ ...nothing, stage: 'dormant' })).toEqual(['phone', 'province']);
    expect(missingDetails({ ...nothing, stage: 'unresponsive' })).toEqual(['phone', 'province']);
  });
});
