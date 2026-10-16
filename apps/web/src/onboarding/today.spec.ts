import { describe, expect, it } from 'vitest';

import { filtersFromPage } from './filters';
import { TODAY_UNASSIGNED, unassignedQueue } from './today';

const people = (count: number) => Array.from({ length: count }, (_, index) => `persona ${index}`);

describe("Hoy's unassigned queue (PLAN M5)", () => {
  it('shows the ten oldest, in the order they came, and links to all of them', () => {
    const queue = unassignedQueue(people(100), 93 + 100);
    expect(TODAY_UNASSIGNED).toBe(10);
    expect(queue.shown).toEqual(people(10));
    expect(queue.more?.count).toBe(193);
  });

  it('links to Personas filtered by Hoy’s own rule, the “Sin asignar” reason itself (PLAN M5)', () => {
    const href = unassignedQueue(people(11), 11).more?.href ?? '';
    expect(href).toBe('/personas?motivo=sin-asignar');
    const filters = filtersFromPage(Object.fromEntries(new URLSearchParams(href.split('?')[1])));
    expect(filters.reason).toBe('unassigned');
    expect(filters.stages).toEqual([]);
  });

  it('has no link when it already shows everyone', () => {
    expect(unassignedQueue(people(10), 10)).toEqual({ shown: people(10), more: undefined });
    expect(unassignedQueue(people(3), 3).more).toBeUndefined();
    expect(unassignedQueue([], 0)).toEqual({ shown: [], more: undefined });
  });

  it('counts at least what it was given, whatever the total says', () => {
    expect(unassignedQueue(people(12), 0).more?.count).toBe(12);
  });
});
