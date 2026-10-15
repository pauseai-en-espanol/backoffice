import { getTranslator } from '@backoffice/i18n/messages';

import * as styles from '@/ui/styles';

const t = getTranslator();

/**
 * What an onboarding page shows a staff member without the onboarding or admin role (outreach only): what the
 * section is and whom to ask. The API refuses them the data anyway (403).
 */
export const OnboardingOnly = () => (
  <>
    <h1 className={styles.h1}>{t('web.onboardingOnly.title')}</h1>
    <p className={styles.text}>{t('web.onboardingOnly.body')}</p>
  </>
);

/** The same for a read the API refused (403) to someone the page let in. */
export const Forbidden = () => (
  <>
    <h1 className={styles.h1}>{t('web.onboardingOnly.title')}</h1>
    <p className={styles.text}>{t('errors.forbidden')}</p>
  </>
);
