---
'@backoffice/i18n': patch
'@backoffice/web': patch
---

Hoy's "Me lo quedo" buttons are named "Me lo quedo: {name}" for screen readers, no longer "Me quedo a {name}": the
name holds the words shown (WCAG 2.5.3, Label in Name), which axe-core 4.14 checks.
