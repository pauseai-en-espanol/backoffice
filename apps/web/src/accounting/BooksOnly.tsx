import { getTranslator } from '@backoffice/i18n/messages';

import * as styles from '@/ui/styles';

const t = getTranslator();

/**
 * What a Cuentas page shows a staff member who neither keeps nor reads the books: what the section is and whom to ask.
 * The API refuses them the data anyway (403).
 */
export const BooksOnly = () => (
  <>
    <h1 className={styles.h1}>{t('web.booksOnly.title')}</h1>
    <p className={styles.text}>{t('web.booksOnly.body')}</p>
  </>
);

/** A read the API couldn't answer. */
export const BooksUnavailable = () => (
  <>
    <h1 className={styles.h1}>{t('web.unavailable.title')}</h1>
    <p className={styles.notice}>{t('web.unavailable.body')}</p>
  </>
);
