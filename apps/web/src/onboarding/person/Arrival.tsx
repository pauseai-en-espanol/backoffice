'use client';

import type { FormEvent } from 'react';

import { useEditDone } from '@/ui/edit-done';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { ArrivalChannel } from '../types';
import type { PersonPageText } from './text';

import { updatePerson } from '../actions';
import { fieldsIn, type Profile, profileChange } from '../forms';
import * as styles from '../styles';

/**
 * When and where from someone arrived, edited in place (PLAN R57): one day, whatever the way in, which is also when
 * their time in the community began; emptied, "No se sabe" (PLAN M5). "Llegó por" offers the list's active entries,
 * and the person's own even if it was retired since; and how they heard of PauseAI.
 */
export const ArrivalForm = ({
  person,
  channels,
  text,
}: {
  person: Profile;
  channels: readonly ArrivalChannel[];
  text: PersonPageText;
}) => {
  const write = useWrite(text.errors);
  const done = useEditDone();
  const t = text.profile;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const change = profileChange(person, fieldsIn(event.currentTarget));
    if (Object.keys(change).length === 0) {
      done?.();
      return;
    }
    const answer = await write.run(() => updatePerson(person.id, change), { done: text.saved });
    if (answer?.ok) {
      done?.();
    }
  };

  return (
    <form method="post" className={ui.form} onSubmit={submit}>
      <div className={styles.narrowField}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="llegada-dia">
            {t.arrivedOn}
          </label>
          <input
            id="llegada-dia"
            className={ui.input}
            type="date"
            name="arrivedOn"
            max={text.happened.today}
            defaultValue={person.arrivedOn ?? ''}
            aria-describedby="llegada-dia-hint"
          />
          <span id="llegada-dia-hint" className={ui.hint}>
            {t.arrivedOnHint}
          </span>
        </div>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="llegada-por">
          {t.arrival}
        </label>
        <select
          id="llegada-por"
          name="arrivalId"
          className={styles.select}
          defaultValue={person.arrival?.id ?? ''}
        >
          <option value="">{t.arrivalNone}</option>
          {channels
            .filter((channel) => channel.active || channel.id === person.arrival?.id)
            .map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.label}
              </option>
            ))}
        </select>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="llegada-como">
          {t.howHeard}
        </label>
        <input
          id="llegada-como"
          className={ui.input}
          name="howHeard"
          defaultValue={person.howHeard ?? ''}
          maxLength={500}
        />
      </div>
      <FormError message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.saveArrival}
        </button>
        {done ? (
          <button type="button" className={ui.textButton} onClick={done}>
            {text.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
};
