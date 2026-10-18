'use client';

import { type PropsWithChildren, type ReactNode, useEffect, useRef, useState } from 'react';

import { EditDone } from './edit-done';
import * as styles from './styles';

/**
 * What is known, and, in its very place, the form that changes it (read first, edit in place): the button names what
 * it changes ("Cambiar la etapa"), the form takes focus at its first field, and closing it brings focus back to the
 * button. The button sits beside a short value, or below a longer one (`below`).
 */
export const EditInPlace = ({
  label,
  view,
  below = false,
  children,
}: PropsWithChildren<{ label: string; view: ReactNode; below?: boolean }>) => {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (open) {
      area.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      <div className={below ? styles.editBelow : styles.editBeside}>
        <div className={styles.editValue}>{view}</div>
        <button
          ref={opener}
          type="button"
          className={styles.textButton}
          onClick={() => {
            opened.current = true;
            setOpen(true);
          }}
        >
          {label}
        </button>
      </div>
    );
  }
  return (
    <EditDone.Provider value={() => setOpen(false)}>
      <div ref={area}>{children}</div>
    </EditDone.Provider>
  );
};
