'use client';

import { useEffect, useRef, useState } from 'react';

import * as ui from '@/ui/styles';

import * as styles from './styles';

/** How long "Copiado" stays beside the button. */
const SHOWN_MS = 4_000;

/**
 * Copies one part of a letter (recipient, subject, body) for the sender to paste into their own mail: some clients cut
 * long `mailto:` links. "Copiado" then shows beside the button, in words, and is announced (its own live region);
 * a browser that refuses says to copy by hand.
 */
export const CopyButton = ({
  label,
  value,
  words,
}: {
  label: string;
  value: string;
  words: { copied: string; copyFailed: string };
}) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    clearTimeout(timer.current);
    setState('idle');
    navigator.clipboard.writeText(value).then(
      () => {
        setState('copied');
        timer.current = setTimeout(() => setState('idle'), SHOWN_MS);
      },
      () => setState('failed'),
    );
  };

  return (
    <span className={styles.copy}>
      <button type="button" className={ui.secondaryButton} onClick={copy}>
        {label}
      </button>
      <span role="status" className={styles.copied}>
        {state === 'copied' ? (
          <>
            <span aria-hidden="true">✓ </span>
            {words.copied}
          </>
        ) : state === 'failed' ? (
          <>
            <span aria-hidden="true">⚠ </span>
            {words.copyFailed}
          </>
        ) : null}
      </span>
    </span>
  );
};
