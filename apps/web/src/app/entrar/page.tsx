import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { SignInForm } from '@/auth/SignInForm';
import * as styles from '@/auth/styles';
import { authErrors } from '@/auth/text';
import { requireStage } from '@/session';

const t = getTranslator();

export const metadata: Metadata = { title: t('auth.signIn.title') };

// Also while a code is awaited or an account is enrolling, so that someone can start again with another account.
const SignInPage = async () => {
  const { stage } = await requireStage(
    'signed-out',
    'challenge',
    'enrol',
    'no-access',
    'unavailable',
  );
  if (stage === 'unavailable') {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>{t('auth.signIn.title')}</h1>
        <p className={styles.text}>{t('auth.signIn.unavailable')}</p>
      </main>
    );
  }
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t('auth.signIn.title')}</h1>
      <p className={styles.text}>{t('auth.signIn.intro')}</p>
      <SignInForm
        text={{
          email: t('auth.signIn.email'),
          password: t('auth.signIn.password'),
          submit: t('auth.signIn.submit'),
          restart: t('auth.challenge.restart'),
          errors: authErrors(t),
        }}
      />
      <p className={styles.footnote}>
        <Link className={styles.link} href="/contrasena-olvidada">
          {t('auth.signIn.forgot')}
        </Link>
      </p>
      <p className={`${styles.hint} ${styles.footnote}`}>{t('auth.signIn.noAccount')}</p>
    </main>
  );
};

export default SignInPage;
