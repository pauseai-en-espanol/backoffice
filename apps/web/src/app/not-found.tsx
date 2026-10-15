import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.notFound.title') };

/** Any page that doesn't exist, and any page the signed-in staff member's roles don't open. */
const NotFound = () => (
  <main className={styles.narrow}>
    <h1 className={styles.h1}>{t('web.notFound.title')}</h1>
    <p className={styles.text}>{t('web.notFound.body')}</p>
    <Link className={styles.link} href="/">
      {t('web.notFound.home')}
    </Link>
  </main>
);

export default NotFound;
