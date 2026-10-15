import type { PropsWithChildren } from 'react';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { Staff } from '@/session';

import { SignOutButton } from '@/auth/SignOutButton';
import { productName } from '@/product';
import * as styles from '@/ui/styles';

import { NavLink } from './NavLink';
import { NavMenu } from './NavMenu';

const t = getTranslator();

/**
 * Every signed-in page's frame: the product's name, who is signed in, and the sections, a menu on a phone. The
 * onboarding sections are listed to onboarding staff and admins, Registro to admins (the API refuses anyone else
 * anyway). `bandeja`, when the page knows it, is how many records wait in the Bandeja. A skip link leads past it all to
 * the page's content.
 */
export const AppShell = ({
  me,
  bandeja,
  children,
}: PropsWithChildren<{ me: Staff; bandeja?: number }>) => {
  const admin = me.staff.roles.includes('admin');
  const onboarding = admin || me.staff.roles.includes('onboarding');
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
        <NavMenu label={t('web.nav.menu')}>
          <li>
            <NavLink href="/" label={t('web.nav.today')} />
          </li>
          {onboarding ? (
            <>
              <li>
                <NavLink href="/personas" label={t('web.nav.people')} />
              </li>
              <li>
                <NavLink href="/embudo" label={t('web.nav.board')} />
              </li>
              <li>
                <NavLink href="/panel" label={t('web.nav.panel')} />
              </li>
              <li>
                <NavLink href="/anadir" label={t('web.nav.add')} />
              </li>
              <li>
                <NavLink
                  href="/bandeja"
                  label={
                    bandeja === undefined || bandeja === 0
                      ? t('web.nav.bandeja')
                      : t('web.nav.bandejaCount', { count: bandeja })
                  }
                />
              </li>
              <li>
                <NavLink href="/censo" label={t('web.nav.census')} />
              </li>
              <li>
                <NavLink href="/importar" label={t('web.nav.imports')} />
              </li>
            </>
          ) : null}
          <li>
            <NavLink href="/equipo" label={t('web.nav.team')} />
          </li>
          {admin ? (
            <li>
              <NavLink href="/registro" label={t('web.nav.audit')} />
            </li>
          ) : null}
          <li>
            <NavLink href="/ajustes" label={t('web.nav.settings')} />
          </li>
          <li>
            <SignOutButton label={t('web.nav.signOut')} className={styles.navLink} />
          </li>
        </NavMenu>
      </nav>
      <main id="contenido" tabIndex={-1} className={styles.main}>
        {children}
      </main>
    </>
  );
};
