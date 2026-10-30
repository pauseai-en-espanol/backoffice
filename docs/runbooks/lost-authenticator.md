# A lost authenticator

A staff member lost the phone with their authenticator and their backup codes (with a backup code they sign in, and
enrol again themselves). Without the second factor, nobody, admins included, can get them in: the reset is the
owner's, and it starts with checking who is asking, because whoever gets the reset gets the account (ADR-0002 §6).

**Who acts:** Dani, with `kubectl` access to the cluster (`$KUBE_CONTEXT`, from the gitops checkout's
`backoffice-deploy.env`). **Takes:** fifteen minutes, plus the identity check.

## 1. Check who is asking

Do this before touching anything. Someone who has taken over the person's email or phone may be the one asking.

1. Talk to the person through a channel you already knew was theirs before this request (a call to a number you
   had, in person), never only through the channel the request came from.
2. Ask what they can only know: when and by whom they were invited, what they last did in the backoffice.
3. If anything is off, stop. Deactivate the account from **Equipo** (an admin can) and look at its recent entries in
   **Registro**.

## 2. Reset the factor

Inside the API pod (never `kubectl run`); it asks for the email, and confirms before changing anything:

```sh
kubectl --context "$KUBE_CONTEXT" -n pauseai-es-backoffice exec -it deploy/backoffice-api -- \
  node dist/reset-authenticator.js
```

It deletes the account's second factor and backup codes and its passkeys (the lost phone may hold one), and ends
every session it has, in one transaction; the database refuses any second-factor session, or passkey, for an account
without a factor from then on. The password stays. They can add passkeys again from Ajustes once enrolled.

## 3. The person enrols again

They sign in with their password and land on the enrolment page, as on their first day: a new key, a new QR code,
ten new backup codes. If they forgot the password too, an admin sends them a password link from **Equipo** once
they have enrolled; until then, run `node dist/create-account.js` as in the [first admin](first-admin.md) runbook,
which offers a new password link for an account with no second factor, after the same identity check.

## 4. Record it

Note in Vikunja (or wherever the team keeps its log) who asked, how you checked, and when you reset it. The reset
itself is in the API's log, without the address.
