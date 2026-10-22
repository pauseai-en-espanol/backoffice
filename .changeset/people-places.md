---
'@backoffice/migrations': patch
'@backoffice/domain': patch
'@backoffice/i18n': patch
'@backoffice/api': patch
'@backoffice/web': patch
'@backoffice/forms': patch
---

Where someone lives has a country, and where they're from can be said too ("De dónde es": a country and a province
or region), for Spain's community, Spaniards abroad, Latin America's and Latin Americans abroad (PLAN R74). In the
staff app a country is picked by typing part of its name, in Spanish or English, Spain first, then Latin America,
then the rest of the world; while it's Spain, Spain's provinces are offered the same way, by any of their names, and
anything else typed is kept. The census form asks the same with the phone's own picker, and its privacy summary lists
the new data. Cards say "Maite (Baviera, Alemania)", Personas filters by country, the Bandeja compares countries,
the CSV import reads "País", "País de origen" and "De dónde es", the Airtable sync reads Global's Country, and the
people export adds "pais". Someone living abroad isn't asked for a province. Everyone already in the backoffice whose
province is one of Spain's, or who came from Global's view, is set as living in Spain.
