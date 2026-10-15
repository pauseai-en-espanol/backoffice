import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { getFromApi } from './api';
import { STAFF_ROLES, type StaffRole } from './staff-roles';

export { STAFF_ROLES, type StaffRole } from './staff-roles';

/**
 * Where a request stands, as the API decides it (apps/api/src/auth/session.ts):
 *
 * - `signed-in`: past the second factor, and an active staff member: the only stage that reaches the app's pages.
 * - `no-access`: past the second factor, but not (or no longer) an active staff member.
 * - `enrol`: an account without its second factor yet, which reaches only the enrolment.
 * - `challenge`: a password was accepted and a code is awaited.
 * - `signed-out`: anything else.
 * - `unavailable`: the API can't say (sign-in isn't configured, or it doesn't know this host).
 */
export type Stage =
  'signed-in' | 'no-access' | 'enrol' | 'challenge' | 'signed-out' | 'unavailable';

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
}

export interface StaffMember {
  displayName: string;
  roles: StaffRole[];
}

export interface Session {
  stage: Stage;
  user?: SignedInUser;
  staff?: StaffMember;
}

/** The page each stage belongs on. */
export const PAGE_OF: Readonly<Record<Stage, string>> = {
  'signed-in': '/',
  'no-access': '/sin-acceso',
  enrol: '/verificacion/alta',
  challenge: '/verificacion',
  'signed-out': '/entrar',
  unavailable: '/entrar',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isUser = (value: unknown): value is SignedInUser =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.email === 'string';

const isStaff = (value: unknown): value is StaffMember =>
  isRecord(value) &&
  typeof value.displayName === 'string' &&
  Array.isArray(value.roles) &&
  value.roles.every((role) => (STAFF_ROLES as readonly unknown[]).includes(role));

/** The session the API's answer describes; any answer but these is a fault, never a way in. */
export const sessionFrom = (status: number, body: unknown): Session => {
  if (status === 200 && isRecord(body) && isUser(body.user)) {
    if (body.stage === 'enrol') {
      return { stage: 'enrol', user: body.user };
    }
    if (body.stage === 'signed-in') {
      if (body.staff === null) {
        return { stage: 'no-access', user: body.user };
      }
      if (isStaff(body.staff)) {
        return { stage: 'signed-in', user: body.user, staff: body.staff };
      }
    }
  }
  if (
    status === 401 &&
    isRecord(body) &&
    (body.stage === 'challenge' || body.stage === 'signed-out')
  ) {
    return { stage: body.stage };
  }
  // 503: the API has no sign-in configured yet. 404: it doesn't know /api, as during a rollout that brings it, or it
  // doesn't take this host, which the log says. Either way nobody is signed in.
  if (status === 503 || status === 404) {
    if (status === 404) {
      console.error(
        'The API answered 404 for the session: is STAFF_ORIGIN the host this app is served on?',
      );
    }
    return { stage: 'unavailable' };
  }
  throw new Error(`The API answered ${status} for the session`);
};

/** The request's own host and cookie, which the API needs to find the session. */
export const forwardedRequest = async () => {
  const incoming = await headers();
  const host = incoming.get('host');
  if (!host) {
    throw new Error('The request has no Host header');
  }
  return { host, cookie: incoming.get('cookie') ?? undefined };
};

/** Asked of the API once per request, however many layouts and pages need it. */
export const getSession = cache(async (): Promise<Session> => {
  const { status, body } = await getFromApi('/api/session', await forwardedRequest());
  return sessionFrom(status, body);
});

/**
 * Lets a page render only at the stages it serves, and sends any other request to its stage's page. The API and the
 * database check again on every call; this only keeps people on the right page.
 */
export const requireStage = async (...stages: Stage[]): Promise<Session> => {
  const session = await getSession();
  if (!stages.includes(session.stage)) {
    redirect(PAGE_OF[session.stage]);
  }
  return session;
};

/** A signed-in staff member, with what the pages show of them. */
export interface Staff {
  user: SignedInUser;
  staff: StaffMember;
}

/** A page for signed-in staff; with `role`, for those holding it (anyone else finds no such page). */
export const requireStaff = async (role?: StaffRole): Promise<Staff> => {
  const { user, staff } = await requireStage('signed-in');
  if (!user || !staff) {
    redirect(PAGE_OF['signed-out']);
  }
  if (role !== undefined && !staff.roles.includes(role)) {
    notFound();
  }
  return { user, staff };
};
