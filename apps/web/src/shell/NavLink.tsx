'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import * as styles from '@/ui/styles';

/** A section's link, marked as the current page on it and on the pages under it. */
export const NavLink = ({ href, label }: { href: string; label: string }) => {
  const path = usePathname();
  const current = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
  return (
    <Link className={styles.navLink} href={href} aria-current={current ? 'page' : undefined}>
      {label}
    </Link>
  );
};
