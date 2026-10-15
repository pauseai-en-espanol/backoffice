'use client';

import { Field } from '@ark-ui/react/field';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import type { StaffRole } from '@/staff-roles';

import { describedBy, formText } from '@/auth/client';
import { fill } from '@/fill';
import { useAnnounce } from '@/ui/announce';
import * as styles from '@/ui/styles';
import { messageFor, send, type WriteAnswer } from '@/write';

import { RoleCheckboxes } from './RoleCheckboxes';
import { checkedRoles } from './roles';

export interface InviteText {
  email: string;
  roles: string;
  rolesHint: string;
  submit: string;
  /** A template with `{email}`. */
  sent: string;
  roleNames: Record<StaffRole, string>;
  roleHelp: Record<StaffRole, string>;
  errors: Readonly<Record<string, string>>;
}

const ERROR_ID = 'invite-error';

/**
 * Inviting someone (admins): an email address and at least one role. The API sends the email and keeps the invitation
 * only if it went out; a pending one for the same address is replaced. The form clears once it is sent.
 */
export const InviteForm = ({ text }: { text: InviteText }) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [refusal, setRefusal] = useState<Pick<WriteAnswer, 'status' | 'error' | 'field'>>();
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = event.currentTarget;
    const email = formText(form, 'email').trim().toLowerCase();
    const roles = checkedRoles(form);
    if (roles.length === 0) {
      setRefusal({ status: 400, error: 'invalid', field: 'roles' });
      return;
    }
    setPending(true);
    setRefusal(undefined);
    const answer = await send('POST', '/api/invitations', { email, roles });
    setPending(false);
    if (!answer.ok) {
      setRefusal(answer);
      return;
    }
    form.reset();
    announce(fill(text.sent, { email }));
    router.refresh();
  };

  const field = refusal?.error === 'invalid' ? refusal.field : undefined;
  return (
    <form className={styles.form} onSubmit={submit} noValidate={false}>
      <Field.Root className={styles.field} required invalid={field === 'email'}>
        <Field.Label className={styles.label}>{text.email}</Field.Label>
        <Field.Input
          className={styles.input}
          name="email"
          type="email"
          autoComplete="off"
          maxLength={254}
          aria-describedby={describedBy(refusal && ERROR_ID)}
        />
      </Field.Root>
      <RoleCheckboxes
        legend={text.roles}
        hint={text.rolesHint}
        names={text.roleNames}
        help={text.roleHelp}
        checked={[]}
        idPrefix="invite"
        invalid={field === 'roles'}
        describedBy={refusal ? ERROR_ID : undefined}
      />
      <div id={ERROR_ID} role="alert">
        {refusal ? (
          <p className={styles.alert}>
            <span aria-hidden="true">⚠ </span>
            {messageFor(refusal, text.errors)}
          </p>
        ) : null}
      </div>
      <div>
        <button className={styles.button} type="submit" aria-disabled={pending}>
          {text.submit}
        </button>
      </div>
    </form>
  );
};
