'use client';

import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  type ContactChannel,
  type ContactOutcome,
} from '@backoffice/domain/stages';
import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { addAttempt, addNote, updatePerson } from '../actions';
import * as styles from '../styles';

const isChannel = (value: unknown): value is ContactChannel =>
  typeof value === 'string' && (CONTACT_CHANNELS as readonly string[]).includes(value);

const isOutcome = (value: unknown): value is ContactOutcome =>
  typeof value === 'string' && (CONTACT_OUTCOMES as readonly string[]).includes(value);

/** The next action (onboarding spec, concepts): what to do and, optionally, by when; or none. */
export const NextActionForm = ({
  person,
  text,
}: {
  person: { id: string; nextAction: string | null; nextActionDue: string | null };
  text: PersonPageText;
}) => {
  const t = text.nextAction;
  const write = useWrite({ ...text.errors, nextAction: t.missing });
  const [missing, setMissing] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const action = formText(form, 'nextAction').trim();
    const due = formText(form, 'nextActionDue').trim();
    setMissing(action === '');
    if (action === '') {
      return;
    }
    await write.run(
      () => updatePerson(person.id, { nextAction: action, nextActionDue: due === '' ? null : due }),
      { done: t.saved },
    );
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={styles.pair}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="siguiente-texto">
            {t.text}
          </label>
          <input
            id="siguiente-texto"
            className={ui.input}
            name="nextAction"
            defaultValue={person.nextAction ?? ''}
            maxLength={300}
            aria-invalid={missing}
            aria-describedby="siguiente-hint siguiente-error"
          />
          <span id="siguiente-hint" className={ui.hint}>
            {t.hint}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="siguiente-fecha">
            {t.due}
          </label>
          <input
            id="siguiente-fecha"
            className={ui.input}
            type="date"
            name="nextActionDue"
            defaultValue={person.nextActionDue ?? ''}
          />
        </div>
      </div>
      <FormError id="siguiente-error" message={missing ? t.missing : write.error} />
      <div className={ui.rowActions}>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.save}
        </button>
        {person.nextAction === null ? null : (
          <button
            type="button"
            className={ui.textButton}
            aria-disabled={write.pending}
            onClick={() =>
              void write.run(
                () => updatePerson(person.id, { nextAction: null, nextActionDue: null }),
                { done: t.cleared },
              )
            }
          >
            {t.clear}
          </button>
        )}
      </div>
    </form>
  );
};

/** A contact attempt (onboarding spec, views): channel and outcome presets, and an optional note. */
export const AttemptForm = ({ personId, text }: { personId: string; text: PersonPageText }) => {
  const t = text.attempt;
  const write = useWrite(text.errors);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const channel = formText(form, 'channel');
    const outcome = formText(form, 'outcome');
    const note = formText(form, 'note').trim();
    if (!isChannel(channel) || !isOutcome(outcome)) {
      return;
    }
    const answer = await write.run(
      () => addAttempt(personId, { channel, outcome, ...(note === '' ? {} : { note }) }),
      { done: t.saved },
    );
    if (answer?.ok) {
      form.reset();
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={styles.pair}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="intento-canal">
            {t.channel}
          </label>
          <select
            id="intento-canal"
            name="channel"
            className={styles.select}
            defaultValue="whatsapp"
          >
            {CONTACT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {text.channels[channel]}
              </option>
            ))}
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="intento-resultado">
            {t.outcome}
          </label>
          <select
            id="intento-resultado"
            name="outcome"
            className={styles.select}
            defaultValue="no_answer"
          >
            {CONTACT_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {text.outcomes[outcome]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="intento-nota">
          {t.note}
        </label>
        <textarea
          id="intento-nota"
          name="note"
          className={styles.textarea}
          maxLength={4000}
          aria-describedby="intento-aviso"
        />
        <span id="intento-aviso" className={ui.hint}>
          {text.note.warning}
        </span>
      </div>
      <FormError message={write.error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.save}
        </button>
      </div>
    </form>
  );
};

/** A note on the timeline, with the reminder not to write sensitive details down. */
export const NoteForm = ({ personId, text }: { personId: string; text: PersonPageText }) => {
  const t = text.note;
  const write = useWrite({ ...text.errors, body: t.missing });
  const [missing, setMissing] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formText(form, 'body').trim();
    setMissing(body === '');
    if (body === '') {
      return;
    }
    const answer = await write.run(() => addNote(personId, body), { done: t.saved });
    if (answer?.ok) {
      form.reset();
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="nota-texto">
          {t.note}
        </label>
        <textarea
          id="nota-texto"
          name="body"
          className={styles.textarea}
          maxLength={4000}
          aria-invalid={missing}
          aria-describedby="nota-aviso nota-error"
        />
        <span id="nota-aviso" className={ui.hint}>
          {t.warning}
        </span>
      </div>
      <FormError id="nota-error" message={missing ? t.missing : write.error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {t.save}
        </button>
      </div>
    </form>
  );
};
