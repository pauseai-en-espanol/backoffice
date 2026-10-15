import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { EnrolForm } from '@/auth/EnrolForm';
import { SignOutButton } from '@/auth/SignOutButton';
import * as styles from '@/auth/styles';
import { authErrors } from '@/auth/text';
import { requireStage } from '@/session';

const t = getTranslator();

export const metadata: Metadata = { title: t('auth.enrol.title') };

const EnrolPage = async () => {
  await requireStage('enrol');
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t('auth.enrol.title')}</h1>
      <p className={styles.text}>{t('auth.enrol.intro')}</p>
      <EnrolForm
        text={{
          passwordStep: t('auth.enrol.passwordStep'),
          password: t('auth.enrol.password'),
          begin: t('auth.enrol.begin'),
          scanTitle: t('auth.enrol.scanTitle'),
          scan: t('auth.enrol.scan'),
          qrLabel: t('auth.enrol.qrLabel'),
          manual: t('auth.enrol.manual'),
          code: t('auth.enrol.code'),
          codeHint: t('auth.enrol.codeHint'),
          verify: t('auth.enrol.verify'),
          backupTitle: t('auth.enrol.backupTitle'),
          backupIntro: t('auth.enrol.backupIntro'),
          backupList: t('auth.enrol.backupList'),
          done: t('auth.enrol.done'),
          restart: t('auth.challenge.restart'),
          errors: authErrors(t),
        }}
      />
      {/* Someone who signed in to the wrong account, or on a shared computer, can leave. */}
      <p className={styles.footnote}>
        <SignOutButton label={t('auth.signOut')} />
      </p>
    </main>
  );
};

export default EnrolPage;
