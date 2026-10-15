import { getTranslator } from '@backoffice/i18n/messages';

import * as styles from '@/ui/styles';

const t = getTranslator();

/**
 * What an outreach page shows a staff member without the outreach or admin role (onboarding only): what the section
 * is and whom to ask. The API refuses them the data anyway (403).
 */
export const OutreachOnly = () => (
  <>
    <h1 className={styles.h1}>{t('web.outreachOnly.title')}</h1>
    <p className={styles.text}>{t('web.outreachOnly.body')}</p>
  </>
);

/** The same for a read the API refused (403) to someone the page let in. */
export const OutreachForbidden = () => (
  <>
    <h1 className={styles.h1}>{t('web.outreachOnly.title')}</h1>
    <p className={styles.text}>{t('errors.forbidden')}</p>
  </>
);

/** A read the API couldn't answer. */
export const Unavailable = () => (
  <>
    <h1 className={styles.h1}>{t('web.unavailable.title')}</h1>
    <p className={styles.notice}>{t('web.unavailable.body')}</p>
  </>
);
