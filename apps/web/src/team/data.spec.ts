import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));

const { parseInvitations, parsePrivateRecords, parseSuggestions, parseTeam } =
  await import('./data');

const member = {
  userId: 'u1',
  displayName: 'Persona Ejemplo',
  active: true,
  roles: ['admin', 'onboarding'],
  invitedBy: null,
  createdAt: '2026-10-15T20:00:00.000Z',
  deactivatedAt: null,
  personId: null,
};

const invitation = {
  id: 'i1',
  email: 'nueva@ejemplo.test',
  roles: ['outreach'],
  state: 'pending',
  createdAt: '2026-10-15T20:00:00.000Z',
  expiresAt: '2026-10-22T20:00:00.000Z',
  createdBy: { userId: 'u1', displayName: 'Persona Ejemplo' },
};

describe('parseTeam', () => {
  it('takes the team as the API sends it', () => {
    expect(parseTeam({ me: 'u1', staff: [member] })).toEqual({ me: 'u1', staff: [member] });
  });

  it('takes the person an account is linked to, and an older API without it as none (PLAN M5, step 5)', () => {
    const linked = { ...member, personId: 'p1' };
    expect(parseTeam({ me: 'u1', staff: [linked] })).toEqual({ me: 'u1', staff: [linked] });
    const { personId: _, ...older } = member;
    expect(parseTeam({ me: 'u1', staff: [older] })).toEqual({ me: 'u1', staff: [member] });
    expect(parseTeam({ me: 'u1', staff: [{ ...member, personId: 7 }] })).toBeUndefined();
  });

  it('refuses a body it does not understand, rather than render half of it', () => {
    expect(parseTeam({ staff: [member] })).toBeUndefined();
    expect(parseTeam({ me: 'u1', staff: [{ ...member, roles: ['root'] }] })).toBeUndefined();
    expect(parseTeam({ me: 'u1', staff: [{ ...member, active: 'yes' }] })).toBeUndefined();
    expect(parseTeam(undefined)).toBeUndefined();
  });
});

describe('parseSuggestions', () => {
  it('takes each account’s likely person, and nothing it does not understand', () => {
    const suggestion = { userId: 'u1', person: { id: 'p1', name: 'Persona Ejemplo' } };
    expect(parseSuggestions({ suggestions: [suggestion] })).toEqual([suggestion]);
    expect(parseSuggestions({ suggestions: [{ userId: 'u1' }] })).toBeUndefined();
  });
});

describe('parseInvitations', () => {
  it('takes the invitations as the API sends them', () => {
    expect(parseInvitations({ invitations: [invitation] })).toEqual([invitation]);
  });

  it('refuses an unknown state or a missing maker', () => {
    expect(parseInvitations({ invitations: [{ ...invitation, state: 'lost' }] })).toBeUndefined();
    expect(parseInvitations({ invitations: [{ ...invitation, createdBy: null }] })).toBeUndefined();
  });
});

describe("a departed member's private outreach records (PLAN M5, step 6)", () => {
  it('are counted, never shown, and anything else is refused', () => {
    const records = { userId: 'u2', contacts: 2, organisations: 0, notes: 5 };
    expect(parsePrivateRecords({ records: [records] })).toEqual([records]);
    expect(parsePrivateRecords({ records: [{ ...records, contacts: -1 }] })).toBeUndefined();
    expect(parsePrivateRecords({ records: [{ ...records, notes: '5' }] })).toBeUndefined();
    expect(parsePrivateRecords({})).toBeUndefined();
  });
});
