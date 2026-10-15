import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.home.title') };

/**
 * "Hoy": where signing in ends. In M1 it lists the people needing the staff member's attention and the unassigned
 * queue (onboarding spec, views); until then it says so and leads to the team.
 */
const Today = async () => {
  const me = await requireStaff();
  const admin = me.staff.roles.includes('admin');
  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('web.home.title')}</h1>
      <p className={styles.text}>{t('web.home.greeting', { name: me.staff.displayName })}</p>
      <section className={styles.card} aria-labelledby="coming">
        <h2 id="coming" className={styles.h3}>
          {t('web.home.comingTitle')}
        </h2>
        <p>{t('web.home.coming')}</p>
      </section>
      <ul className={styles.linkList}>
        <li>
          <Link className={styles.link} href="/equipo">
            {t('web.home.toTeam')}
          </Link>
        </li>
        {admin ? (
          <li>
            <Link className={styles.link} href="/registro">
              {t('web.home.toAudit')}
            </Link>
          </li>
        ) : null}
      </ul>
    </AppShell>
  );
};

export default Today;
