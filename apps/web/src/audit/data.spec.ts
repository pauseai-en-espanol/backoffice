import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));

const { changedFields, cursorFrom, parseAuditPage } = await import('./data');

const entry = {
  id: '42',
  at: '2026-10-15T20:00:00.000Z',
  actor: { userId: 'u1', displayName: 'Persona Ejemplo' },
  channel: 'web',
  action: 'update',
  table: 'staff',
  rowId: 'u2',
  diff: { old: { active: true }, new: { active: false }, personal: ['display_name'] },
};

describe('parseAuditPage', () => {
  it('takes a page as the API sends it, with or without an actor or channel', () => {
    const system = { ...entry, id: '41', actor: null, channel: null, diff: null };
    expect(parseAuditPage({ entries: [entry, system], next: '41' })).toEqual({
      entries: [entry, system],
      next: '41',
    });
    expect(parseAuditPage({ entries: [], next: null })).toEqual({ entries: [], next: null });
  });

  it('refuses a body it does not understand', () => {
    expect(
      parseAuditPage({ entries: [{ ...entry, channel: 'mail' }], next: null }),
    ).toBeUndefined();
    expect(parseAuditPage({ entries: [{ ...entry, id: 42 }], next: null })).toBeUndefined();
    expect(parseAuditPage({ entries: [entry] })).toBeUndefined();
  });
});

describe('cursorFrom', () => {
  it("takes an entry's id from the address, and nothing else", () => {
    expect(cursorFrom('123')).toBe('123');
    expect(cursorFrom(undefined)).toBeUndefined();
    expect(cursorFrom(['1', '2'])).toBeUndefined();
    expect(cursorFrom('0')).toBeUndefined();
    expect(cursorFrom('12&limit=1000')).toBeUndefined();
    expect(cursorFrom('-1')).toBeUndefined();
  });
});

describe('changedFields', () => {
  it('lists the fields an entry changed, and the personal ones apart, by name only', () => {
    expect(changedFields(entry.diff)).toEqual({ fields: ['active'], personal: ['display_name'] });
    expect(changedFields({ new: { role: 'admin', user_id: 'u' } })).toEqual({
      fields: ['role', 'user_id'],
      personal: [],
    });
    expect(changedFields(null)).toEqual({ fields: [], personal: [] });
  });
});
