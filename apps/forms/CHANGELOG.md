# @backoffice/forms

## 0.1.8

### Patch Changes

- Updated dependencies [01e38c3]
- Updated dependencies [d00c2c0]
- Updated dependencies [a5a8778]
  - @backoffice/domain@0.3.0
  - @backoffice/i18n@0.6.0

## 0.1.7

### Patch Changes

- c101fca: The API's image no longer carries Next.js, Playwright and Vitest, which better-auth's optional peers brought in from
  the workspace: 892 MB to 435 MB (175 MB to 87 MB compressed), so each release uploads half as much. The other images
  are rebuilt only because the shared lockfile changed; nothing in them changes.

## 0.1.6

### Patch Changes

- Updated dependencies [fb626ac]
  - @backoffice/i18n@0.5.0

## 0.1.5

### Patch Changes

- Updated dependencies [e24160b]
  - @backoffice/domain@0.2.0
  - @backoffice/i18n@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies [b7ef3dc]
- Updated dependencies [27cd280]
  - @backoffice/i18n@0.3.0

## 0.1.3

### Patch Changes

- a363d6a: The tab icon is the chapter's mark (PauseAI en Español, with its ñ tilde), copied unchanged from the brand's logos,
  instead of a stand-in.
- cce1869: The app and the bot say "onboarding" where they said "acogida" (the role, the digest, the settings, the WhatsApp
  message, the census form's thanks and its draft privacy notice), and the board by stage is the "Onboarding Pipeline",
  at `/pipeline` instead of `/embudo` (D14).
- Updated dependencies [013c8a1]
- Updated dependencies [cce1869]
  - @backoffice/i18n@0.2.0

## 0.1.2

### Patch Changes

- 1ebe0b8: The repository is public, so it names nothing of the infrastructure: the charts' examples are fictional, and the
  deploy scripts read the cluster's settings from the gitops checkout. No change in behaviour.

## 0.1.1

### Patch Changes

- 888111c: The images go to the registry's `pauseai-es` project, with PauseAI España's other apps, as `pauseai-es/backoffice-api`,
  `-web`, `-forms` and `-migrations`; the cluster pulls them with that project's robot, in the `pauseai-es-backoffice`
  namespace.

## 0.1.0

### Minor Changes

- a3e2c8f: M2 census form: the public form on its own host (generic and personal links, the token only in the address's
  fragment), which reaches the API's census routes only from its server, with the shared secret; no cookies, no
  sessions, nothing third-party; a draft privacy notice until the association publishes its own. The API chart takes
  the census settings (the public role, the shared secret, the form's origin) and lets the form's pods in.

### Patch Changes

- 88b04bb: The forms app's routes are served on a port of their own (`FORMS_PORT`, 3003), the only one the forms app's pods
  are admitted to: a forms pod taken over reaches neither sign-in nor the staff routes. The charts expose and use it,
  and the network policy check keeps it so.
- a4b91d0: The draft privacy notice no longer promises erasure after 12 months: D9 decided no automatic erasure, so data stays
  until the person asks for it to be erased.
- d978ed8: With network policies on, the web and forms pods may connect only to the API (each on the port it calls), DNS and
  error tracking (`networkPolicy.errorTracking`), and the API's forms port moves to 3003, clear of the forms app's own
  3002 in development.
- Updated dependencies [5879bda]
- Updated dependencies [6c25821]
- Updated dependencies [9b8add8]
- Updated dependencies [613d8ea]
- Updated dependencies [a3e2c8f]
- Updated dependencies [1c5bd11]
- Updated dependencies [a4b91d0]
- Updated dependencies [8b141b4]
- Updated dependencies [e38e0f2]
- Updated dependencies [e38e0f2]
- Updated dependencies [e38e0f2]
- Updated dependencies [f4a9480]
- Updated dependencies [5cf2102]
- Updated dependencies [970da1b]
- Updated dependencies [7bbad20]
- Updated dependencies [54b233e]
  - @backoffice/domain@0.1.0
  - @backoffice/i18n@0.1.0
  - @backoffice/observability@0.1.0
