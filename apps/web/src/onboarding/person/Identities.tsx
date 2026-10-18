'use client';

import { inferIdentityKind, spacedPhone } from '@backoffice/domain/identities';
import { Hash, Mail, Phone, Plus, Table2 } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { fill } from '@/fill';
import { useAnnounce } from '@/ui/announce';
import { ConfirmAction } from '@/ui/ConfirmAction';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { Identity } from '../types';
import type { PersonPageText } from './text';

import { addIdentity, removeIdentity } from '../actions';
import { normalised } from '../forms';
import * as styles from '../styles';

/** Copies an email address, and says so. */
const CopyEmail = ({ email, text }: { email: string; text: PersonPageText['identities'] }) => {
  const announce = useAnnounce();
  return (
    <button
      type="button"
      className={ui.textButton}
      onClick={() => {
        void navigator.clipboard
          .writeText(email)
          .then(() => announce(text.emailCopied))
          .catch(() => undefined);
      }}
    >
      {text.copyEmail}
    </button>
  );
};

/** Each kind's mark, beside its words (said to screen readers, and shown by the value itself). */
const KIND_ICONS = { phone: Phone, email: Mail, discord: Hash, airtable: Table2 } as const;

/**
 * A person's phones, emails and Discord usernames (onboarding spec, concepts: identities): one row each, its kind's
 * mark, the value and "Quitar" at the row's end, asked about first. Below them one field adds another, whatever it is
 * (PLAN R63): what was typed says its kind (domain/identities inferIdentityKind), and the hint shows how it will be
 * stored. If someone else already has it, a link to them (the API's `409 taken { personId }`).
 */
export const Identities = ({
  personId,
  identities,
  text,
}: {
  personId: string;
  identities: readonly Identity[];
  text: PersonPageText;
}) => {
  const t = text.identities;
  const write = useWrite(text.errors);
  const [value, setValue] = useState('');
  const [holder, setHolder] = useState<string>();
  const [unknown, setUnknown] = useState(false);
  const kind = inferIdentityKind(value);
  const stored = kind === undefined ? undefined : normalised(kind, value);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHolder(undefined);
    setUnknown(kind === undefined);
    if (kind === undefined) {
      return;
    }
    const answer = await write.run(() => addIdentity(personId, { kind, value: value.trim() }), {
      done: t.added,
    });
    if (answer?.ok) {
      setValue('');
    } else if (answer?.status === 409 && typeof answer.body.personId === 'string') {
      setHolder(answer.body.personId);
    }
  };

  const error = unknown ? (value.trim() === '' ? t.missing : t.unknown) : write.error;

  return (
    <>
      {identities.length === 0 ? null : (
        <ul className={styles.identityList}>
          {identities.map((identity) => {
            const Icon = KIND_ICONS[identity.kind];
            return (
              <li key={identity.id} className={styles.identityRow}>
                <Icon className={styles.identityIcon} aria-hidden="true" />
                <span className={styles.identityValue}>
                  <span className={ui.srOnly}>{text.identityKinds[identity.kind]}: </span>
                  <span>
                    {identity.kind === 'phone' ? spacedPhone(identity.value) : identity.value}
                  </span>
                  {identity.verified ? (
                    <span className={ui.hint}>
                      {' · '}
                      <span aria-hidden="true">✓ </span>
                      {t.verified}
                    </span>
                  ) : null}
                </span>
                <div className={styles.identityActions}>
                  {identity.kind === 'email' ? <CopyEmail email={identity.value} text={t} /> : null}
                  {identity.kind === 'airtable' ? null : (
                    <ConfirmAction
                      label={fill(t.remove, { value: identity.value })}
                      short={t.removeShort}
                      text={{
                        question: fill(t.confirmRemove, { value: identity.value }),
                        confirm: t.confirm,
                        cancel: text.cancel,
                        done: t.removed,
                        errors: text.errors,
                      }}
                      run={() => removeIdentity(personId, identity.id)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className={styles.identityForm} onSubmit={submit} noValidate>
        <label className={ui.label} htmlFor="contacto-valor">
          {t.add}
        </label>
        <div className={styles.identityAdd}>
          <input
            id="contacto-valor"
            className={ui.input}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setUnknown(false);
            }}
            autoComplete="off"
            inputMode="text"
            maxLength={254}
            required
            aria-invalid={unknown || (value.trim() !== '' && stored === undefined)}
            aria-describedby="contacto-hint contacto-error"
          />
          <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
            <Plus className={styles.buttonIcon} aria-hidden="true" />
            {t.addButton}
          </button>
        </div>
        <span id="contacto-hint" className={ui.hint}>
          {value.trim() === ''
            ? t.valueHint
            : kind === undefined || stored === undefined
              ? t.notValid
              : fill(t.willBe[kind], { value: kind === 'phone' ? spacedPhone(stored) : stored })}
        </span>
        <div id="contacto-error" role="alert">
          {error ? (
            <div className={ui.alert}>
              <p>
                <span aria-hidden="true">⚠ </span>
                {holder === undefined ? error : t.taken}
              </p>
              {holder === undefined ? null : (
                <Link className={ui.link} href={`/personas/${encodeURIComponent(holder)}`}>
                  {t.takenLink}
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </form>
    </>
  );
};
