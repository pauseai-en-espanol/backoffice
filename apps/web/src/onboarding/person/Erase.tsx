'use client';

import { useEffect, useRef, useState } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { erasePerson } from '../census/actions';

export interface EraseText {
  erase: string;
  /** "¿Borrar los datos de Ana? No se puede deshacer…", filled by the page. */
  question: string;
  understand: string;
  confirm: string;
  cancel: string;
  done: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * Erasing a person's data (personal data spec, rights), for admins: asked in place, and only once they tick that it
 * can't be undone does the last button do anything; until then it points them to the box. Afterwards the page reads
 * the person again, anonymised. "Cancelar" puts focus back on the first button.
 */
export const EraseData = ({ personId, text }: { personId: string; text: EraseText }) => {
  const write = useWrite(text.errors);
  const [asking, setAsking] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const question = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  const id = `borrar-${personId}`;

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
    const answer = await write.run(() => erasePerson(personId), { done: text.done });
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
              id={`${id}-entiendo`}
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.currentTarget.checked)}
            />
            <label htmlFor={`${id}-entiendo`}>{text.understand}</label>
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
