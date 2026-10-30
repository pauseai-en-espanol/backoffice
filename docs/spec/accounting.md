# Accounting

- **Status:** Approved (Dani, 2026-10-30) with [ADR-0006](../adr/0006-accounting.md).
  The chart and the reports want a gestoría's or a treasurer's look before the first year closes.
- **Relates to:** [BRIEF](../BRIEF.md) G7; [data model](data-model.md);
  [personal data §9a](personal-data.md#9a-accounting-records-m6)

The association's books: what came in, what went out, from which account, why, and the proof. Tesorería records;
admins read; the assembly approves the year's accounts from the reports.

## 1. Concepts

- **Ejercicio (fiscal year):** a calendar year (statutes, art. 30). `open` until tesorería closes it, after the
  assembly approves its accounts; closed for good.
- **Cuenta (account):** a line of the chart: its code (`5720001`), name, kind (asset, liability, equity, income,
  expense) and parent. Seeded from the PYMESFL chart's groups the association uses (1 fondo social, 57 tesorería,
  62 servicios exteriores, 65 ayudas and expenses reimbursed to volunteers, 72 cuotas, 74 subvenciones y
  donaciones); tesorería adds sub-accounts and retires lines, never deletes one used.
- **Cuenta de tesorería:** an asset account where money actually is: the bank account (with its IBAN, which is the
  association's, not personal data) and, if there is ever one, a cash box.
- **Asiento (entry):** a date, a description, lines that balance, and optionally a counterparty, a project and
  receipts. A `draft` until posted; then numbered within its year and never changed.
- **Contraparte (counterparty):** who money came from or went to: a name, optionally a tax ID, a province and an
  IBAN. The module's own record, never linked to a person in onboarding (ADR-0006, decision 6). A donor's tax ID and
  province are asked for when they give them, for the modelo 182 once the association is of public utility (D24).
- **Proyecto (project):** a label on an entry or line for money given for a purpose (Global's funding, a grant), so
  its use can be reported to whoever gave it.
- **Justificante (receipt):** a PDF or photo attached to an entry, stored encrypted on the API's volume
  (ADR-0006, decision 7).

## 2. Recording

Tesorería sees forms, not debits and credits:

| Form               | Asks for                                                                     | Writes                                                 |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Ingreso**        | date, amount, into which account, kind (income account), who, concept        | debit the treasury account, credit the income account  |
| **Gasto**          | date, amount, from which account, kind (expense account), who, concept       | debit the expense account, credit the treasury account |
| **Traspaso**       | date, amount, from and to (two treasury accounts), concept                   | debit one treasury account, credit the other           |
| **Asiento manual** | date, description, free lines (tesorería only, for what the forms don't fit) | its lines, which must balance                          |

- Each form takes an optional project and any number of receipts, and saves a draft or posts at once.
- The kinds offered are the chart's income or expense accounts, by their names ("Donaciones", "Servicios
  bancarios"), with the code beside them.
- A posted entry shows "Corregir": it makes the reversing entry and opens a new form with the original's values,
  so a mistake is fixed by two entries the journal can explain.
- The first year opens with an opening entry of zero (the association had no assets: statutes, art. 29).
- Dates and amounts are written the Spanish way (`30/10/2026`, `1.234,56 €`); `packages/domain` parses and
  formats them, as integer cents.

## 3. Closing a year

Once the assembly approves the accounts, tesorería closes the year, entering the assembly's date. Closing is one of
the riskiest actions (PLAN D23): it wants a second factor of the last 12 hours. In one
transaction the database posts the closing entry (income and expense accounts to the year's result, 129), opens
the next year if it isn't open yet with the balances carried forward, and marks the year closed. From then on
nothing dated in it can be written. A year can't be closed while it has drafts, or before 31 December.

## 4. Reports

From posted entries only, for any date range within a year, and by project:

- **Libro diario** (the journal): every entry by number.
- **Libro mayor** (the ledger): an account's movements and running balance.
- **Ingresos y gastos:** the year's income and expenses by kind; what a small association often shows the assembly.
- **Balance** and **cuenta de resultados:** the year's balance sheet and income statement, in the shape the
  small-entity plan uses, for the assembly to approve.
- **Por proyecto:** what came in for a project and what went to it, with receipts, for whoever funded it.

Each exports to CSV with formula-looking cells defused (R18), for tesorería and admins.

## 5. Tables (M6)

| Table                  | Holds                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `fiscal_years`         | Year, status, closed when and by whom, the assembly's date                                |
| `ledger_accounts`      | Code (unique), name, kind, parent, treasury flag, IBAN for a bank account, active         |
| `counterparties`       | Name, tax ID, province, IBAN (all personal data), kind (person or organisation)           |
| `projects`             | Name, funder (a counterparty), description, active                                        |
| `journal_entries`      | Year, number (when posted), date, description, kind (form), status, the entry it reverses |
|                        | (unique), counterparty, project, posted when and by whom                                  |
| `journal_lines`        | Entry, account, debit or credit in cents (one of them, more than zero), project           |
| `receipts`             | Entry, file name as uploaded (personal data), type, size, SHA-256; the bytes are on disk  |
| `bank_statements`      | Step 2: an imported statement: treasury account, period and balances, the file's SHA-256  |
| `bank_statement_lines` | Step 2: its lines (days, amount, the bank's text), and the entry each is matched to       |
| `budget_lines`         | Step 2: a year's budget, by income or expense account                                     |

## 6. Steps

1. **The books:** the chart, the bank account, the first year; Ingreso, Gasto, Traspaso, Asiento manual; receipts;
   posting and Corregir; projects; the reports and their exports; closing a year. Enough for the first money from
   Global.
2. **The bank:** import a statement (Norma 43, or the bank's CSV) with a dry run (R17), match each line to an entry
   or make one from it, and see what isn't matched yet; a budget per year, with what was spent against it.
   Built as Norma 43 alone (Dani, 2026-10-30: the bank's formats aren't known yet); a CSV import waits on knowing
   which one the bank gives. See §6a.
3. **Later, when needed:** volunteers asking for a reimbursement with their receipt from the staff app, approved by
   tesorería; member fees if the assembly sets them; donation certificates and the modelo 182 once the association
   is of public utility (D24), from the donations already recorded.

## 6a. The bank and the budget (step 2)

- **Banco** (`/cuentas/banco`, from Movimientos and an entry's page; not in the menu, PLAN R95): for each treasury
  account, the lines of its imported statements, those waiting for their entry first, and what the bank and the books
  say it held on the last statement's last day.
- **Importing:** tesorería picks the Norma 43 file the bank's website gives; the review is the import itself rolled
  back (R17): each account in the file, the treasury account with its IBAN, its period and balances, how many
  movements are new and how many came with an earlier statement. Every total in the file is checked, so a file cut
  short or edited is refused whole. A movement is imported once (its records and its place among equal ones,
  hashed), so overlapping statements bring only what is new; one dated in a closed year refuses the import. An
  import with nothing matched can be undone.
- **Matching:** a line is matched to a posted entry of a form, not corrected, that moves its account by its amount;
  the page suggests up to three, within 15 days, the nearest first, and tesorería confirms one, or writes an entry's
  number. "Anotar" opens Nuevo movimiento with the line's day, amount and account; posting it matches it. A match
  whose entry is corrected later stays, and the line waits for the right entry. Nothing is matched on its own.
- **Banco y libros:** the books' balance counts posted entries up to that day, from the year's opening entry (or,
  while the years before aren't closed, theirs too); entries of the account within the statements' periods with no
  line are listed, so a missing statement or an entry too many shows.
- **Presupuesto** (`/cuentas/presupuesto`, from Movimientos, Informes and each year in Ejercicios): a year's lines,
  each an income or expense account (a group such as 62, or one of its accounts, never both), against what was
  posted (the closing entry left out), with the accounts that moved and have no line. Set while the year is open;
  tesorería writes, admins read.

## 7. Rules in the database

As ADR-0006, decision 4: posted entries balance, never change, are numbered without gaps and are reversed at most
once; nothing is written in a closed year; only tesorería writes; nothing is opened to the bot. Step 2's, in
migrations `bank_statements` and `budgets`: a statement is of a treasury account and its lines of the same; a line
is imported once and never changes but for its match, which names a posted entry of a form, not corrected, that
moves the account by the line's amount, one line per entry and account; a matched line is never deleted; a budget
line is of an income or expense account, for more than zero, neither above nor below another of its year.
