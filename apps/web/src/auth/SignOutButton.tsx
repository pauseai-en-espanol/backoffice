'use client';

import { useState } from 'react';

import { Icon } from '@/ui/Icon';
import { NAV_ICONS } from '@/ui/icons';

import { postAuth } from './client';
import * as styles from './styles';

/** Ends the session, then shows the sign-in page, whatever the API answered. In the menu, with its icon (`icon`). */
export const SignOutButton = ({
  label,
  className,
  icon = false,
}: {
  label: string;
  className?: string;
  icon?: boolean;
}) => {
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
      {icon ? <Icon icon={NAV_ICONS.signOut} size={17} /> : null}
      {label}
    </button>
  );
};
