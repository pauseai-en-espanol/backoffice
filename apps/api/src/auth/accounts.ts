import { betterAuth } from 'better-auth';
import * as z from 'zod';

import { type AuthOptions, authOptions } from './auth.js';
import { HAS_FACTOR } from './reset-authenticator.js';

export interface AccountLink {
  userId: string;
  /** Whether the account was made now, or already existed. */
  created: boolean;
  /** Whether it replaces a password the account had: it had no second factor. */
  reset: boolean;
  /** Sets the account's password, once, within the hour (SET_PASSWORD_LINK_SECONDS). */
  link: string;
}

/** The staff app's page that asks for a link to choose a new password. */
export const FORGOT_PASSWORD_PATH = '/contrasena-olvidada';

/**
 * Where the staff app sets a password from a link. The token is in the fragment, which browsers never send: not to the
 * web app's server or the gateway (and so not to their logs or error reports), nor in a Referer. The page reads it and
 * takes it out of the address bar.
 */
export const setPasswordLink = (staffOrigin: string, token: string): string =>
  `${staffOrigin}/nueva-contrasena#token=${encodeURIComponent(token)}`;

/** Better Auth's own rule for an address (zod's), so an account it can never sign in is never made. */
const EMAIL = z.email();

/** What the owner's command needs to know of an existing account before it offers anything. */
export interface FoundAccount {
  userId: string;
  hasPassword: boolean;
  /** Whether it has its second factor: then its person resets their own password. */
  enrolled: boolean;
}

/** Better Auth on the owner's command's pool, whose reset link `onToken` receives instead of an email. */
const ownerAuth = (options: AuthOptions, onToken: (token: string) => void) => {
  const base = authOptions(options);
  return betterAuth({
    ...base,
    emailAndPassword: {
      ...base.emailAndPassword,
      enabled: true,
      // The link is handed to the owner rather than emailed.
      sendResetPassword: async (data) => {
        onToken(data.token);
      },
    },
  });
};

/**
 * The account with this address, as Better Auth stores it (trimmed, in lowercase), if any: whether it has a password,
 * and a second factor as the owner's reset of a lost authenticator counts one (`HAS_FACTOR`: enrolled, or a factor
 * stored all the same, even one being enrolled).
 */
export const findAccount = async (
  options: AuthOptions,
  email: string,
): Promise<FoundAccount | undefined> => {
  const { rows } = await options.pool.query<{ id: string; password: boolean; enrolled: boolean }>(
    `SELECT u.id,
            EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.provider_id = 'credential') AS password,
            ${HAS_FACTOR} AS enrolled
       FROM users u
      WHERE u.email = $1`,
    [email.trim().toLowerCase()],
  );
  const [row] = rows;
  return row ? { userId: row.id, hasPassword: row.password, enrolled: row.enrolled } : undefined;
};

/**
 * An account for someone the owner vouches for (PLAN R4, the first admin): its email marked verified, no password, no
 * TOTP, no role, and a single-use link to set its password, after which signing in leads to TOTP enrolment. For an
 * account that exists but never had a password (its link expired or was spent), only a new link. With `reset`, also
 * for one with a password and no second factor, whose person forgot it and has no other way back: the owner asks for
 * it only after checking who asks (docs/runbooks/lost-authenticator.md), since the link alone opens the account. An
 * account with its second factor is always refused: its person resets their own password ("He olvidado mi
 * contraseña"), and a new password still needs their code. It runs as pauseai_backoffice_auth, like Better Auth in the
 * API; making the account staff is the owner's SQL (docs/runbooks/first-admin.md), since staff rows are otherwise made
 * only by accepting an invitation.
 */
export const accountLink = async (
  options: AuthOptions,
  { email, name, reset = false }: { email: string; name: string; reset?: boolean },
): Promise<AccountLink> => {
  const address = email.trim().toLowerCase();
  if (!EMAIL.safeParse(address).success) {
    throw new Error('That is not an email address Better Auth accepts');
  }
  let token: string | undefined;
  const auth = ownerAuth(options, (made) => {
    token = made;
  });
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(address, {
    includeAccounts: true,
  });
  const hasPassword =
    existing?.accounts.some((account) => account.providerId === 'credential') === true;
  if (existing) {
    const factor = await options.pool.query<{ enrolled: boolean }>(
      `SELECT ${HAS_FACTOR} AS enrolled FROM users u WHERE u.id = $1`,
      [existing.user.id],
    );
    if (factor.rows[0]?.enrolled === true) {
      throw new Error(
        'An account with this email address already exists and has a second factor: its person chooses a new ' +
          'password with "He olvidado mi contraseña", or an admin sends a link from Equipo (a lost authenticator: ' +
          'docs/runbooks/lost-authenticator.md)',
      );
    }
    if (hasPassword && !reset) {
      throw new Error('An account with this email address already exists and has a password');
    }
  } else if (name.trim() === '') {
    throw new Error('A new account needs a name');
  }
  const user =
    existing?.user ??
    (await context.internalAdapter.createUser(
      { email: address, name: name.trim(), emailVerified: true },
      // The password comes later, through the link, as with email and password.
      { method: 'email-password' },
    ));
  if (existing) {
    // A new link replaces any earlier one, which may have gone astray, and any sign-in waiting for a code.
    await options.pool.query('DELETE FROM verifications WHERE value = $1', [user.id]);
  }
  if (hasPassword) {
    // A forgotten password: from the moment the link exists, the old password signs in no more (Better Auth
    // refuses an account with none; the link sets the new one) and every session it opened, where only enrolment is
    // open, has ended. So nobody who knew the old one can enrol an authenticator before the person uses the link.
    await options.pool.query(
      `UPDATE accounts SET password = NULL WHERE user_id = $1 AND provider_id = 'credential'`,
      [user.id],
    );
    await options.pool.query('DELETE FROM sessions WHERE user_id = $1', [user.id]);
  }
  try {
    await auth.api.requestPasswordReset({ body: { email: address } });
    if (token === undefined) {
      throw new Error('Better Auth made no link to set the password');
    }
  } catch (error) {
    // Never leave behind an account nobody can set a password for; if even that fails, a new run gives it a link.
    if (!existing) {
      try {
        await context.internalAdapter.deleteUser(user.id);
      } catch {
        const reason = error instanceof Error ? error.message : 'unknown error';
        throw new Error(
          `No link was made (${reason}), and the account ${user.id} was left: run the command again for a new link`,
        );
      }
    }
    throw error;
  }
  return {
    userId: user.id,
    created: !existing,
    reset: hasPassword,
    link: setPasswordLink(options.staffOrigin, token),
  };
};
