import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { ChallengeForm } from '@/auth/ChallengeForm';
import * as styles from '@/auth/styles';
import { authErrors } from '@/auth/text';
import { requireStage } from '@/session';

const t = getTranslator();

export const metadata: Metadata = { title: t('auth.challenge.title') };

const ChallengePage = async () => {
  await requireStage('challenge');
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t('auth.challenge.title')}</h1>
      <ChallengeForm
        text={{
          intro: t('auth.challenge.intro'),
          code: t('auth.challenge.code'),
          submit: t('auth.challenge.submit'),
          useBackupCode: t('auth.challenge.useBackupCode'),
          backupIntro: t('auth.challenge.backupIntro'),
          backupCode: t('auth.challenge.backupCode'),
          useAuthenticator: t('auth.challenge.useAuthenticator'),
          restart: t('auth.challenge.restart'),
          errors: authErrors(t),
        }}
      />
      <p className={styles.footnote}>
        <Link className={styles.link} href="/entrar">
          {t('auth.otherAccount')}
        </Link>
      </p>
    </main>
  );
};

export default ChallengePage;
