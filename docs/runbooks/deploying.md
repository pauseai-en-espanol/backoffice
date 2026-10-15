# Deploying

How the backoffice first reaches `danilupion-com`, and what to do when a milestone turns something on. The design is
[ADR-0001](../adr/0001-hosting-and-delivery.md); this is the order of the work.

**Who acts:** Dani (Harbor, GlitchTip, Mailu, BotFather and the pushes are his). **Nothing here is done by CI**: CI
builds and pushes images, and holds no cluster credentials.

## What is ready

- **This repository:** the umbrella chart (`helm-charts/backoffice`), CI and the release workflow, and the sealing
  scripts. Nothing has been pushed.
- **gitops:** a local branch `backoffice`, not pushed, with two commits:
  1. _Onboard backoffice on danilupion-com_: the ApplicationSet, the `apps` project's repository and namespace, the
     default ServiceAccount (pulling with `backoffice-harbor-pull`), the `pauseai_backoffice` database with its owner
     and four extra roles, and, sealed by `scripts/seal-gitops-secrets.sh`, the five database passwords, their
     connection strings and Better Auth's secret.
  2. _Deploy backoffice on danilupion-com_: `clusters/danilupion-com/values/apps/backoffice.yaml`, which makes the
     Application appear. Staff host `backoffice.pauseai.es`, network policies on, rate limits set, GlitchTip
     optional, mail commented out until sealed.

## First deploy (M0)

Do these in order. Each step says how to check it.

1. **The GitHub repository.** `pauseai-en-espanol/backoffice` exists. Decide public or private (PLAN R8), then check
   that the organisation's runner group lets this repository use the juggernaut runner (it is organisation-wide for
   aiontheballot). Push `main`: CI runs, then the release workflow, which fails at "Build and push images" until
   step 2 is done; that is expected and harmless.
2. **Harbor project and robots** (on the tailnet, Harbor's UI):
   - Create the project `backoffice`, private.
   - The runner pushes as the robot that `DOCKER_REGISTRY` credentials on juggernaut belong to (as for
     aiontheballot): give it push rights on `backoffice` too, or the release can't push.
   - Create a pull-only robot `backoffice-pull` (Harbor names it `robot$backoffice+backoffice-pull`).
   - Seal its secret: `scripts/seal-harbor-pull-secret.sh ~/Workspace/gitops` (it checks the secret with Harbor
     first). Commit it on the `backoffice` branch.
   - Re-run the release workflow (`gh workflow run release.yml`): it builds the three images and commits their tags
     into `helm-charts/backoffice/values.yaml` ("Release: update image tags").
3. **GlitchTip projects** (optional for the first deploy): create `backoffice-api` and `backoffice-web`, then
   `scripts/seal-glitchtip-dsns.sh ~/Workspace/gitops`. The values already reference both secrets as optional.
4. **Push gitops** (`git push origin backoffice:main` after rebasing it on `main`, or merge it your usual way). Argo
   CD then:
   - provisions the database and roles (the postgresql Application's hook);
   - creates the `backoffice` namespace, the secrets (wave -2), runs the migration Job (wave -1), then the API, the
     web app and the session-cleanup CronJob. The ApplicationSet retries while the database doesn't exist yet.

   Check: `kubectl --context danilupion.com -n backoffice get pods` shows `backoffice-api` and `backoffice-web`
   Ready; `https://backoffice.pauseai.es/healthz` answers 200 (external-dns publishes the record under the
   `*.pauseai.es` wildcard; allow a few minutes). `scripts/watch-release.sh` follows a release end to end.

5. **The first admin and the second:** [first admin](first-admin.md).
6. **Mail** (needed for invitations and password links): create the `avisos@pauseai.es` mailbox in Mailu's admin,
   then `scripts/seal-mail-secret.sh ~/Workspace/gitops` (it builds the SMTPS URL to Mailu's in-cluster front, with
   the certificate's name). Uncomment the `mail:` block in the values, check the Mailu front's pod labels match the
   values' `networkPolicy.mail` (`kubectl -n mailu get pods -l app.kubernetes.io/component=front --show-labels`),
   commit and push. Check: invite yourself a second account from **Equipo**; the email arrives.

## M1: the bot and the Airtable sync

1. **The bot:** create it with BotFather (BRIEF, this week), then run
   `scripts/seal-telegram-secret.sh ~/Workspace/gitops`. It checks the token, sets the command list and prints the
   values to add: `telegram:` under `backoffice-api`, and `route.telegramWebhook: true` under `backoffice-web`. Set
   `route.trafficPolicy.rateLimit.telegramWebhook` to a ceiling well above the team's updates (Telegram delivers
   from a few addresses: 600 is generous). Turn on `digest` and `dialogCleanup` with it. Commit and push; the API
   registers the webhook on start. To post arrivals to the onboarding team's group (optional, D11), add the bot to
   the group, find the group's id (a negative number) and set `telegram.teamChatId`. Check: in the staff app,
   **Ajustes → Telegram → Conectar**; the bot answers "Listo"; `/alta` with a fictional name and number saves it and
   deletes your message. To register the webhook by hand (after a rotation, say):
   `kubectl exec -n backoffice deploy/backoffice-api -- node dist/telegram-webhook.js`, which prints `ok` or
   Telegram's reason ([rotating the bot's token](rotating-the-bot-token.md)).
2. **The Airtable sync**, once its spike says the shared view can be read without a browser (ADR-0005):
   `scripts/seal-airtable-link.sh ~/Workspace/gitops` (input hidden; the link is a credential, never paste it
   anywhere else), then turn on `airtableSync` with `ingestDatabaseUrlSecret: { name: backoffice-ingest-db }` and
   `sharedViewUrlSecret: { name: backoffice-airtable }`, and add the API's GlitchTip secret to its `envFrom`.

## Rotating

- **Database passwords or Better Auth's secret:** delete the sealed files and run `scripts/seal-gitops-secrets.sh`
  again; the postgresql hook re-applies the passwords. Rotating Better Auth's secret signs everyone out and breaks
  every enrolled authenticator: everyone enrols again ([lost authenticator](lost-authenticator.md), for all).
- **Harbor pull secret:** `scripts/seal-harbor-pull-secret.sh` replaces it.
- **The bot's token, the Airtable link, mail:** delete the sealed file and run its script again. When Global changes
  the shared view's link, that is all: no code changes.
