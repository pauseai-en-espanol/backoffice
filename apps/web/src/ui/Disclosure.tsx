'use client';

import { type PropsWithChildren, useState } from 'react';

import * as styles from './styles';

/**
 * A form folded behind a button, so a page on a phone leads with what is done most (aria-expanded, aria-controls).
 * What it folds stays mounted while hidden, so a half-filled form keeps what was typed.
 */
export const Disclosure = ({
  id,
  label,
  defaultOpen = false,
  children,
}: PropsWithChildren<{ id: string; label: string; defaultOpen?: boolean }>) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.disclosure}>
      <div>
        <button
          type="button"
          className={styles.secondaryButton}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? '− ' : '+ '}</span>
          {label}
        </button>
      </div>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
};
