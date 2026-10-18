'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/ui/Icon';
import { NAV_ICONS, type NavIcon } from '@/ui/icons';
import * as styles from '@/ui/styles';

/** A section's link, its icon beside its word (PLAN R66), marked as the current page on it and on the pages under it. */
export const NavLink = ({ href, label, icon }: { href: string; label: string; icon: NavIcon }) => {
  const path = usePathname();
  const current = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  return (
    <Link className={styles.navLink} href={href} aria-current={current ? 'page' : undefined}>
      <Icon icon={NAV_ICONS[icon]} size={17} />
      {label}
    </Link>
  );
};
