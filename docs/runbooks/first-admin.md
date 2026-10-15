# The first admin

Staff accounts are invite-only, and only an admin invites (ADR-0002 §6). The first admin, and a second one so access
never depends on one person (BRIEF, roles), are made by the owner, once, after the first deploy.

**Who acts:** Dani, with `kubectl` access to `danilupion-com`. **Takes:** ten minutes.

## Before

- The backoffice is deployed and its pods are Ready ([deploying](deploying.md)), with sign-in configured (the API's
  `auth` values) and mail (so later invitations go out).
- The person has an authenticator app (Aegis, 2FAS, Google Authenticator, 1Password…).

## Steps

1. **Create the account and its password link,** inside the API pod. Never with `kubectl run`, whose output the
   pod's log would keep; the command asks for the email and name, so neither appears in the command line:

   ```sh
   kubectl --context danilupion.com -n backoffice exec -it deploy/backoffice-api -- node dist/create-account.js
   ```

   It prints the account's id, a link that sets its password (once, within the hour), and the SQL of step 4.
   Keep the id; the link goes only to its person, through a channel you know is theirs.

2. **The person sets a password** at the link, then signs in at the staff host and enrols their authenticator. The
   app shows ten backup codes once: they keep them somewhere safe. Until step 4 they see "Tu cuenta no tiene
   acceso": they are an account, not staff.

3. **Check the enrolment** (as the owner, read-only), with the id from step 1:

   ```sql
   SELECT id, two_factor_enabled FROM auth.users WHERE id = '<id>';
   ```

   `two_factor_enabled` must be true.

4. **Make the account staff with the admin role,** as the database owner (`pauseai_backoffice_owner`; the
   connection string is in the sealed `backoffice-owner-db` secret, or connect through the postgresql pod as the
   superuser and `SET ROLE pauseai_backoffice_owner`):

   ```sql
   BEGIN;
   INSERT INTO app.staff (user_id, display_name)
     SELECT id, name FROM auth.users WHERE id = '<id>' AND two_factor_enabled;
   INSERT INTO app.staff_roles (user_id, role)
     SELECT user_id, 'admin' FROM app.staff WHERE user_id = '<id>';
   COMMIT;
   ```

   Each `INSERT` reports `INSERT 0 1`. `INSERT 0 0` means the account hasn't enrolled yet: roll back and go back to
   step 2. Both writes are in the audit log, with no actor and no channel: the owner's.

5. **The person signs in again** and sees Hoy and Equipo. From now on, every other account comes from an invitation:
   the admin invites the second admin from **Equipo**, with the admin role.

## After

- Never run step 4 again for anyone else: invitations do it, with an actor in the audit log.
- If the person can't finish enrolment within the hour, run step 1 again: for an account with no password yet it
  prints a new link.
