import type { DB } from '@backoffice/db/generated/db';
import type { Transaction } from 'kysely';

import { formatDay } from '@backoffice/domain/days';
import { formatEurosPlain } from '@backoffice/domain/money';
import { getTranslator } from '@backoffice/i18n/messages';

import { csvText } from '../csv-export.js';
import {
  balanceSheet,
  byProject,
  incomeAndExpenses,
  journal,
  ledger,
  type Range,
  type ReportGroup,
} from './reports.js';

/**
 * The books' reports as CSV (ADR-0006 decision 9), for a gestoría or the assembly: days the Spanish way, amounts as a
 * spreadsheet set to Spanish reads a number (`1234,56`), every cell defused (PLAN R18).
 */

export const BOOK_REPORTS = ['journal', 'ledger', 'income-expenses', 'balance', 'project'] as const;
export type BookReport = (typeof BOOK_REPORTS)[number];

type Cell = string | number | null;

/** A report's groups as rows: each account under its group, with the section they're in. */
const groupRows = (section: string, groups: readonly ReportGroup[]): Cell[][] =>
  groups.flatMap((group) =>
    group.lines.map((line) => [
      section,
      group.code,
      group.name,
      line.code,
      line.name,
      formatEurosPlain(line.cents),
    ]),
  );

/**
 * One report's CSV, its file name and how many rows it has; undefined when what it needs isn't there (the ledger's
 * account, the project).
 */
export const reportCsv = async (
  trx: Transaction<DB>,
  report: BookReport,
  range: Range,
  options: { accountId: string | null; projectId: string | null; wholeProject: boolean },
): Promise<{ text: string; fileName: string; rows: number } | undefined> => {
  const t = getTranslator();
  const label = (
    key: 'income' | 'expenses' | 'result' | 'assets' | 'liabilities' | 'equity' | 'total',
  ) => t(`accounting.csv.${key}`);
  switch (report) {
    case 'journal': {
      const entries = await journal(trx, range, options.projectId);
      const rows = entries.flatMap((entry) =>
        entry.lines.map((line) => [
          entry.number,
          formatDay(entry.date),
          entry.description,
          entry.counterparty,
          line.code,
          line.name,
          line.debitCents ? formatEurosPlain(line.debitCents) : '',
          line.creditCents ? formatEurosPlain(line.creditCents) : '',
          line.project,
        ]),
      );
      return {
        text: csvText(
          [
            'asiento',
            'fecha',
            'concepto',
            'contraparte',
            'cuenta',
            'nombre_cuenta',
            'debe',
            'haber',
            'proyecto',
          ],
          rows,
        ),
        fileName: `diario-${range.year}.csv`,
        rows: rows.length,
      };
    }
    case 'ledger': {
      const found =
        options.accountId === null ? undefined : await ledger(trx, range, options.accountId);
      if (!found) {
        return undefined;
      }
      const { account } = found;
      const rows: Cell[][] = [
        [
          account.code,
          account.name,
          formatDay(range.from),
          '',
          t('accounting.csv.openingBalance'),
          '',
          '',
          formatEurosPlain(found.openingCents),
        ],
        ...found.movements.map((movement) => [
          movement.code,
          account.name,
          formatDay(movement.date),
          movement.number,
          movement.description,
          movement.debitCents ? formatEurosPlain(movement.debitCents) : '',
          movement.creditCents ? formatEurosPlain(movement.creditCents) : '',
          formatEurosPlain(movement.balanceCents),
        ]),
      ];
      return {
        text: csvText(
          ['cuenta', 'nombre_cuenta', 'fecha', 'asiento', 'concepto', 'debe', 'haber', 'saldo'],
          rows,
        ),
        fileName: `mayor-${account.code}-${range.year}.csv`,
        rows: rows.length,
      };
    }
    case 'income-expenses': {
      const found = await incomeAndExpenses(trx, range, options.projectId);
      const rows: Cell[][] = [
        ...groupRows(label('income'), found.income),
        ...groupRows(label('expenses'), found.expenses),
        [label('total'), '', '', '', label('income'), formatEurosPlain(found.totalIncomeCents)],
        [label('total'), '', '', '', label('expenses'), formatEurosPlain(found.totalExpensesCents)],
        [label('total'), '', '', '', label('result'), formatEurosPlain(found.resultCents)],
      ];
      return {
        text: csvText(
          ['seccion', 'grupo', 'nombre_grupo', 'cuenta', 'nombre_cuenta', 'importe'],
          rows,
        ),
        fileName: `ingresos-y-gastos-${range.year}.csv`,
        rows: rows.length,
      };
    }
    case 'balance': {
      const found = await balanceSheet(trx, range);
      const rows: Cell[][] = [
        ...groupRows(label('assets'), found.assets),
        ...groupRows(label('liabilities'), found.liabilities),
        ...groupRows(label('equity'), found.equity),
        [label('equity'), '', '', '', label('result'), formatEurosPlain(found.resultCents)],
        [label('total'), '', '', '', label('assets'), formatEurosPlain(found.totalAssetsCents)],
        [
          label('total'),
          '',
          '',
          '',
          `${label('liabilities')} + ${label('equity')}`,
          formatEurosPlain(found.totalLiabilitiesAndEquityCents),
        ],
      ];
      return {
        text: csvText(
          ['seccion', 'grupo', 'nombre_grupo', 'cuenta', 'nombre_cuenta', 'importe'],
          rows,
        ),
        fileName: `balance-${range.year}.csv`,
        rows: rows.length,
      };
    }
    case 'project': {
      const found =
        options.projectId === null
          ? undefined
          : await byProject(trx, options.projectId, options.wholeProject ? null : range.year);
      if (!found) {
        return undefined;
      }
      const rows: Cell[][] = found.movements.map((movement) => [
        formatDay(movement.date),
        movement.fiscalYear,
        movement.number,
        movement.description,
        movement.code,
        movement.name,
        movement.incomeCents ? formatEurosPlain(movement.incomeCents) : '',
        movement.expenseCents ? formatEurosPlain(movement.expenseCents) : '',
        movement.receipts.join('; '),
      ]);
      return {
        text: csvText(
          [
            'fecha',
            'ejercicio',
            'asiento',
            'concepto',
            'cuenta',
            'nombre_cuenta',
            'ingreso',
            'gasto',
            'justificantes',
          ],
          rows,
        ),
        fileName: options.wholeProject ? 'proyecto.csv' : `proyecto-${range.year}.csv`,
        rows: rows.length,
      };
    }
  }
};
