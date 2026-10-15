'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { messageFor, type WriteAnswer } from '@/write';

import { useAnnounce } from './announce';
import * as styles from './styles';

export interface ConfirmText {
  /** The question asked in place, before anything is done. */
  question: string;
  confirm: string;
  cancel: string;
  /** Said once it is done, in the page's live region (Announcer). */
  done: string;
  /** The refusals' words, by code (write.ts). */
  errors: Readonly<Record<string, string>>;
}

/**
 * A change that matters (deactivating someone, revoking an invitation), asked about in place first: the button opens
 * the question, which takes focus; "Cancelar" puts focus back on the button. Once done, the result is said in the
 * page's live region and the page's data is read again; a refusal is said here, next to the button.
 */
export const ConfirmAction = ({
  label,
  text,
  run,
}: {
  label: string;
  text: ConfirmText;
  run: () => Promise<WriteAnswer>;
}) => {
  const router = useRouter();
  const announce = useAnnounce();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const question = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (asking) {
      question.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [asking]);

  const go = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    const answer = await run();
    setPending(false);
    setAsking(false);
    if (answer.ok) {
      announce(text.done);
      router.refresh();
    } else {
      setError(messageFor(answer, text.errors));
    }
  };

  return (
    <div>
      {asking ? (
        <div
          ref={question}
          tabIndex={-1}
          role="group"
          aria-label={label}
          className={styles.confirm}
        >
          <p>{text.question}</p>
          <div className={styles.rowActions}>
            <button
              type="button"
              className={styles.button}
              aria-disabled={pending}
              onClick={() => void go()}
            >
              {text.confirm}
            </button>
            <button type="button" className={styles.textButton} onClick={() => setAsking(false)}>
              {text.cancel}
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={opener}
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            opened.current = true;
            setError(undefined);
            setAsking(true);
          }}
        >
          {label}
        </button>
      )}
      <div role="alert">
        {error ? (
          <p className={styles.alert}>
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
};
