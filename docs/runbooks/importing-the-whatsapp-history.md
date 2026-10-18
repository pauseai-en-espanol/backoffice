# Importing the WhatsApp group's history

The group's export says who joined and who left, and on which day, from the day the exporting phone was added. A
command on the laptop turns it into a CSV for Importar, with the numbers from the exporter's Google Contacts: a row
per stay in the group (PLAN R56). People who left come in too, as Baja (D16).

**Who acts:** an admin of the backoffice who is an admin of the group, on their own laptop. **Takes:** half an
hour, most of it resolving names.

## 1. The two files

1. **The chat**, from an admin's phone: only admins see who left. On Android, the group, ⋮, More, Export chat,
   Without media; on an iPhone, the group's info, Export chat, Without media (unzip it). The history starts the day
   that phone was added to the group.
   - With "Advanced chat privacy" on, nobody can export. An admin turns it off in the group's info, exports, and
     turns it back on; the group sees a message each time, so tell them why first.
2. **The contacts:** contacts.google.com, Export, Google CSV. The export names saved contacts without their number;
   this file has them.

Keep both outside the repository, in Downloads for instance, and never paste them into a chat, an issue or an LLM
(D10): they are members' personal data.

## 2. Converting

In your own terminal, from the repository (not through an assistant, which would read the output):

```sh
pnpm whatsapp:csv --chat ~/Downloads/"WhatsApp Chat with <group>.txt" --contacts ~/Downloads/contacts.csv
```

It writes two files next to the export (or in `--out <folder>`), and prints counts only, never a name or a number:

- `importar-whatsapp.csv`: a row per stay, for Importar.
- `whatsapp-por-resolver.csv`: whoever it found no number or email for.

It refuses to read or write inside the repository. Check two lines of what it prints:

- **The dates:** "month first" or "day first", from the dates themselves. When every date could be either, it asks
  for `--dates dmy` (day first) or `--dates mdy`.
- **"System lines not recognised":** a few are normal (community notices, settings). Dozens mean a wording for joins
  or leaves it doesn't know yet: ask whoever maintains the backoffice, describing the line's words, not its names.

How it reads the export:

- A join ("joined using a group link.", "added", "se unió", "añadió a") opens a stay; a leave ("left", "removed",
  "salió", "eliminó a") closes it. Someone who left last is Baja; everyone else is Nuevo.
- Someone who wrote, or changed their number, without a join line was in since before the history: their "Entrada al
  grupo" and "Fecha de alta" are empty ("No se sabe").
- The name is the contact's, without what is in brackets ("[Madrid]", "(PauseAI ES)") or emoji; what is in square
  brackets is the province. A number nobody saved comes in without a name ("Sin nombre"), known by its number.
- Lines about you ("added you") are left out: you are in the backoffice already.
- Members who were in before the history and neither wrote nor left aren't in it. Compare the group's member count
  with "still in the group".

## 3. Resolving by hand

Open `whatsapp-por-resolver.csv`. Each row says why:

- **"No está en tus contactos con ese nombre":** the phone shows a name Google doesn't have (saved on the phone only,
  or named differently). Save it in Google Contacts as the phone shows it.
- **"Varios contactos se llaman así":** two contacts share the name. Rename one, on the phone and in Google alike.
- **"Su contacto no tiene teléfono ni correo":** add one to the contact.
- **"Cambió de número":** already in Importar's file, with the number the contact has: check it is the new one.

Export the contacts again and convert again: it is safe to repeat, and so is importing (step 4).

## 4. Importing

In **Importar**, "Importar un CSV", pick `importar-whatsapp.csv`. Its columns map by themselves (Nombre, Teléfono,
Correo, Provincia, Fecha de alta, Canal de alta, Entrada al grupo, Salida del grupo, Estado). The dry run shows the
first rows and what applying would do; then apply.

- **Someone already in the backoffice** (Global's form, the bot) is found by phone or email: their stays are added,
  and nothing they have is overwritten (a different name or province waits in the Bandeja). Their stage stays; if
  the history says they left, they show "Ha salido de la comunidad".
- **Someone new** comes in as Nuevo or Baja, "Canal de alta" WhatsApp, "Fecha de alta" their first join. The team
  group hears only of arrivals of the last week, and "Sin asignar" counts only the last 30 days, so neither fills up.
- **Again, later:** a stay already in the backoffice is never added twice, a newer export closes the stays that
  ended since, and an older one never reopens them.

Then move to Activo, by hand, the people you know are.

## 5. Afterwards

Delete the export, the contacts and the two CSVs from the laptop, and empty the bin. The backoffice keeps who was in
the group, between which days, and how to reach them; nothing of the chat's messages.
