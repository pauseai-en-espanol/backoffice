import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { SignOutButton } from '@/auth/SignOutButton';
import { requireStage } from '@/session';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.noAccess.title') };

/**
 * Signed in with the second factor, but not (or no longer) an active staff member: the database gives such a session
 * nothing, and this page says so instead of showing empty screens.
 */
const NoAccessPage = async () => {
  await requireStage('no-access');
  return (
    <main className={styles.narrow}>
      <h1 className={styles.h1}>{t('web.noAccess.title')}</h1>
      <p className={styles.text}>{t('web.noAccess.body')}</p>
      <SignOutButton label={t('web.noAccess.signOut')} className={styles.secondaryButton} />
    </main>
  );
};

export default NoAccessPage;
