'use client';

import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';

import * as styles from '@/ui/styles';

/**
 * The sections, in their groups (nav.ts), as a menu below a computer's width: one button that opens and closes them
 * (aria-expanded). It is open only on the page it was opened on, so choosing a section closes it; Escape closes it too
 * and puts focus back on the button. On a computer they are a sidebar, always shown, and the button isn't (ui/styles
 * navPanel, menuButton).
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
      <div id="secciones" className={styles.navPanel} data-open={open}>
        {children}
      </div>
    </>
  );
};
