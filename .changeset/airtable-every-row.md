---
'@backoffice/api': minor
---

The Airtable sync imports every row of Global's view by default (PLAN R14, decided by Dani):
`AIRTABLE_REQUIRE_CHAPTER_PERMISSION=true` still limits it to the rows with the chapter-share permission ticked.
