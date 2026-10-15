import { describe, expect, it } from 'vitest';

import { actorOf, type FoundSession, stageOf } from './session.js';

const found = (aal: number, enrolled: boolean | null): FoundSession => ({
  session: { id: 's', aal },
  user: {
    id: '0190f8c4-0000-7000-8000-000000000101',
    name: 'Ana',
    email: 'ana@ejemplo.test',
    twoFactorEnabled: enrolled,
  },
});

describe('signing-in stages', () => {
  it('is signed in only with a second-factor session of an enrolled account', () => {
    expect(stageOf(found(2, true), false)).toBe('signed-in');
    expect(stageOf(found(1, true), false)).toBe('signed-out');
    expect(stageOf(found(1, false), false)).toBe('enrol');
    expect(stageOf(found(1, null), false)).toBe('enrol');
    expect(stageOf(null, true)).toBe('challenge');
    expect(stageOf(null, false)).toBe('signed-out');
  });

  it('acts for the user through the staff app, at aal2, only once signed in', () => {
    expect(actorOf(found(2, true))).toEqual({
      userId: '0190f8c4-0000-7000-8000-000000000101',
      aal: 2,
      channel: 'web',
    });
    expect(actorOf(found(1, true))).toBeUndefined();
    expect(actorOf(found(2, false))).toBeUndefined();
    expect(actorOf(null)).toBeUndefined();
  });
});
