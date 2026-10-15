'use client';

import type { StaffRole } from '@/staff-roles';

import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';
import * as styles from '@/ui/styles';

import { sendPasswordLink, setActive } from './actions';
import { MemberEditor, type MemberEditorText } from './MemberEditor';

export interface MemberActionsText {
  editor: MemberEditorText;
  /** Each with its label and question, the member's name filled in by the page. */
  activation: ConfirmText & { label: string };
  passwordLink: ConfirmText & { label: string };
}

/**
 * An admin's actions on one member: edit (name and roles), deactivate or reactivate, and send a link to choose a new
 * password. Only active members get the link: a deactivated one couldn't use it.
 */
export const MemberActions = ({
  member,
  text,
}: {
  member: { userId: string; displayName: string; roles: StaffRole[]; active: boolean };
  text: MemberActionsText;
}) => (
  <div className={styles.rowActions}>
    <MemberEditor
      userId={member.userId}
      displayName={member.displayName}
      roles={member.roles}
      text={text.editor}
    />
    <ConfirmAction
      label={text.activation.label}
      text={text.activation}
      run={() => setActive(member.userId, !member.active)}
    />
    {member.active ? (
      <ConfirmAction
        label={text.passwordLink.label}
        text={text.passwordLink}
        run={() => sendPasswordLink(member.userId)}
      />
    ) : null}
  </div>
);
