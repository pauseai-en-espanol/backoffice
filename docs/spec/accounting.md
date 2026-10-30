# Accounting

- **Status:** Drafted (2026-10-30) with [ADR-0006](../adr/0006-accounting.md); reviewed by Dani before M6 starts.
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
- **Contraparte (counterparty):** who money came from or went to: a name, optionally a tax ID and an IBAN. The
  module's own record, never linked to a person in onboarding (ADR-0006, decision 6).
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

Once the assembly approves the accounts, tesorería closes the year, entering the assembly's date. In one
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
| `counterparties`       | Name, tax ID, IBAN (all personal data), kind (person or organisation)                     |
| `projects`             | Name, funder (a counterparty), description, active                                        |
| `journal_entries`      | Year, number (when posted), date, description, kind (form), status, the entry it reverses |
|                        | (unique), counterparty, project, posted when and by whom                                  |
| `journal_lines`        | Entry, account, debit or credit in cents (one of them, more than zero), project           |
| `receipts`             | Entry, file name as uploaded (personal data), type, size, SHA-256; the bytes are on disk  |
| `bank_statement_lines` | Step 2: an imported statement's line, and the entry it was matched to                     |

## 6. Steps

1. **The books:** the chart, the bank account, the first year; Ingreso, Gasto, Traspaso, Asiento manual; receipts;
   posting and Corregir; projects; the reports and their exports; closing a year. Enough for the first money from
   Global.
2. **The bank:** import a statement (Norma 43, or the bank's CSV) with a dry run (R17), match each line to an entry
   or make one from it, and see what isn't matched yet; a budget per year, with what was spent against it.
3. **Later, when needed:** volunteers asking for a reimbursement with their receipt from the staff app, approved by
   tesorería; member fees if the assembly sets them; donation certificates and the modelo 182 if the association
   becomes of public utility.

## 7. Rules in the database

As ADR-0006, decision 4: posted entries balance, never change, are numbered without gaps and are reversed at most
once; nothing is written in a closed year; only tesorería writes; nothing is opened to the bot.
