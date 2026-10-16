import type { PropsWithChildren } from 'react';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { Staff } from '@/session';

import { SignOutButton } from '@/auth/SignOutButton';
import { censusUrl } from '@/onboarding/census/data';
import { productName } from '@/product';
import * as styles from '@/ui/styles';

import { type NavGroup, navGroups } from './nav';
import { NavLink } from './NavLink';
import { NavMenu } from './NavMenu';

const t = getTranslator();

const GROUP_LABELS = {
  onboarding: 'web.nav.groupOnboarding',
  outreach: 'web.nav.groupOutreach',
  team: 'web.nav.groupTeam',
} as const satisfies Record<NavGroup['id'], string>;

/**
 * Every signed-in page's frame: the product's name, who is signed in, and the sections in groups by role (nav.ts, PLAN
 * M5), each list named by its group's label (aria-labelledby): a sidebar on a computer, a menu on a phone. The API
 * refuses what a role doesn't open anyway. `bandeja`, when the page knows it, is how many records wait in the Bandeja.
 * A skip link leads past it all to the page's content.
 */
export const AppShell = ({
  me,
  bandeja,
  children,
}: PropsWithChildren<{ me: Staff; bandeja?: number }>) => {
  const groups = navGroups(me.staff.roles, { census: censusUrl() !== '' });
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
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label={t('web.nav.label')}>
          <NavMenu label={t('web.nav.menu')}>
            {groups.map((group) => (
              <div key={group.id} className={styles.navGroup}>
                <p id={`menu-${group.id}`} className={styles.navGroupLabel}>
                  {t(GROUP_LABELS[group.id])}
                </p>
                <ul className={styles.navList} aria-labelledby={`menu-${group.id}`}>
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        href={item.href}
                        label={
                          item.label === 'bandeja' && bandeja !== undefined && bandeja > 0
                            ? t('web.nav.bandejaCount', { count: bandeja })
                            : t(`web.nav.${item.label}`)
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <ul className={styles.navList}>
              <li>
                <NavLink href="/ajustes" label={t('web.nav.settings')} />
              </li>
              <li>
                <SignOutButton label={t('web.nav.signOut')} className={styles.navLink} />
              </li>
            </ul>
          </NavMenu>
        </nav>
        <main id="contenido" tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </>
  );
};
