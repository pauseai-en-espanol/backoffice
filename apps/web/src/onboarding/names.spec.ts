import { describe, expect, it } from 'vitest';

import { personName } from './names';

describe('personName', () => {
  it('shows the name, or «Sin nombre» for someone without one', () => {
    expect(personName('Ana Ejemplo', 'Sin nombre')).toBe('Ana Ejemplo');
    expect(personName(null, 'Sin nombre')).toBe('Sin nombre');
    expect(personName('  ', 'Sin nombre')).toBe('Sin nombre');
  });
});
