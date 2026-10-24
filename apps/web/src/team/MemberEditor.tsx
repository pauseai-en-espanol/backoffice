'use client';

import { Field } from '@ark-ui/react/field';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { StaffRole } from '@/staff-roles';

import { describedBy, formText } from '@/auth/client';
import { useAnnounce } from '@/ui/announce';
import * as styles from '@/ui/styles';
import { messageFor, send, type WriteAnswer } from '@/write';

import { RoleCheckboxes } from './RoleCheckboxes';
import { checkedRoles } from './roles';

export interface MemberEditorText {
  edit: string;
  /** The editor's heading, with the member's name filled in. */
  title: string;
  rename: string;
  roles: string;
  save: string;
  cancel: string;
  saved: string;
  roleNames: Record<StaffRole, string>;
  roleHelp: Record<StaffRole, string>;
  errors: Readonly<Record<string, string>>;
}

const sameRoles = (a: readonly StaffRole[], b: readonly StaffRole[]): boolean =>
  a.length === b.length && a.every((role) => b.includes(role));

/**
 * Renaming a member and changing their roles (admins), in place. Only what changed is sent. Removing the last active
 * admin's role is refused by the database, and said here in words.
 */
export const MemberEditor = ({
  userId,
  displayName,
  roles,
  text,
}: {
  userId: string;
  displayName: string;
  roles: StaffRole[];
  text: MemberEditorText;
}) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<Pick<WriteAnswer, 'status' | 'error' | 'field'>>();
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const errorId = `edit-${userId}-error`;

  useEffect(() => {
    if (open) {
      heading.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = event.currentTarget;
    const name = formText(form, 'displayName').trim();
    const chosen = checkedRoles(form);
    const change: { displayName?: string; roles?: StaffRole[] } = {};
    if (name !== displayName) {
      change.displayName = name;
    }
    if (!sameRoles(chosen, roles)) {
      change.roles = chosen;
    }
    if (change.displayName === undefined && change.roles === undefined) {
      setOpen(false);
      return;
    }
    setPending(true);
    setRefusal(undefined);
    const answer = await send('PATCH', `/api/staff/${encodeURIComponent(userId)}`, change);
    setPending(false);
    if (!answer.ok) {
      setRefusal(answer);
      return;
    }
    setOpen(false);
    announce(text.saved);
    router.refresh();
  };

  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        className={styles.secondaryButton}
        onClick={() => {
          opened.current = true;
          setRefusal(undefined);
          setOpen(true);
        }}
      >
        {text.edit}
      </button>
    );
  }

  const field = refusal?.error === 'invalid' ? refusal.field : undefined;
  return (
    <form method="post" className={styles.form} onSubmit={submit}>
      <h3 ref={heading} tabIndex={-1} className={styles.h3}>
        {text.title}
      </h3>
      <Field.Root className={styles.field} required invalid={field === 'displayName'}>
        <Field.Label className={styles.label}>{text.rename}</Field.Label>
        <Field.Input
          className={styles.input}
          name="displayName"
          defaultValue={displayName}
          maxLength={200}
          autoComplete="off"
          aria-describedby={describedBy(refusal && errorId)}
        />
      </Field.Root>
      <RoleCheckboxes
        legend={text.roles}
        names={text.roleNames}
        help={text.roleHelp}
        checked={roles}
        idPrefix={`edit-${userId}`}
        invalid={field === 'roles'}
        describedBy={refusal ? errorId : undefined}
      />
      <div id={errorId} role="alert">
        {refusal ? (
          <p className={styles.alert}>
            <span aria-hidden="true">⚠ </span>
            {messageFor(refusal, text.errors)}
          </p>
        ) : null}
      </div>
      <div className={styles.rowActions}>
        <button className={styles.button} type="submit" aria-disabled={pending}>
          {text.save}
        </button>
        <button type="button" className={styles.textButton} onClick={() => setOpen(false)}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};
