'use client';

import { send } from '@/write';

/** The team page's writes, each one call to the API (its contract in the API's admin routes). */

const staff = (userId: string) => `/api/staff/${encodeURIComponent(userId)}`;
const invitation = (id: string) => `/api/invitations/${encodeURIComponent(id)}`;

export const setActive = (userId: string, active: boolean) =>
  send('PATCH', staff(userId), { active });

export const sendPasswordLink = (userId: string) => send('POST', `${staff(userId)}/password-link`);

export const revokeInvitation = (id: string) => send('POST', `${invitation(id)}/revoke`);

export const deleteInvitation = (id: string) => send('DELETE', invitation(id));
