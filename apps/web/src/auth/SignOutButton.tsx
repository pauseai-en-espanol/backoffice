'use client';

import { useState } from 'react';

import { postAuth } from './client';
import * as styles from './styles';

/** Ends the session, then shows the sign-in page, whatever the API answered. */
export const SignOutButton = ({ label, className }: { label: string; className?: string }) => {
  const [pending, setPending] = useState(false);
  return (
    <button
      className={className ?? styles.textButton}
      type="button"
      aria-disabled={pending}
      onClick={async () => {
        if (pending) {
          return;
        }
        setPending(true);
        await postAuth('/sign-out', {});
        window.location.assign('/entrar');
      }}
    >
      {label}
    </button>
  );
};
