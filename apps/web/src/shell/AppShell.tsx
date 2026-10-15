import type { PropsWithChildren } from 'react';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { Staff } from '@/session';

import { SignOutButton } from '@/auth/SignOutButton';
import { productName } from '@/product';
import * as styles from '@/ui/styles';

import { NavLink } from './NavLink';

const t = getTranslator();

/**
 * Every signed-in page's frame: the product's name, who is signed in, and the sections, one row that scrolls sideways
 * on a phone. Registro is listed only for admins (the API refuses it to anyone else anyway). A skip link leads past it
 * all to the page's content.
 */
export const AppShell = ({ me, children }: PropsWithChildren<{ me: Staff }>) => {
  const admin = me.staff.roles.includes('admin');
  return (
    <>
      <a className={styles.skipLink} href="#contenido">
        {t('web.skip')}
      </a>
      <header className={styles.header}>
        <Link className={styles.productLink} href="/">
          {productName() || t('web.nav.today')}
        </Link>
        <span className={styles.muted}>{t('web.signedInAs', { name: me.staff.displayName })}</span>
      </header>
      <nav className={styles.nav} aria-label={t('web.nav.label')}>
        <ul className={styles.navList}>
          <li>
            <NavLink href="/" label={t('web.nav.today')} />
          </li>
          <li>
            <NavLink href="/equipo" label={t('web.nav.team')} />
          </li>
          {admin ? (
            <li>
              <NavLink href="/registro" label={t('web.nav.audit')} />
            </li>
          ) : null}
          <li>
            <SignOutButton label={t('web.nav.signOut')} className={styles.navLink} />
          </li>
        </ul>
      </nav>
      <main id="contenido" tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </>
  );
};
