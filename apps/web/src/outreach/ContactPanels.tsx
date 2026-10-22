'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { formText } from '@/auth/client';
import { fill } from '@/fill';
import { happenedOnOf } from '@/onboarding/forms';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { addNote, eraseContact, updateContact } from './actions';
import { Field } from './Field';
import { type ContactInput, listFrom, mustStayInReview } from './forms';

/**
 * A contact's own actions besides editing their details (outreach spec §1): confirming why they matter so they can be
 * written to, holding them out of every send, a note on their timeline, and, for admins, erasing their data.
 */

export interface ReviewText {
  intro: string;
  hint: string;
  reason: string;
  sources: string;
  sourcesHint: string;
  mark: string;
  done: string;
  reviewed: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Reviewing a contact: their reason and sources, corrected here if need be, and marked reviewed in one go. The
 * database refuses a reviewed contact without both (400 `reason`), and so does this form first.
 */
export const ReviewPanel = ({
  contact,
  text,
}: {
  contact: { id: string; needsReview: boolean; reason: string | null; sources: readonly string[] };
  text: ReviewText;
}) => {
  const write = useWrite(text.errors);
  const [missing, setMissing] = useState(false);

  if (!contact.needsReview) {
    return (
      <p>
        <span aria-hidden="true">✓ </span>
        {text.reviewed}
      </p>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = formText(form, 'reason').trim();
    const sources = listFrom(formText(form, 'sources'));
    const stays = mustStayInReview({ reason, sources });
    setMissing(stays);
    if (stays) {
      return;
    }
    const change: ContactInput = { needsReview: false };
    if (reason !== (contact.reason ?? '')) {
      change.reason = reason;
    }
    if (sources.join('\n') !== contact.sources.join('\n')) {
      change.sources = sources;
    }
    await write.run(() => updateContact(contact.id, change), { done: text.done });
  };

  const error = missing ? text.errors.reason : write.error;
  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <p className={ui.hint}>{text.intro}</p>
      <p className={ui.hint}>{text.hint}</p>
      <Field
        id="revision-motivo"
        name="reason"
        label={text.reason}
        defaultValue={contact.reason}
        multiline
        maxLength={2000}
        invalid={missing}
        errorId={error ? 'revision-error' : undefined}
      />
      <Field
        id="revision-fuentes"
        name="sources"
        label={text.sources}
        hint={text.sourcesHint}
        defaultValue={contact.sources.join('\n')}
        multiline
        invalid={missing}
        errorId={error ? 'revision-error' : undefined}
      />
      <FormError id="revision-error" message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.mark}
        </button>
      </div>
    </form>
  );
};

export interface HoldText {
  intro: string;
  /** "En pausa: {reason}" */
  on: string;
  onNoReason: string;
  off: string;
  reason: string;
  hold: string;
  held: string;
  release: string;
  released: string;
  errors: Readonly<Record<string, string>>;
}

/** Holding a contact out of every send, with why; or letting them back in. */
export const HoldPanel = ({
  contact,
  text,
}: {
  contact: { id: string; hold: boolean; holdReason: string | null };
  text: HoldText;
}) => {
  const write = useWrite(text.errors);

  if (contact.hold) {
    return (
      <div className={ui.form}>
        <p>
          <span aria-hidden="true">! </span>
          {contact.holdReason ? fill(text.on, { reason: contact.holdReason }) : text.onNoReason}
        </p>
        <FormError message={write.error} />
        <div>
          <button
            type="button"
            className={ui.secondaryButton}
            aria-disabled={write.pending}
            onClick={() =>
              void write.run(() => updateContact(contact.id, { hold: false, holdReason: null }), {
                done: text.released,
              })
            }
          >
            {text.release}
          </button>
        </div>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = formText(event.currentTarget, 'holdReason').trim();
    await write.run(
      () => updateContact(contact.id, { hold: true, holdReason: reason === '' ? null : reason }),
      { done: text.held },
    );
  };

  return (
    <form className={ui.form} onSubmit={submit}>
      <p className={ui.hint}>{text.intro}</p>
      <p>{text.off}</p>
      <Field id="pausa-motivo" name="holdReason" label={text.reason} maxLength={500} />
      <FormError message={write.error} />
      <div>
        <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
          {text.hold}
        </button>
      </div>
    </form>
  );
};

export interface NoteText {
  note: string;
  warning: string;
  /** "Cuándo fue", optional: its label, hint, and today's date in Madrid, the latest it takes. */
  happened: { label: string; hint: string; today: string };
  /** "Solo para mí", and on a private record, that its notes are private too. */
  mine: string;
  mineHint: string;
  mineAlready: string;
  save: string;
  saved: string;
  missing: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A note on a timeline, a contact's or an organisation's, with the reminder not to write down what the relationship
 * doesn't need, the day the conversation it tells happened (today to start with), never a day to come, and whether it
 * is for its writer alone (PLAN M5, step 6). On a private record every note is, and the form says so.
 */
export const NoteForm = ({
  on,
  text,
}: {
  on: { kind: 'contact' | 'organisation'; id: string; private: boolean };
  text: NoteText;
}) => {
  const write = useWrite({ ...text.errors, body: text.missing });
  const [missing, setMissing] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = formText(form, 'body').trim();
    setMissing(body === '');
    if (body === '') {
      return;
    }
    // Today to start with, which is now (PLAN R73).
    const happenedOn =
      happenedOnOf(formText(form, 'happenedOn'), text.happened.today).happenedOn ?? '';
    const isPrivate = formText(form, 'private') === '1';
    const answer = await write.run(() => addNote(on, body, { happenedOn, isPrivate }), {
      done: text.saved,
    });
    if (answer?.ok) {
      form.reset();
    }
  };

  const error = missing ? text.missing : write.error;
  return (
    <form className={ui.form} onSubmit={submit} noValidate>
      <Field
        id="nota-texto"
        name="body"
        label={text.note}
        hint={text.warning}
        multiline
        maxLength={4000}
        invalid={missing}
        errorId={error ? 'nota-error' : undefined}
      />
      <div className={ui.field}>
        <label className={ui.label} htmlFor="nota-fecha">
          {text.happened.label}
        </label>
        <input
          id="nota-fecha"
          className={ui.input}
          type="date"
          name="happenedOn"
          max={text.happened.today}
          defaultValue={text.happened.today}
          aria-describedby="nota-fecha-hint"
        />
        <span id="nota-fecha-hint" className={ui.hint}>
          {text.happened.hint}
        </span>
      </div>
      {on.private ? (
        <p className={ui.hint}>{text.mineAlready}</p>
      ) : (
        <div className={ui.checkbox}>
          <input
            id="nota-solo-yo"
            type="checkbox"
            name="private"
            value="1"
            aria-describedby="nota-solo-yo-pista"
          />
          <label htmlFor="nota-solo-yo">{text.mine}</label>
          <span id="nota-solo-yo-pista" className={ui.checkboxHelp}>
            {text.mineHint}
          </span>
        </div>
      )}
      <FormError id="nota-error" message={error} />
      <div>
        <button type="submit" className={ui.button} aria-disabled={write.pending}>
          {text.save}
        </button>
      </div>
    </form>
  );
};

export interface EraseText {
  erase: string;
  /** What goes and what stays, the contact's name filled in by the page. */
  question: string;
  understand: string;
  confirm: string;
  cancel: string;
  done: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Erasing a contact's data (personal data spec, rights), for admins, as a person's is: asked in place, saying what goes
 * and what stays, and done only once they tick that it can't be undone. Afterwards the page reads the contact again,
 * anonymised and read only; erased already, the API says so (409 stale).
 */
export const EraseContact = ({ contactId, text }: { contactId: string; text: EraseText }) => {
  const write = useWrite(text.errors);
  const [asking, setAsking] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const question = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (asking) {
      question.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [asking]);

  const erase = async () => {
    if (!understood) {
      box.current?.focus();
      return;
    }
    const answer = await write.run(() => eraseContact(contactId), { done: text.done });
    if (answer?.ok) {
      setAsking(false);
    }
  };

  return (
    <div>
      {asking ? (
        <div
          ref={question}
          tabIndex={-1}
          role="group"
          aria-label={text.erase}
          className={ui.confirm}
        >
          <p>{text.question}</p>
          <div className={ui.checkbox}>
            <input
              ref={box}
              id="borrar-entiendo"
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.currentTarget.checked)}
            />
            <label htmlFor="borrar-entiendo">{text.understand}</label>
          </div>
          <div className={ui.rowActions}>
            <button
              type="button"
              className={ui.button}
              aria-disabled={!understood || write.pending}
              onClick={() => void erase()}
            >
              {text.confirm}
            </button>
            <button
              type="button"
              className={ui.textButton}
              onClick={() => {
                setUnderstood(false);
                write.clear();
                setAsking(false);
              }}
            >
              {text.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={opener}
          type="button"
          className={ui.secondaryButton}
          onClick={() => {
            opened.current = true;
            setAsking(true);
          }}
        >
          {text.erase}
        </button>
      )}
      <FormError message={write.error} />
    </div>
  );
};
