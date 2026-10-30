import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { safeNext } from '@/auth/confirm';
import { PasskeySignIn } from '@/auth/PasskeySignIn';
import { StepUpForm } from '@/auth/StepUpForm';
import * as styles from '@/auth/styles';
import { authErrors } from '@/auth/text';
import { requireStaff } from '@/session';

const t = getTranslator();

export const metadata: Metadata = { title: t('auth.stepUp.title') };

/**
 * "Confirma que eres tú" (PLAN D23): the riskiest actions (erasure, exports, Equipo, admins' Ajustes, the audit log,
 * adding a passkey) want a second factor of the last 12 hours. A code from the app, or a passkey, which signs in
 * afresh; then back to the page that asked (`next`, a path of this app only).
 */
const ConfirmPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  const { next: asked } = await searchParams;
  const next = safeNext(Array.isArray(asked) ? asked[0] : asked);
  if (me.recentSecondFactor) {
    redirect(next);
  }
  const errors = authErrors(t);
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t('auth.stepUp.title')}</h1>
      <StepUpForm
        next={next}
        text={{
          intro: t('auth.stepUp.intro'),
          code: t('auth.challenge.code'),
          submit: t('auth.stepUp.submit'),
          restart: t('auth.challenge.restart'),
          errors,
        }}
      />
      <PasskeySignIn
        next={next}
        text={{
          question: t('auth.signIn.passkeyQuestion'),
          button: t('auth.signIn.passkey'),
          hint: t('auth.stepUp.passkeyHint'),
          restart: t('auth.challenge.restart'),
          errors,
        }}
      />
      <p className={`${styles.hint} ${styles.footnote}`}>{t('auth.stepUp.noApp')}</p>
      <p className={styles.footnote}>
        <Link className={styles.link} href="/">
          {t('auth.stepUp.back')}
        </Link>
      </p>
    </main>
  );
};

export default ConfirmPage;
