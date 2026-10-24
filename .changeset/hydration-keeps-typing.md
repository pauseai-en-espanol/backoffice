---
'@backoffice/domain': patch
'@backoffice/web': patch
'@backoffice/forms': patch
---

Pages that list countries hydrate again, and Añadir keeps what is typed before the page comes alive (PLAN R86, R87):
countries' names are the app's own, in Spanish order, not the platform's, which differ between Node and each browser
("RAE de Hong Kong (China)" and "Hong Kong"), so React no longer throws away and redraws Añadir or the census form,
emptying what had been typed; and a name, phone, email or Discord typed in Añadir before React has hydrated it is sent
with the person, not left out.
