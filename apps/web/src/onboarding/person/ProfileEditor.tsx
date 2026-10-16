'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { ArrivalChannel } from '../types';
import type { PersonPageText } from './text';

import { updatePerson } from '../actions';
import { fieldsOf, type Profile, profileChange } from '../forms';
import * as styles from '../styles';
import { AVAILABILITY } from '../text';

/**
 * Editing a person's profile in place: the button opens the form, which takes focus at its heading; saving sends only
 * what changed. The full name is required; the rest may be emptied: "Llegó el" emptied is "No se sabe" (PLAN M5).
 * "Llegó por" offers the list's active entries, and the person's own even if it was retired since.
 */
export const ProfileEditor = ({
  person,
  channels,
  text,
}: {
  person: Profile;
  channels: readonly ArrivalChannel[];
  text: PersonPageText;
}) => {
  const write = useWrite(text.errors);
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const t = text.profile;

  useEffect(() => {
    if (open) {
      heading.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const change = profileChange(person, fieldsOf(event.currentTarget));
    if (Object.keys(change).length === 0) {
      setOpen(false);
      return;
    }
    const answer = await write.run(() => updatePerson(person.id, change), { done: text.saved });
    if (answer?.ok) {
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <div>
        <button
          ref={opener}
          type="button"
          className={ui.secondaryButton}
          onClick={() => {
            opened.current = true;
            write.clear();
            setOpen(true);
          }}
        >
          {t.edit}
        </button>
      </div>
    );
  }

  const invalid = write.refusal?.error === 'invalid' ? write.refusal.field : undefined;
  const field = (name: keyof Profile, label: string, hint?: string, maxLength = 100) => (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={`perfil-${name}`}>
        {label}
      </label>
      <input
        id={`perfil-${name}`}
        className={ui.input}
        name={name}
        defaultValue={
          name === 'languages'
            ? person.languages.join(', ')
            : ((person[name] as string | null) ?? '')
        }
        maxLength={maxLength}
        required={name === 'fullName' && person.fullName !== null}
        aria-invalid={invalid === name}
        aria-describedby={
          [hint ? `perfil-${name}-hint` : '', write.error ? 'perfil-error' : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {hint ? (
        <span id={`perfil-${name}-hint`} className={ui.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );

  return (
    <form className={ui.form} onSubmit={submit}>
      <h3 ref={heading} tabIndex={-1} className={ui.h3}>
        {t.edit}
      </h3>
      {field('fullName', t.fullName, undefined, 200)}
      {field('preferredName', t.preferredName)}
      {field('summary', t.summary, t.summaryHint, 200)}
      {field('province', t.province)}
      {field('town', t.town)}
      {field('languages', t.languages, t.languagesHint, 500)}
      {field('pronouns', t.pronouns, t.pronounsHint, 50)}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="perfil-availability">
          {t.availability}
        </label>
        <select
          id="perfil-availability"
          name="availability"
          className={styles.select}
          defaultValue={person.availability ?? ''}
        >
          <option value="">{t.availabilityNone}</option>
          {AVAILABILITY.map((value) => (
            <option key={value} value={value}>
              {text.availability[value]}
            </option>
          ))}
        </select>
      </div>
      {field('howHeard', t.howHeard, undefined, 500)}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="perfil-arrivedOn">
          {t.arrivedOn}
        </label>
        <input
          id="perfil-arrivedOn"
          className={ui.input}
          type="date"
          name="arrivedOn"
          max={text.happened.today}
          defaultValue={person.arrivedOn ?? ''}
          aria-describedby="perfil-arrivedOn-hint"
        />
        <span id="perfil-arrivedOn-hint" className={ui.hint}>
          {t.arrivedOnHint}
        </span>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="perfil-arrivalId">
          {t.arrival}
        </label>
        <select
          id="perfil-arrivalId"
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
      <FormError id="perfil-error" message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.save}
        </button>
        <button type="button" className={ui.textButton} onClick={() => setOpen(false)}>
          {text.cancel}
        </button>
      </div>
    </form>
  );
};
