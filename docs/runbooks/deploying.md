# Deploying

How the backoffice first reaches the cluster, and what to do when a milestone turns something on. The design is
[ADR-0001](../adr/0001-hosting-and-delivery.md); this is the order of the work.

**Who acts:** Dani (the registry, GlitchTip, the mail server, BotFather and the pushes are his). **Nothing here is
done by CI**: CI builds and pushes images, and holds no cluster credentials.

**This repository is public**, so it names nothing of the cluster (CLAUDE.md). The sealing scripts take the path to a
gitops checkout and read the cluster's settings from `backoffice-deploy.env` at its root
(`scripts/lib/deploy-settings.sh`; `scripts/deploy-settings.example.env` lists them, with fictional values). Below,
`$GITOPS` is that checkout and `$KUBE_CONTEXT` the cluster's kubectl context (`scripts/watch-release.sh` reads it
from `.env`).

## What is ready

- **This repository:** the umbrella chart (`helm-charts/backoffice`), CI and the release workflow, and the sealing
  scripts. `main` is on GitHub (2026-10-16).
- **gitops:** the backoffice's entries, on a local branch, not pushed: the ApplicationSet, the project's repository
  and namespace, the default ServiceAccount (pulling with `pauseai-es-harbor-pull`), the `pauseai_backoffice`
  database with its owner and four extra roles; sealed for the `pauseai-es-backoffice` namespace, the five database
  passwords, their connection strings, Better Auth's secret and the census form's `backoffice-forms-token`; and the
  cluster's values: staff and forms hosts, network policies on, rate limits set, GlitchTip optional, mail commented
  out until sealed, the census settings and Censo's generic link. The privacy notice address is a TODO: until it is
  set, the form links its own draft.

## First deploy (M0)

Do these in order. Each step says how to check it.

1. **The GitHub repository.** `pauseai-en-espanol/backoffice` exists and is public (PLAN R8). Check that the
   organisation's self-hosted runner group lets this repository use it, set the repository variable
   `SELF_HOSTED_RUNS_ON` to the runner's labels as a JSON array (`ci.yml`), and require approval for workflows from
   all outside contributors (Settings → Actions), so no pull request's code reaches that runner unseen. Push `main`:
   CI runs, then the release workflow, which fails at "Build and push images" until step 2 is done; that is expected
   and harmless.
2. **The registry:** the images go in its `pauseai-es` project, with PauseAI España's other apps, as
   `pauseai-es/backoffice-api`, `-web`, `-forms` and `-migrations`.
   - The runner pushes as the robot its `DOCKER_REGISTRY` credentials belong to: check it may push to
     `pauseai-es`, or the release can't push.
   - Seal the `pauseai-es` pull robot's secret once more, for this namespace (a sealed secret opens only in the
     namespace it was sealed for): `scripts/seal-harbor-pull-secret.sh "$GITOPS"`, from a machine that reaches the
     registry. The registry and the robot come from the settings file; the script checks the secret with the
     registry first. Commit it in gitops.
   - Re-run the release workflow (`gh workflow run release.yml`): it builds the four images and commits their tags
     into `helm-charts/backoffice/values.yaml` ("Release: update image tags").
3. **GlitchTip projects** (optional for the first deploy): create `backoffice-api`, `backoffice-web` and
   `backoffice-forms`, then `scripts/seal-glitchtip-dsns.sh "$GITOPS"` (or name the apps to seal only some:
   `… "$GITOPS" forms`). The values already reference the three secrets as optional.
4. **Push gitops.** Argo CD then:
   - provisions the database and roles (the shared Postgres instance's provisioning hook);
   - creates the `pauseai-es-backoffice` namespace, the secrets (wave -2), runs the migration Job (wave -1), then
     the API, the web app and the session-cleanup CronJob. The ApplicationSet retries while the database doesn't
     exist yet.

   Check: `kubectl --context "$KUBE_CONTEXT" -n pauseai-es-backoffice get pods` shows `backoffice-api` and
   `backoffice-web` Ready; `https://<staff host>/healthz` answers 200 (allow a few minutes for its DNS record).
   `scripts/watch-release.sh` follows a release end to end.

5. **The first admin and the second:** [first admin](first-admin.md).
6. **Mail** (needed for invitations and password links): create the sending mailbox (`avisos@pauseai.es`) on the
   mail server, then `scripts/seal-mail-secret.sh "$GITOPS"` (it builds the SMTPS URL to the mail server as the pods
   reach it, with the name on its certificate, both from the settings file). Uncomment the `mail:` block in the
   values, check the mail server's pod labels match the values' `networkPolicy.mail`
   (`kubectl --context "$KUBE_CONTEXT" -n <its namespace> get pods --show-labels`), commit and push. Check: invite
   yourself a second account from **Equipo**; the email arrives.

## M1: the bot and the Airtable sync

1. **The bot:** create it with BotFather (BRIEF, this week), then run `scripts/seal-telegram-secret.sh "$GITOPS"`.
   It checks the token and prints the values to add (the API sets the command menu itself on start, by the Spanish
   names and, for English Telegram, the English ones): `telegram:` under `backoffice-api`, and
   `route.telegramWebhook: true` under `backoffice-web`. Set `route.trafficPolicy.rateLimit.telegramWebhook` to a
   ceiling well above the team's updates (Telegram delivers from a few addresses: 600 is generous). Turn on `digest`
   and `dialogCleanup` with it. Commit and push; the API registers the webhook on start. To post arrivals to the
   onboarding team's group (optional, D11), add the bot to the group, find the group's id (a negative number) and set
   `telegram.teamChatId`. Check: in the staff app, **Ajustes → Telegram → Conectar**; the bot answers "Listo";
   `/joined` (or `/alta`) with a fictional name and number saves it and deletes your message; Telegram's menu lists
   the commands. To register the webhook by hand (after a rotation, say), run this, which prints `ok` or Telegram's
   reason ([rotating the bot's token](rotating-the-bot-token.md)):

   ```sh
   kubectl --context "$KUBE_CONTEXT" exec -n pauseai-es-backoffice deploy/backoffice-api -- \
     node dist/telegram-webhook.js
   ```

2. **The Airtable sync**, once its spike says the shared view can be read without a browser (ADR-0005):
   `scripts/seal-airtable-link.sh "$GITOPS"` (input hidden; the link is a credential, never paste it anywhere else),
   then turn on `airtableSync` with `ingestDatabaseUrlSecret: { name: backoffice-ingest-db }` and
   `sharedViewUrlSecret: { name: backoffice-airtable }`, and add the API's GlitchTip secret to its `envFrom`.

## M2: the census form

The form is its own app (`apps/forms`) on its own host (the forms host), on the public gateway: no cookies, no
sessions, nothing third-party. Its server calls the API's `/public/census` routes inside the cluster, on the API's
forms port (3003, the only one the network policy lets the forms pods reach), with a shared secret; the browser never
reaches the API, and the host routes nothing to it (ADR-0002 §7).

1. **The release:** the first release after this lands builds `backoffice-forms` with the others and writes its tag
   into the umbrella's values; until then the umbrella refuses to render the forms Deployment ("image.tag is
   required"), so push gitops after it.
2. **The secret** (already sealed in gitops): `scripts/seal-forms-token.sh "$GITOPS"` makes a 48-character random
   `FORMS_TOKEN`, never printed, sealed as `backoffice-forms-token` (key `token`), which both
   `backoffice-api.formsTokenSecret` and `backoffice-forms.formsTokenSecret` name. The API also takes
   `publicDatabaseUrlSecret: { name: backoffice-public-db }`, sealed with the other roles in M0. The two settings go
   together: with one, the chart refuses to render.
3. **The host:** the forms host needs a DNS record on the public gateway. Another host means changing
   `backoffice-forms.route.hostnames` and `backoffice-api.census.formsOrigin` together (personal links point at the
   latter).
4. **The privacy notice: review before sharing the form widely.** Until `backoffice-forms.privacyNoticeUrl` is set (an
   https address), the form links its own notice at `/privacidad`, marked _Borrador pendiente de revisión_: the
   controller (Asociación Pausemos La IA), GDPR art. 9.2.d with the LOPDGDD, no recipients outside the association, how
   long data is kept (D9: until erased, so this needs the association's wording), rights and the AEPD. Have the
   association read it, then either set `contactEmail` (the address it shows for privacy questions) and keep it, or
   publish the association's own and set its address. When the wording changes, raise `wordingVersion` under both
   `backoffice-api.census` and `backoffice-forms`: each consent is recorded with it.
5. **Push gitops.** Check: `https://<forms host>/healthz` answers 200; the form loads its lists (**Censo** in the
   staff app sets them); an answer with fictional data shows "Hemos recibido tus respuestas." and appears in **Censo**;
   a personal link made from a person's page opens with their name and updates their record. The gateway's ceilings (10
   answers, 60 form loads a minute per address) sit above the API's own limit (5 answers per address every 10 minutes).

## Rotating

- **Database passwords or Better Auth's secret:** delete the sealed files and run `scripts/seal-gitops-secrets.sh`
  again; the Postgres provisioning hook re-applies the passwords. Rotating Better Auth's secret signs everyone out and
  breaks every enrolled authenticator: everyone enrols again ([lost authenticator](lost-authenticator.md), for all).
- **The registry pull secret:** `scripts/seal-harbor-pull-secret.sh` replaces it.
- **The census form's secret:** delete `backoffice-forms-token.yaml`, run `scripts/seal-forms-token.sh` again and
  push; then restart the API and the form together, since each refuses the other's calls until both have it.
- **The bot's token, the Airtable link, mail:** delete the sealed file and run its script again. When Global changes
  the shared view's link, that is all: no code changes.
