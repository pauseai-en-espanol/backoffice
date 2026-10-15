'use client';

import { type PropsWithChildren, useEffect, useRef } from 'react';

import * as ui from '@/ui/styles';

import * as styles from './styles';

/**
 * Siguiente's heading for the target on screen. When the page moves on to another one ("Sí, enviada" reads the page
 * again; "Ahora no" opens it with that one left out), focus goes to the new heading, so a keyboard or screen reader
 * user starts again from who is next rather than from wherever the old buttons were. `focusOnMount` is for a page
 * opened by "Ahora no".
 */
export const TargetHeading = ({
  id,
  targetId,
  focusOnMount,
  children,
}: PropsWithChildren<{ id: string; targetId: string; focusOnMount: boolean }>) => {
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (shown.current === undefined ? focusOnMount : shown.current !== targetId) {
      heading.current?.focus();
    }
    shown.current = targetId;
  }, [targetId, focusOnMount]);

  return (
    <h2 ref={heading} id={id} tabIndex={-1} className={`${ui.h2} ${styles.focusable}`}>
      {children}
    </h2>
  );
};
