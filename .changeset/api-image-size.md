---
'@backoffice/api': patch
'@backoffice/web': patch
'@backoffice/forms': patch
'@backoffice/migrations': patch
---

The API's image no longer carries Next.js, Playwright and Vitest, which better-auth's optional peers brought in from
the workspace: 892 MB to 435 MB (175 MB to 87 MB compressed), so each release uploads half as much. The other images
are rebuilt only because the shared lockfile changed; nothing in them changes.
