import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));

const { PAGE_OF, sessionFrom } = await import('./session');

const user = { id: 'u', name: 'Persona Ejemplo', email: 'persona@ejemplo.test' };
const staff = { displayName: 'Persona Ejemplo', roles: ['onboarding'] };

describe('sessionFrom', () => {
  it("takes the API's stage, signed in or not", () => {
    expect(sessionFrom(200, { stage: 'signed-in', user, staff })).toEqual({
      stage: 'signed-in',
      user,
      staff,
      recentSecondFactor: false,
    });
    // Whether the riskiest actions would run now (PLAN D23): only when the API says so in as many words.
    expect(
      sessionFrom(200, { stage: 'signed-in', user, staff, recentSecondFactor: true }),
    ).toMatchObject({ recentSecondFactor: true });
    expect(
      sessionFrom(200, { stage: 'signed-in', user, staff, recentSecondFactor: 'yes' }),
    ).toMatchObject({ recentSecondFactor: false });
    expect(sessionFrom(200, { stage: 'enrol', user, staff: null })).toEqual({
      stage: 'enrol',
      user,
    });
    expect(sessionFrom(401, { stage: 'challenge' })).toEqual({ stage: 'challenge' });
    expect(sessionFrom(401, { stage: 'signed-out' })).toEqual({ stage: 'signed-out' });
  });

  it('keeps a signed-in account that is not active staff out of the app', () => {
    expect(sessionFrom(200, { stage: 'signed-in', user, staff: null })).toEqual({
      stage: 'no-access',
      user,
    });
  });

  it('is unavailable while the API has no sign-in configured, or no /api for this host', () => {
    expect(sessionFrom(503, { error: 'Sign-in is not configured' })).toEqual({
      stage: 'unavailable',
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(sessionFrom(404, { error: 'Not found' })).toEqual({ stage: 'unavailable' });
  });

  it('treats anything else as a fault, never as signed in', () => {
    expect(() => sessionFrom(403, { error: 'forbidden' })).toThrow(/403/);
    expect(() => sessionFrom(200, { stage: 'admin', user })).toThrow(/200/);
    expect(() => sessionFrom(200, { stage: 'signed-in' })).toThrow(/200/);
    expect(() =>
      sessionFrom(200, { stage: 'signed-in', user, staff: { displayName: 'x', roles: ['root'] } }),
    ).toThrow(/200/);
    expect(() => sessionFrom(401, { stage: 'unavailable' })).toThrow(/401/);
    expect(() => sessionFrom(500, undefined)).toThrow(/500/);
  });
});

describe('PAGE_OF', () => {
  it('sends each stage to its own page, and only signed-in staff to the app', () => {
    expect(PAGE_OF).toEqual({
      'signed-in': '/',
      'no-access': '/sin-acceso',
      enrol: '/verificacion/alta',
      challenge: '/verificacion',
      'signed-out': '/entrar',
      unavailable: '/entrar',
    });
  });
});
