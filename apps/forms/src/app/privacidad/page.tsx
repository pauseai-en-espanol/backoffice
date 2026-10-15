import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { connection } from 'next/server';

import { contactEmail, wordingVersion } from '@/config';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('census.privacy.title') };

const SECTIONS = [
  ['controllerTitle', 'controller'],
  ['purposeTitle', 'purpose'],
  ['dataTitle', 'data'],
  ['basisTitle', 'basis'],
  ['recipientsTitle', 'recipients'],
  ['retentionTitle', 'retention'],
  ['rightsTitle', 'rights'],
  ['minorsTitle', 'minors'],
] as const;

/**
 * The census's privacy notice (personal data spec, notice and rights), until the association publishes its own and
 * PRIVACY_NOTICE_URL points there. A draft, and it says so: its wording needs the association's review.
 */
const PrivacyNotice = async () => {
  await connection();
  const email = contactEmail();
  return (
    <main className={styles.narrow}>
      <h1 className={styles.h1}>{t('census.privacy.title')}</h1>
      <p className={styles.notice}>
        <span aria-hidden="true">⚠ </span>
        {t('census.privacy.draft')}
      </p>
      <div className={styles.prose}>
        {SECTIONS.map(([title, body]) => (
          <section key={body}>
            <h2>{t(`census.privacy.${title}`)}</h2>
            <p>{t(`census.privacy.${body}`)}</p>
            {body === 'controller' ? (
              <p>
                {email ? (
                  <>
                    {t('census.privacy.contact')}{' '}
                    <a className={styles.link} href={`mailto:${email}`}>
                      {email}
                    </a>
                    .
                  </>
                ) : (
                  t('census.privacy.contactNone')
                )}
              </p>
            ) : null}
          </section>
        ))}
        <p className={styles.text}>{t('census.privacy.version', { version: wordingVersion() })}</p>
      </div>
      <Link className={styles.link} href="/">
        {t('census.privacy.back')}
      </Link>
    </main>
  );
};

export default PrivacyNotice;
