# Rotating the bot's token or webhook secret

When: the bot's token or the webhook secret may have leaked (a screenshot, a pasted log, a lost laptop with the gitops
checkout unsealed), or someone who held them leaves. Who: Dani, or whoever runs gitops. Takes ten minutes.

The token lets whoever holds it act as the bot: read the updates sent to it and post as it. The webhook secret lets
whoever holds it send the webhook updates that look like Telegram's, though only from accounts linked to staff do they
do anything ([ADR-0004](../adr/0004-telegram-bot.md)). Neither is ever logged.

## Steps

1. **A new token**, if the token leaked: in Telegram, BotFather → `/mybots` → the bot → **API Token** → **Revoke
   current token**. The old token stops working at once, so the bot is deaf until step 4.
2. **Seal the new values:** delete the sealed file `backoffice-telegram.yaml` in the gitops checkout
   (`clusters/danilupion-com/resources/apps/backoffice/secrets/`), then run
   `scripts/seal-telegram-secret.sh ~/Workspace/gitops`. It asks for the token (input hidden), checks it with
   Telegram, and seals it with a new webhook secret: both rotate together.
3. **Deploy:** commit and push gitops. The API's pods restart with the new values and register the webhook with the
   new secret on start.
4. **Check:** in the API's log, `Telegram webhook registered` and `Telegram commands registered`; or run
   `kubectl exec -n backoffice deploy/backoffice-api -- node dist/telegram-webhook.js`, which prints `ok`. Then send
   `/help` (or `/ayuda`) to the bot: it answers.

## What doesn't change

- **Links between staff and their Telegram accounts** stay: they are kept by Telegram user id, not by token. Nobody
  links again.
- **Conversations in progress** are kept, and expire within the hour as usual.

## If the bot stays silent

- `failed: Telegram setWebhook failed (401)`: the token is wrong; seal it again.
- No `Telegram webhook registered` line and no failure: the bot isn't configured in the pods (the `telegram` values
  under `backoffice-api`).
- Registered, but nothing reaches the API: the web chart's `route.telegramWebhook` is off, or the gateway's rate
  limit for the webhook is too low.
