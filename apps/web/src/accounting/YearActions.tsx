'use client';

import { type FormEvent, useState } from 'react';

import { describedBy, formText } from '@/auth/client';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { closeYear, openYear } from './actions';

/** Opens a year: the next after the last, or the first. */
export const OpenYear = ({
  year,
  text,
}: {
  year: number;
  text: { label: string; hint: string; done: string; errors: Readonly<Record<string, string>> };
}) => {
  const write = useWrite(text.errors);
  return (
    <div>
      <button
        type="button"
        className={ui.button}
        aria-disabled={write.pending}
        aria-describedby="abrir-pista"
        onClick={() => void write.run(() => openYear(year), { done: text.done })}
      >
        {text.label}
      </button>
      <p id="abrir-pista" className={ui.hint}>
        {text.hint}
      </p>
      <FormError message={write.error} />
    </div>
  );
};

/**
 * Closes a year once the assembly has approved its accounts (accounting spec §3), with the assembly's date: the
 * database posts the closing entry and the next year's opening entry. One of the riskiest actions (PLAN D23): with a
 * second factor over 12 hours old, `send` goes to "Confirma que eres tú" first.
 */
export const CloseYear = ({
  year,
  today,
  text,
}: {
  year: number;
  today: string;
  text: {
    title: string;
    assemblyOn: string;
    close: string;
    hint: string;
    done: string;
    errors: Readonly<Record<string, string>>;
  };
}) => {
  const write = useWrite(text.errors);
  const [missing, setMissing] = useState(false);
  const id = `cerrar-${year}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const assemblyOn = formText(event.currentTarget, 'assemblyOn');
    setMissing(assemblyOn === '');
    if (assemblyOn !== '') {
      await write.run(() => closeYear(year, assemblyOn), { done: text.done });
    }
  };

  const error = missing ? text.errors.assemblyOn : write.error;
  return (
    <form
      method="post"
      className={ui.form}
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-titulo`}
    >
      <h3 id={`${id}-titulo`} className={ui.h2}>
        {text.title}
      </h3>
      <div className={ui.field}>
        <label className={ui.label} htmlFor={`${id}-asamblea`}>
          {text.assemblyOn}
        </label>
        <input
          id={`${id}-asamblea`}
          name="assemblyOn"
          type="date"
          className={ui.input}
          min={`${year + 1}-01-01`}
          max={today}
          required
          aria-invalid={missing || write.refusal?.field === 'assemblyOn'}
          aria-describedby={describedBy(`${id}-pista`, error && `${id}-error`)}
        />
        <span id={`${id}-pista`} className={ui.hint}>
          {text.hint}
        </span>
      </div>
      <FormError id={`${id}-error`} message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.close}
        </button>
      </div>
    </form>
  );
};
