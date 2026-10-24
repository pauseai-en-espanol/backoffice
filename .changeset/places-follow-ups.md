---
'@backoffice/migrations': patch
'@backoffice/domain': patch
'@backoffice/i18n': patch
'@backoffice/api': patch
'@backoffice/web': patch
'@backoffice/forms': patch
---

Where people live, everywhere it's shown (PLAN R81 to R84): the team group's post says "Dónde vive: Baviera, Alemania"
instead of "Provincia"; the bot's `/search` and `/left` find a phone by 6 or more of its digits, however written, as
Personas does; Latin America's and the United States' regions are offered as lists in the place pickers and suggested
in the census form ("cdmx", "Nueva York" find theirs); and the Panel's "Dónde viven" counts people by country, Spain,
Latin America and the rest of the world, each country leading to its people in Personas.
