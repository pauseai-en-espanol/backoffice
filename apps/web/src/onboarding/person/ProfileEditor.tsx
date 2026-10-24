'use client';

import type { FormEvent, ReactNode } from 'react';

import { useEditDone } from '@/ui/edit-done';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { updatePerson } from '../actions';
import { fieldsIn, type Profile, profileChange } from '../forms';
import { PlaceFields } from '../place/PlaceFields';
import * as styles from '../styles';
import { AVAILABILITY } from '../text';

/**
 * A person's profile, edited in place of what it shows (EditInPlace), its fields in four groups: who they are, where
 * they live (a country, then a province or region), where they're from (PLAN R74), and how they would help. Their
 * sign-up is edited apart (ArrivalForm). Saving sends only what changed. The full name is required; the rest may be
 * emptied.
 */
export const ProfileEditor = ({ person, text }: { person: Profile; text: PersonPageText }) => {
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
  const group = (legend: string, fields: ReactNode) => (
    <fieldset className={styles.fieldGroup}>
      <legend>{legend}</legend>
      {fields}
    </fieldset>
  );

  return (
    <form method="post" className={ui.form} onSubmit={submit}>
      {group(
        t.who,
        <>
          {field('fullName', t.fullName, undefined, 200)}
          {field('preferredName', t.preferredName)}
          {field('pronouns', t.pronouns, t.pronounsHint, 50)}
          {field('summary', t.summary, t.summaryHint, 200)}
        </>,
      )}
      {group(
        t.where,
        <PlaceFields
          prefix="perfil"
          names={{ country: 'country', province: 'province', town: 'town' }}
          initial={{ country: person.country, province: person.province, town: person.town }}
          text={text.place}
        />,
      )}
      {group(
        t.from,
        <PlaceFields
          prefix="perfil-origen"
          names={{ country: 'originCountry', province: 'originProvince' }}
          initial={{ country: person.originCountry, province: person.originProvince }}
          text={text.place}
        />,
      )}
      {group(
        t.help,
        <>
          {field('languages', t.languages, t.languagesHint, 500)}
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
        </>,
      )}
      <FormError id="perfil-error" message={write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.save}
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
