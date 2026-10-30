import { readFromApi } from '@/data';

import {
  parseAccounts,
  parseBalance,
  parseCounterparties,
  parseEntries,
  parseEntry,
  parseIncomeAndExpenses,
  parseJournal,
  parseLedger,
  parseProjectReport,
  parseProjects,
  parseYears,
} from './types';

/** The books' reads, from a page's server, each one route of apps/api/src/accounting/routes.ts. */

const query = (values: Readonly<Record<string, string | number | undefined>>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
};

export const getYears = () => readFromApi('/api/accounting/years', parseYears);
export const getAccounts = () => readFromApi('/api/accounting/accounts', parseAccounts);
export const getCounterparties = () =>
  readFromApi('/api/accounting/counterparties', parseCounterparties);
export const getProjects = () => readFromApi('/api/accounting/projects', parseProjects);

export interface EntryFilters {
  year?: number;
  status?: 'draft' | 'posted';
  account?: string;
  project?: string;
  q?: string;
}

export const getEntries = (filters: EntryFilters) =>
  readFromApi(`/api/accounting/entries${query({ ...filters })}`, parseEntries);

export const getEntry = (id: string) =>
  readFromApi(`/api/accounting/entries/${encodeURIComponent(id)}`, parseEntry);

export interface ReportQuery {
  year?: number;
  from?: string;
  to?: string;
  account?: string;
  project?: string;
}

/** A report's query string, for its page and its CSV alike. */
export const reportQuery = (values: ReportQuery): string => query({ ...values });

export const getJournal = (values: ReportQuery) =>
  readFromApi(`/api/accounting/reports/journal${reportQuery(values)}`, parseJournal);
export const getLedger = (values: ReportQuery) =>
  readFromApi(`/api/accounting/reports/ledger${reportQuery(values)}`, parseLedger);
export const getIncomeAndExpenses = (values: ReportQuery) =>
  readFromApi(
    `/api/accounting/reports/income-expenses${reportQuery(values)}`,
    parseIncomeAndExpenses,
  );
export const getBalance = (values: ReportQuery) =>
  readFromApi(`/api/accounting/reports/balance${reportQuery(values)}`, parseBalance);
export const getProjectReport = (values: ReportQuery) =>
  readFromApi(`/api/accounting/reports/project${reportQuery(values)}`, parseProjectReport);
