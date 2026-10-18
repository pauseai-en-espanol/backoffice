'use client';

import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  type ContactChannel,
  type ContactOutcome,
} from '@backoffice/domain/stages';
import { type FormEvent, useState } from 'react';

import { formText } from '@/auth/client';
import { useEditDone } from '@/ui/edit-done';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { PersonPageText } from './text';

import { addAttempt, addNote, updatePerson } from '../actions';
import { happenedOnOf } from '../forms';
import * as styles from '../styles';
import { HappenedOn } from './HappenedOn';

const isChannel = (value: unknown): value is ContactChannel =>
  typeof value === 'string' && (CONTACT_CHANNELS as readonly string[]).includes(value);

const isOutcome = (value: unknown): value is ContactOutcome =>
  typeof value === 'string' && (CONTACT_OUTCOMES as readonly string[]).includes(value);

/**
 * The next action (onboarding spec, concepts): what to do and, optionally, by when; or none. Edited in place, where it
 * is shown (EditInPlace), it closes once saved or taken away.
 */
export const NextActionForm = ({
  person,
  text,
}: {
  person: { id: string; nextAction: string | null; nextActionDue: string | null };
  text: PersonPageText;
}) => {
  const t = text.nextAction;
  const write = useWrite({ ...text.errors, nextAction: t.missing });
  const done = useEditDone();
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
    const answer = await write.run(
      () => updatePerson(person.id, { nextAction: action, nextActionDue: due === '' ? null : due }),
      { done: t.saved },
    );
    if (answer?.ok) {
      done?.();
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.fieldRow} data-columns="wide-narrow">
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
            aria-describedby="siguiente-fecha-hint"
          />
          <span id="siguiente-fecha-hint" className={ui.hint}>
            {t.dueHint}
          </span>
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
            onClick={async () => {
              const answer = await write.run(
                () => updatePerson(person.id, { nextAction: null, nextActionDue: null }),
                { done: t.cleared },
              );
              if (answer?.ok) {
                done?.();
              }
            }}
          >
            {t.clear}
          </button>
        )}
        {done ? (
          <button type="button" className={ui.textButton} onClick={done}>
            {text.cancel}
          </button>
        ) : null}
      </div>
    </form>
  );
};

/**
 * A contact attempt (onboarding spec, views): channel and outcome presets, an optional note, and the day it was made if
 * not today (PLAN M5).
 */
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
      () =>
        addAttempt(personId, {
          channel,
          outcome,
          ...(note === '' ? {} : { note }),
          ...happenedOnOf(formText(form, 'happenedOn')),
        }),
      { done: t.saved },
    );
    if (answer?.ok) {
      form.reset();
    }
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <div className={ui.fieldRow}>
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
        <HappenedOn id="intento-fecha" text={text} />
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

/** A note on the timeline, with the reminder not to write sensitive details down; dated if it tells of another day. */
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
    const answer = await write.run(
      () => addNote(personId, { body, ...happenedOnOf(formText(form, 'happenedOn')) }),
      { done: t.saved },
    );
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
      <div className={styles.narrowField}>
        <HappenedOn id="nota-fecha" text={text} />
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
