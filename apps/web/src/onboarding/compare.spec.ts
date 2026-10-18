import { describe, expect, it } from 'vitest';

import { cellMatch, NOTHING } from './compare';

describe('the Bandeja marks what agrees and what differs (PLAN R68)', () => {
  it('says "igual" where they agree', () => {
    expect(cellMatch(true, true, 'Madrid', 'Madrid')).toBe('same');
  });

  it('says "distinto" only where both say something', () => {
    expect(cellMatch(true, false, 'Madrid', 'Sevilla')).toBe('different');
    expect(cellMatch(true, false, NOTHING, 'Sevilla')).toBe('none');
    expect(cellMatch(true, false, 'Madrid', NOTHING)).toBe('none');
  });

  it('says nothing on a row that is no comparison', () => {
    expect(cellMatch(false, false, 'Sí', 'No')).toBe('none');
  });
});
