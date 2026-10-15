'use client';

import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';

import { deleteInvitation, revokeInvitation } from './actions';

/**
 * An admin's action on one invitation: revoke a pending one, or delete one that is no longer pending, so its address
 * isn't kept. The page fills in the question's address.
 */
export const InvitationActions = ({
  id,
  pending,
  text,
}: {
  id: string;
  pending: boolean;
  text: ConfirmText & { label: string };
}) => (
  <ConfirmAction
    label={text.label}
    text={text}
    run={() => (pending ? revokeInvitation(id) : deleteInvitation(id))}
  />
);
