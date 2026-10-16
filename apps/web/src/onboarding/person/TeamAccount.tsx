'use client';

import type { FormEvent } from 'react';

import { fill } from '@/fill';
import { linkPerson } from '@/team/actions';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import * as styles from '../styles';

export interface TeamAccountText {
  /** "Cuenta del equipo: {name}" */
  linkedTo: string;
  /** "(desactivada)" */
  inactive: string;
  hint: string;
  account: string;
  /** "(mismo correo)" */
  sameEmail: string;
  link: string;
  linked: string;
  unlink: string;
  unlinked: string;
  noAccounts: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A person's team account (PLAN M5, step 5), for admins: the account linked to them, which they may unlink, or a
 * list of the accounts not linked to anyone, the one sharing an email with this person first, to link. The link
 * grants nothing; the API and the database decide again who may make it.
 */
export const TeamAccount = ({
  personId,
  linked,
  accounts,
  text,
}: {
  personId: string;
  linked: { userId: string; displayName: string; active: boolean } | null;
  accounts: readonly { userId: string; displayName: string; suggested: boolean }[];
  text: TeamAccountText;
}) => {
  const write = useWrite(text.errors);

  if (linked) {
    return (
      <div className={ui.form}>
        <p>
          {fill(text.linkedTo, { name: linked.displayName })}
          {linked.active ? null : ` ${text.inactive}`}
        </p>
        <FormError id="cuenta-equipo-error" message={write.error} />
        <div className={ui.rowActions}>
          <button
            type="button"
            className={ui.secondaryButton}
            aria-disabled={write.pending}
            aria-describedby={write.error ? 'cuenta-equipo-error' : undefined}
            onClick={() =>
              void write.run(() => linkPerson(linked.userId, null), { done: text.unlinked })
            }
          >
            {text.unlink}
          </button>
        </div>
      </div>
    );
  }
  if (accounts.length === 0) {
    return <p className={ui.hint}>{text.noAccounts}</p>;
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosen = new FormData(event.currentTarget).get('cuenta');
    if (typeof chosen === 'string' && chosen !== '') {
      await write.run(() => linkPerson(chosen, personId), { done: text.linked });
    }
  };

  // The account that shares this person's email first, and chosen already.
  const ordered = [...accounts].sort((a, b) => Number(b.suggested) - Number(a.suggested));
  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="cuenta-equipo">
          {text.account}
        </label>
        <select
          id="cuenta-equipo"
          name="cuenta"
          className={styles.select}
          defaultValue={ordered[0]?.userId}
          aria-describedby={['cuenta-equipo-hint', write.error ? 'cuenta-equipo-error' : '']
            .filter(Boolean)
            .join(' ')}
        >
          {ordered.map((account) => (
            <option key={account.userId} value={account.userId}>
              {account.suggested ? `${account.displayName} ${text.sameEmail}` : account.displayName}
            </option>
          ))}
        </select>
        <span id="cuenta-equipo-hint" className={ui.hint}>
          {text.hint}
        </span>
      </div>
      <FormError id="cuenta-equipo-error" message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.link}
        </button>
      </div>
    </form>
  );
};
