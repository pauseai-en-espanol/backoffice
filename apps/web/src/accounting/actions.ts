'use client';

import { confirmPath, here } from '@/auth/confirm';
import { send, type WriteAnswer } from '@/write';

import type { AccountKind, FormKind } from './types';

/**
 * The books' writes from the browser, each one route of apps/api/src/accounting/routes.ts, on this same host, through
 * write.ts. Amounts and days go as typed: the API reads them the Spanish way (packages/domain).
 */

const at = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;
const ENTRIES = '/api/accounting/entries';
const ACCOUNTS = '/api/accounting/accounts';
const COUNTERPARTIES = '/api/accounting/counterparties';
const PROJECTS = '/api/accounting/projects';
const YEARS = '/api/accounting/years';

export interface LineInput {
  accountId: string;
  debit?: string;
  credit?: string;
}

export interface EntryInput {
  kind: FormKind;
  date: string;
  description: string;
  amount?: string;
  treasuryAccountId?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  lines?: LineInput[];
  counterpartyId: string | null;
  projectId: string | null;
  post: boolean;
  /** The bank line it records (Banco's "Anotar"), matched to it once posted. */
  bankLineId?: string;
}

export const createEntry = (input: EntryInput) => send('POST', ENTRIES, input);
export const updateEntry = (id: string, input: EntryInput) => send('PATCH', at(ENTRIES, id), input);
export const postEntry = (id: string) => send('POST', `${at(ENTRIES, id)}/post`);
export const reverseEntry = (id: string) => send('POST', `${at(ENTRIES, id)}/reverse`, {});
export const deleteEntry = (id: string) => send('DELETE', at(ENTRIES, id));

/** A file as its bytes, as the receipts' and the statements' routes take one; answered as `send` answers. */
const sendFile = async (
  path: string,
  file: File,
  headers: Readonly<Record<string, string>> = {},
): Promise<WriteAnswer> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream', ...headers },
      body: file,
    });
  } catch {
    return { ok: false, status: 0, error: 'network', body: {} };
  }
  const parsed: unknown = await response.json().catch(() => undefined);
  const body =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  if (body.error === 'stepUp') {
    window.location.assign(confirmPath(here()));
  }
  return {
    ok: response.ok,
    status: response.status,
    ...(typeof body.error === 'string' ? { error: body.error } : {}),
    body,
  };
};

/** A receipt's file, its name in `X-File-Name` (receipt-routes.ts). */
export const uploadReceipt = (entryId: string, file: File): Promise<WriteAnswer> =>
  sendFile(`${at(ENTRIES, entryId)}/receipts`, file, {
    'x-file-name': encodeURIComponent(file.name),
  });

export const deleteReceipt = (id: string) => send('DELETE', at('/api/accounting/receipts', id));

const STATEMENTS = '/api/accounting/bank/statements';
const BANK_LINES = '/api/accounting/bank/lines';
const BUDGET = '/api/accounting/budget';

/** A statement file (bank-routes.ts): its dry run, answered with what importing would do, or the import itself. */
export const reviewStatement = (file: File) => sendFile(STATEMENTS, file);
export const importStatement = (file: File) => sendFile(`${STATEMENTS}?apply=true`, file);
export const deleteStatement = (id: string) => send('DELETE', at(STATEMENTS, id));
export const matchLine = (
  lineId: string,
  target: { entryId: string } | { year: number; number: number },
) => send('PUT', `${at(BANK_LINES, lineId)}/match`, target);
export const unmatchLine = (lineId: string) => send('DELETE', `${at(BANK_LINES, lineId)}/match`);

export const addBudgetLine = (input: { year: number; accountId: string; amount: string }) =>
  send('POST', BUDGET, input);
export const changeBudgetLine = (id: string, amount: string) =>
  send('PATCH', at(BUDGET, id), { amount });
export const deleteBudgetLine = (id: string) => send('DELETE', at(BUDGET, id));

export const openYear = (year: number) => send('POST', YEARS, { year });
export const closeYear = (year: number, assemblyOn: string) =>
  send('POST', `${YEARS}/${year}/close`, { assemblyOn });

export interface AccountInput {
  code: string;
  name: string;
  parentCode: string | null;
  kind?: AccountKind;
  treasury: boolean;
  iban: string | null;
}

export const createAccount = (input: AccountInput) => send('POST', ACCOUNTS, input);
export const updateAccount = (
  id: string,
  change: { name?: string; treasury?: boolean; iban?: string | null; active?: boolean },
) => send('PATCH', at(ACCOUNTS, id), change);
export const deleteAccount = (id: string) => send('DELETE', at(ACCOUNTS, id));

export interface CounterpartyInput {
  kind: 'person' | 'organisation';
  name: string;
  taxId: string | null;
  province: string | null;
  iban: string | null;
}

export const createCounterparty = (input: CounterpartyInput) => send('POST', COUNTERPARTIES, input);
export const updateCounterparty = (id: string, input: CounterpartyInput) =>
  send('PATCH', at(COUNTERPARTIES, id), input);
export const deleteCounterparty = (id: string) => send('DELETE', at(COUNTERPARTIES, id));

export interface ProjectInput {
  name: string;
  funderId: string | null;
  description: string | null;
  active: boolean;
}

export const createProject = (input: ProjectInput) => send('POST', PROJECTS, input);
export const updateProject = (id: string, input: ProjectInput) =>
  send('PATCH', at(PROJECTS, id), input);
export const deleteProject = (id: string) => send('DELETE', at(PROJECTS, id));
