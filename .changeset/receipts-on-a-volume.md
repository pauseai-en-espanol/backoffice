---
'@backoffice/api': minor
'@backoffice/domain': minor
---

Receipts on the API's volume (ADR-0006 decision 7, M6 step 3): tesorería attaches a PDF or a photo to an entry, 10 MB
at most, recognised by its first bytes; it is stored encrypted with RECEIPTS_KEY, named by its id, before its row is
written; tesorería and admins download it, as an attachment, sandboxed. A posted entry's receipts stay with it; a
draft's go with their files. As the API starts, files without a row are set aside and those whose row came back are
put back. The chart's `receipts` values add the volume and the Recreate strategy; scripts/seal-receipts-key.sh seals
the key.
