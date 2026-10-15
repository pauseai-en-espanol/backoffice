'use client';

import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';

import * as styles from '@/ui/styles';

/**
 * The sections, as a menu on a phone: one button that opens and closes the list (aria-expanded). It is open only on
 * the page it was opened on, so choosing a section closes it; Escape closes it too and puts focus back on the button.
 * From a tablet up the list is always shown and the button isn't (ui/styles navList, menuButton).
 */
export const NavMenu = ({ label, children }: PropsWithChildren<{ label: string }>) => {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="secciones"
        onClick={() => setOpenOn(open ? null : path)}
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        {label}
      </button>
      <ul id="secciones" className={styles.navList} data-open={open}>
        {children}
      </ul>
    </>
  );
};
