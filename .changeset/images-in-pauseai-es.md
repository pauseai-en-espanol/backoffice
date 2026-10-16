---
'@backoffice/api': patch
'@backoffice/web': patch
'@backoffice/forms': patch
'@backoffice/migrations': patch
---

The images go to Harbor's `pauseai-es` project, with PauseAI España's other apps, as `pauseai-es/backoffice-api`,
`-web`, `-forms` and `-migrations`; the cluster pulls them with that project's robot, in the `pauseai-es-backoffice`
namespace.
