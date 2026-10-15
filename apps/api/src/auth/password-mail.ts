import { getTranslator } from '@backoffice/i18n/messages';

import type { Mailer } from '../mail/mailer.js';

import { plainName } from '../staff/invitations.js';
import { FORGOT_PASSWORD_PATH, setPasswordLink } from './accounts.js';

/**
 * The account mail of password recovery (PLAN R7), from the backoffice's sender and in its name: a link to choose a
 * new password, asked for on the sign-in page or sent by an admin from Equipo, and the notice that a password was
 * changed. The link carries its token in the fragment (setPasswordLink).
 */
export interface PasswordMail {
  /** A link to choose a new password; `by` names the admin who sent it from Equipo. */
  link: (message: {
    email: string;
    token: string;
    by?: { name: string } | undefined;
  }) => Promise<void>;
  /**
   * That the account's password was just changed through such a link; `enrolled`: whether the account has its second
   * factor (without, the owner's link set it, and whoever signs in next sets one up).
   */
  changed: (message: { email: string; enrolled?: boolean }) => Promise<void>;
}

export const createPasswordMail = ({
  mailer,
  staffOrigin,
  productName,
}: {
  mailer: Mailer;
  staffOrigin: string;
  productName: string;
}): PasswordMail => {
  const t = getTranslator();
  return {
    link: async ({ email, token, by }) => {
      const link = setPasswordLink(staffOrigin, token);
      const admin = by ? plainName(by.name) : '';
      await mailer.send({
        to: email,
        fromName: productName,
        subject: t('email.passwordReset.subject', { product: productName }),
        text: by
          ? t('email.passwordReset.bodyByAdmin', {
              admin: admin === '' ? t('email.passwordReset.someAdmin') : admin,
              product: productName,
              link,
            })
          : t('email.passwordReset.body', { product: productName, link }),
      });
    },
    changed: async ({ email, enrolled = true }) => {
      await mailer.send({
        to: email,
        fromName: productName,
        subject: t('email.passwordChanged.subject', { product: productName }),
        text: enrolled
          ? t('email.passwordChanged.body', {
              product: productName,
              forgot: `${staffOrigin}${FORGOT_PASSWORD_PATH}`,
            })
          : t('email.passwordChanged.bodyNoFactor', { product: productName }),
      });
    },
  };
};
