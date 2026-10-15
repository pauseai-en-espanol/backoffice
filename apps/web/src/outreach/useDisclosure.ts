'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A form opened in place by a button (as ProfileEditor's): opening moves focus to the form's heading, closing puts it
 * back on the button that opened it.
 */
export const useDisclosure = () => {
  const [open, setOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (open) {
      heading.current?.focus();
    } else if (opened.current) {
      opener.current?.focus();
    }
  }, [open]);

  return {
    open,
    heading,
    opener,
    show: () => {
      opened.current = true;
      setOpen(true);
    },
    hide: () => setOpen(false),
  };
};
