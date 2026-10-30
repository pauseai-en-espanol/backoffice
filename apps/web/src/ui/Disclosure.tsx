'use client';

import { type PropsWithChildren, useState } from 'react';

import * as styles from './styles';

/**
 * A form folded behind a button, so a page on a phone leads with what is done most (aria-expanded, aria-controls).
 * What it folds stays mounted while hidden, so a half-filled form keeps what was typed. A whole section of a page
 * folded (`heading`) keeps its button in a heading, so the page's headings still list it.
 */
export const Disclosure = ({
  id,
  label,
  defaultOpen = false,
  heading = false,
  children,
}: PropsWithChildren<{ id: string; label: string; defaultOpen?: boolean; heading?: boolean }>) => {
  const [open, setOpen] = useState(defaultOpen);
  const button = (
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
  );
  return (
    <div className={styles.disclosure}>
      {heading ? <h2 className={styles.disclosureHeading}>{button}</h2> : <div>{button}</div>}
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
};
