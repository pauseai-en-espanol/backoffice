import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.notFound.title') };

/** Any address of this host but the census's own. */
const NotFound = () => (
  <main className={styles.narrow}>
    <h1 className={styles.h1}>{t('web.notFound.title')}</h1>
    <p className={styles.text}>{t('web.notFound.body')}</p>
    <Link className={styles.link} href="/">
      {t('census.toGeneric')}
    </Link>
  </main>
);

export default NotFound;
