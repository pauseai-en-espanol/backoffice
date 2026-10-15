import { createAuthPool } from '@backoffice/db/auth-pool';
import { createInterface } from 'node:readline/promises';

import { accountLink, findAccount } from './auth/accounts.js';
import { loadConfig } from './config.js';

/**
 * The owner's command for an account without an invitation (PLAN R4; docs/runbooks/first-admin.md): the first admin,
 * before invitations exist. Run inside an API pod, which has sign-in's settings, and never with `kubectl run` (whose
 * output the pod's log would keep):
 *
 *   kubectl exec -it -n backoffice deploy/backoffice-api -- node dist/create-account.js
 *
 * It asks for the email address, and the name of a new account, so neither appears in the command line (nor in the
 * cluster's audit log of it). It prints a single-use link, valid for an hour, to set the password, and the SQL that
 * makes the account an admin, for the owner to run once its person has signed in and enrolled TOTP. For an account
 * that exists but never got a password, it prints a new link instead. For one with a password and no second factor,
 * whose person forgot it, it asks for the address again and a typed confirmation, after checking who asks
 * (docs/runbooks/lost-authenticator.md), then prints a link that sets a new one. Never for an account with its second
 * factor, whose person resets their own. Nothing it prints is logged, and it prints no personal data.
 */
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const { auth } = loadConfig(process.env);
const settings =
  auth ??
  fail(
    'Sign-in is not configured here (STAFF_ORIGIN, AUTH_DATABASE_URL, BETTER_AUTH_SECRET, PRODUCT_NAME)',
  );

// Questions go to standard error, so standard output holds only the result. Lines are read through the iterator,
// which keeps those that arrive together (piped input) instead of dropping all but the first.
const input = createInterface({ input: process.stdin });
const lines = input[Symbol.asyncIterator]();
const ask = async (question: string): Promise<string> => {
  process.stderr.write(question);
  const { value, done } = await lines.next();
  return done === true ? '' : String(value).trim();
};

const pool = createAuthPool({
  connectionString: settings.databaseUrl,
  maxConnections: 1,
  applicationName: 'backoffice-create-account',
});
const options = { ...settings, pool };

/** The link, and what to do with it. */
const printLink = (link: string) => {
  console.log('Its password is set at this link, once, within the hour:');
  console.log(`  ${link}`);
};

/** The owner's SQL that makes the account staff with the admin role, once it has enrolled TOTP. */
const printAdminSql = (userId: string) => {
  // The owner's SQL checks the order itself: it adds nothing until the account has enrolled TOTP.
  console.log(
    'Once its person has signed in and enrolled TOTP, this makes it an admin (as the database owner; each',
  );
  console.log('statement reports INSERT 0 1 when done, and INSERT 0 0 before enrolment):');
  console.log(
    `  INSERT INTO app.staff (user_id, display_name) SELECT id, name FROM auth.users WHERE id = '${userId}' AND two_factor_enabled;`,
  );
  console.log(
    `  INSERT INTO app.staff_roles (user_id, role) SELECT user_id, 'admin' FROM app.staff WHERE user_id = '${userId}';`,
  );
};

try {
  const email = await ask('Email address: ');
  if (email === '') {
    fail('No answer: run it with kubectl exec -it, so it can ask');
  }
  const found = await findAccount(options, email);
  if (found?.enrolled) {
    fail(
      `Account ${found.userId} has a second factor: its person chooses a new password with "He olvidado mi ` +
        'contraseña" on the sign-in page, or an admin sends a link from Equipo; a lost authenticator is ' +
        'docs/runbooks/lost-authenticator.md. Nothing was changed.',
    );
  } else if (!found || !found.hasPassword) {
    if (!found) {
      // A slip in a forgotten password's address lands here: say so before asking anything that makes an account.
      console.error('No account has this address: a new one is made, with this name.');
    }
    const name = found ? '' : await ask('Name (for a new account): ');
    const { userId, created, link } = await accountLink(options, { email, name });
    console.log(
      created ? `Account created: ${userId}` : `Account ${userId} has no password yet: a new link.`,
    );
    printLink(link);
    printAdminSql(userId);
  } else {
    // A forgotten password with no second factor: the link alone opens the account, with every role it has, so it goes
    // only to its person, after the owner has checked who asks and what the account holds.
    console.log(`Account ${found.userId} has a password and no second factor yet.`);
    console.log(
      'Before going on, run this as the owner, and confirm who asked (docs/runbooks/lost-authenticator.md):',
    );
    console.log(
      `  SELECT s.active, r.role::text FROM app.staff s LEFT JOIN app.staff_roles r USING (user_id) WHERE s.user_id = '${found.userId}';`,
    );
    console.error(
      'A link sets a new password, and whoever holds it gets the account and every role it has. Go on only once its\n' +
        'person has been confirmed, and give the link to them yourself, never through who asked.',
    );
    const again = await ask('The same address again: ');
    if (again.toLowerCase() !== email.toLowerCase()) {
      fail('The two addresses differ. Nothing was changed.');
    }
    const answer = await ask('Type "link" to make a link that sets a new password for it: ');
    if (answer !== 'link') {
      fail('Not confirmed. Nothing was changed.');
    }
    const { userId, link } = await accountLink(options, { email, name: '', reset: true });
    console.log(
      `Account ${userId}: a link for a new password. Its old password and sessions have ended, and any earlier link ` +
        'no longer works.',
    );
    printLink(link);
    console.log(
      'Give it to its person yourself, at a moment agreed with them, by a channel you know is theirs, never to the',
    );
    console.log(
      "account's email address. Setting the password emails the account a notice; at their next sign-in they enrol",
    );
    console.log('their authenticator.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'The account could not be created');
} finally {
  input.close();
  await pool.end();
}
