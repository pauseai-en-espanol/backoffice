'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { fill } from '@/fill';
import { useAnnounce } from '@/ui/announce';
import { ConfirmAction } from '@/ui/ConfirmAction';
import { Disclosure } from '@/ui/Disclosure';
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

/**
 * A person's phones and emails (onboarding spec, concepts: identities): listed with how they came, each removable
 * after a question; a new one added with a hint of how it will be stored, and, if someone else already has it, a link
 * to them (the API's `409 taken { personId }`). With none yet the form is open; with some, it is folded behind "Añadir
 * otro teléfono o correo", so a phone shows what they have first.
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
  const [kind, setKind] = useState<'email' | 'phone' | 'discord'>('phone');
  const [value, setValue] = useState('');
  const [holder, setHolder] = useState<string>();
  const stored = normalised(kind, value);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHolder(undefined);
    const answer = await write.run(() => addIdentity(personId, { kind, value: value.trim() }), {
      done: t.added,
    });
    if (answer?.ok) {
      setValue('');
    } else if (answer?.status === 409 && typeof answer.body.personId === 'string') {
      setHolder(answer.body.personId);
    }
  };

  const form = (
    <form className={ui.form} onSubmit={submit}>
      {identities.length === 0 ? <h3 className={ui.h3}>{t.add}</h3> : null}
      <div className={styles.pair}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="contacto-valor">
            {t.value}
          </label>
          <input
            id="contacto-valor"
            className={ui.input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type={kind === 'email' ? 'email' : kind === 'phone' ? 'tel' : 'text'}
            autoComplete="off"
            maxLength={254}
            required
            aria-invalid={value.trim() !== '' && stored === undefined}
            aria-describedby="contacto-hint contacto-error"
          />
          <span id="contacto-hint" className={ui.hint}>
            {value.trim() === ''
              ? t.valueHint
              : stored === undefined
                ? t.notValid
                : fill(t.willBe, { value: stored })}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="contacto-tipo">
            {t.kind}
          </label>
          <select
            id="contacto-tipo"
            className={styles.select}
            value={kind}
            onChange={(event) =>
              setKind(
                event.target.value === 'email'
                  ? 'email'
                  : event.target.value === 'discord'
                    ? 'discord'
                    : 'phone',
              )
            }
          >
            <option value="phone">{text.identityKinds.phone}</option>
            <option value="email">{text.identityKinds.email}</option>
            <option value="discord">{text.identityKinds.discord}</option>
          </select>
        </div>
      </div>
      <div id="contacto-error" role="alert">
        {write.error ? (
          <div className={ui.alert}>
            <p>
              <span aria-hidden="true">⚠ </span>
              {holder === undefined ? write.error : t.taken}
            </p>
            {holder === undefined ? null : (
              <Link className={ui.link} href={`/personas/${encodeURIComponent(holder)}`}>
                {t.takenLink}
              </Link>
            )}
          </div>
        ) : null}
      </div>
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.add}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {identities.length === 0 ? null : (
        <ul className={styles.personList}>
          {identities.map((identity) => (
            <li key={identity.id} className={styles.boardCard}>
              <span className={ui.hint}>
                {text.identityKinds[identity.kind]}
                {identity.verified ? ` · ✓ ${t.verified}` : ''}
              </span>
              <span className={ui.breakAnywhere}>{identity.value}</span>
              <div className={ui.rowActions}>
                {identity.kind === 'email' ? <CopyEmail email={identity.value} text={t} /> : null}
                {identity.kind === 'airtable' ? null : (
                  <ConfirmAction
                    label={fill(t.remove, { value: identity.value })}
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
          ))}
        </ul>
      )}
      {identities.length === 0 ? (
        form
      ) : (
        <Disclosure id="anadir-contacto" label={t.addAnother}>
          {form}
        </Disclosure>
      )}
    </>
  );
};
