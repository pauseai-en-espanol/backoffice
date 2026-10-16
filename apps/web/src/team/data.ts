import { isNullableString, isRecord, isString, readFromApi } from '@/data';
import { STAFF_ROLES, type StaffRole } from '@/staff-roles';

export interface TeamMember {
  userId: string;
  displayName: string;
  active: boolean;
  roles: StaffRole[];
  invitedBy: string | null;
  createdAt: string;
  deactivatedAt: string | null;
  /** Their own person record (PLAN M5, step 5); null when not linked, or from an older API. */
  personId: string | null;
}

export interface Team {
  me: string;
  staff: TeamMember[];
}

export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  email: string;
  roles: StaffRole[];
  state: InvitationState;
  createdAt: string;
  expiresAt: string;
  createdBy: { userId: string; displayName: string };
}

const isRoles = (value: unknown): value is StaffRole[] =>
  Array.isArray(value) && value.every((role) => (STAFF_ROLES as readonly unknown[]).includes(role));

const isMember = (value: unknown): value is Omit<TeamMember, 'personId'> & { personId?: unknown } =>
  isRecord(value) &&
  isString(value.userId) &&
  isString(value.displayName) &&
  typeof value.active === 'boolean' &&
  isRoles(value.roles) &&
  isNullableString(value.invitedBy) &&
  isString(value.createdAt) &&
  isNullableString(value.deactivatedAt) &&
  (value.personId === undefined || isNullableString(value.personId));

/** A suggestion for an account's person: the one who shares its sign-in email (PLAN M5, step 5). */
export interface PersonSuggestion {
  userId: string;
  person: { id: string; name: string | null };
}

const isSuggestion = (value: unknown): value is PersonSuggestion =>
  isRecord(value) &&
  isString(value.userId) &&
  isRecord(value.person) &&
  isString(value.person.id) &&
  isNullableString(value.person.name);

const STATES: readonly unknown[] = ['pending', 'accepted', 'revoked', 'expired'];

const isInvitation = (value: unknown): value is Invitation =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.email) &&
  isRoles(value.roles) &&
  STATES.includes(value.state) &&
  isString(value.createdAt) &&
  isString(value.expiresAt) &&
  isRecord(value.createdBy) &&
  isString(value.createdBy.userId) &&
  isString(value.createdBy.displayName);

/** `GET /api/staff`'s body, or undefined if it isn't one. */
export const parseTeam = (body: unknown): Team | undefined =>
  isRecord(body) && isString(body.me) && Array.isArray(body.staff) && body.staff.every(isMember)
    ? {
        me: body.me,
        staff: body.staff.map((member) => ({
          ...member,
          personId: isString(member.personId) ? member.personId : null,
        })),
      }
    : undefined;

/** `GET /api/staff/person-suggestions`'s body, or undefined if it isn't one. */
export const parseSuggestions = (body: unknown): PersonSuggestion[] | undefined =>
  isRecord(body) && Array.isArray(body.suggestions) && body.suggestions.every(isSuggestion)
    ? body.suggestions
    : undefined;

/** `GET /api/invitations`'s body, or undefined if it isn't one. */
export const parseInvitations = (body: unknown): Invitation[] | undefined =>
  isRecord(body) && Array.isArray(body.invitations) && body.invitations.every(isInvitation)
    ? body.invitations
    : undefined;

/** The team, as every staff member sees it. */
export const getTeam = () => readFromApi('/api/staff', parseTeam);

/** The invitations, which only admins see. */
export const getInvitations = () => readFromApi('/api/invitations', parseInvitations);

/** Each unlinked account's likely person, which only admins see. */
export const getPersonSuggestions = () =>
  readFromApi('/api/staff/person-suggestions', parseSuggestions);
