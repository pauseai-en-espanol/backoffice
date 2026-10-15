import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { SetPasswordLoader } from '@/auth/SetPasswordLoader';
import * as styles from '@/auth/styles';
import { authErrors } from '@/auth/text';

const t = getTranslator();

export const metadata: Metadata = { title: t('auth.setPassword.title') };

// Whoever holds the link, signed in or not: its token, which only the browser sees, alone decides, in the API.
const SetPasswordPage = () => (
  <main className={styles.page}>
    <h1 className={styles.heading}>{t('auth.setPassword.title')}</h1>
    <SetPasswordLoader
      text={{
        intro: t('auth.setPassword.intro'),
        missing: t('auth.setPassword.missing'),
        password: t('auth.setPassword.password'),
        passwordHint: t('auth.setPassword.passwordHint'),
        confirm: t('auth.setPassword.confirm'),
        submit: t('auth.setPassword.submit'),
        doneTitle: t('auth.setPassword.doneTitle'),
        done: t('auth.setPassword.done'),
        signIn: t('auth.setPassword.signIn'),
        restart: t('auth.challenge.restart'),
        errors: authErrors(t),
      }}
    />
  </main>
);

export default SetPasswordPage;
