'use client';

import { type PropsWithChildren, useCallback, useState } from 'react';

import { AnnounceContext } from './announce';
import * as styles from './styles';

/**
 * One live region for a page's results ("Invitación revocada"), kept above the rows they concern: a row that changes
 * or goes away once the page's data is read again would take its own message with it. The message stays visible
 * until the next one.
 */
export const Announcer = ({ children }: PropsWithChildren) => {
  const [message, setMessage] = useState<string>();
  // Cleared first, so the same words are announced again when the same thing is done twice.
  const announce = useCallback((next: string) => {
    setMessage(undefined);
    requestAnimationFrame(() => setMessage(next));
  }, []);
  return (
    <AnnounceContext value={announce}>
      <div role="status" aria-live="polite">
        {message ? <p className={styles.done}>{message}</p> : null}
      </div>
      {children}
    </AnnounceContext>
  );
};
