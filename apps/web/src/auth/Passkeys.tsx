'use client';

import { Field } from '@ark-ui/react/field';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { confirmPath, here } from '@/auth/confirm';
import { fill } from '@/fill';
import { useAnnounce } from '@/ui/announce';
import { ConfirmAction } from '@/ui/ConfirmAction';
import * as ui from '@/ui/styles';
import { send } from '@/write';

import type { Passkey } from './passkey-data';

import { type AuthError, describedBy, formText } from './client';
import { FormAlert } from './FormAlert';
import { addPasskey } from './passkey-ceremonies';

export interface PasskeysText {
  listLabel: string;
  none: string;
  unnamed: string;
  /** With `{date}`. */
  addedOn: string;
  /** With `{provider}`. */
  keptIn: string;
  synced: string;
  name: string;
  nameHint: string;
  add: string;
  added: string;
  remove: string;
  /** With `{name}`. */
  removeLabel: string;
  confirmRemove: string;
  removed: string;
  confirm: string;
  cancel: string;
  restart: string;
  errors: Record<AuthError, string>;
  /** The refusals' words for a removal, by code (write.ts). */
  writeErrors: Readonly<Record<string, string>>;
}

const ERROR_ID = 'passkey-add-error';
const HINT_ID = 'passkey-name-hint';

/**
 * Ajustes' "Llaves de acceso" (PLAN D22): the signed-in account's passkeys, each with what tells it apart and a way to
 * remove it (asked first), and adding one on this device, or on a phone the browser offers. `dates` are the passkeys'
 * days, already in words, by id.
 */
export const Passkeys = ({
  passkeys,
  dates,
  text,
}: {
  passkeys: Passkey[];
  dates: Readonly<Record<string, string>>;
  text: PasskeysText;
}) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [error, setError] = useState<AuthError>();
  const [pending, setPending] = useState(false);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    const form = event.currentTarget;
    setPending(true);
    setError(undefined);
    const failed = await addPasskey(formText(form, 'name'));
    setPending(false);
    if (failed === 'stepUp') {
      router.push(confirmPath(here()));
      return;
    }
    if (failed) {
      setError(failed);
      return;
    }
    form.reset();
    announce(text.added);
    router.refresh();
  };

  return (
    <>
      {passkeys.length === 0 ? (
        <p>{text.none}</p>
      ) : (
        <ul className={ui.cardList} aria-label={text.listLabel}>
          {passkeys.map((passkey) => {
            const name = passkey.name ?? passkey.provider ?? text.unnamed;
            const date = dates[passkey.id];
            return (
              <li key={passkey.id} className={ui.card}>
                <p className={ui.label}>{name}</p>
                <p className={ui.hint}>
                  {[
                    date === undefined ? undefined : fill(text.addedOn, { date }),
                    passkey.provider === null || passkey.name === null
                      ? undefined
                      : fill(text.keptIn, { provider: passkey.provider }),
                    passkey.synced ? text.synced : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <ConfirmAction
                  label={fill(text.removeLabel, { name })}
                  short={text.remove}
                  text={{
                    question: text.confirmRemove,
                    confirm: text.confirm,
                    cancel: text.cancel,
                    done: text.removed,
                    errors: text.writeErrors,
                  }}
                  run={() => send('POST', '/api/auth/passkey/delete-passkey', { id: passkey.id })}
                />
              </li>
            );
          })}
        </ul>
      )}
      <form method="post" className={ui.form} onSubmit={(event) => void add(event)}>
        <Field.Root className={ui.field}>
          <Field.Label className={ui.label}>{text.name}</Field.Label>
          <Field.Input
            className={ui.input}
            name="name"
            maxLength={60}
            autoComplete="off"
            aria-describedby={describedBy(HINT_ID, error && ERROR_ID)}
          />
          <Field.HelperText id={HINT_ID} className={ui.hint}>
            {text.nameHint}
          </Field.HelperText>
        </Field.Root>
        <FormAlert id={ERROR_ID} error={error} messages={text.errors} restart={text.restart} />
        <div>
          <button type="submit" className={ui.button} aria-disabled={pending}>
            {text.add}
          </button>
        </div>
      </form>
    </>
  );
};
