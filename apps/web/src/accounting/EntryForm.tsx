'use client';

import { formatEuros, parseEuros } from '@backoffice/domain/money';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { describedBy, formText } from '@/auth/client';
import * as onboarding from '@/onboarding/styles';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { createEntry, type EntryInput, type LineInput, updateEntry } from './actions';
import { QuickCounterparty, type QuickCounterpartyText } from './QuickCounterparty';
import * as styles from './styles';
import { createdId, FORM_KINDS, type FormKind } from './types';

export interface EntryFormText {
  kind: string;
  kinds: Readonly<Record<FormKind, string>>;
  otherKinds: string;
  date: string;
  amount: string;
  amountHint: string;
  treasury: string;
  incomeAccount: string;
  expenseAccount: string;
  from: string;
  to: string;
  counterparty: string;
  counterpartyHint: string;
  noCounterparty: string;
  project: string;
  noProject: string;
  choose: string;
  description: string;
  descriptionHint: string;
  lines: string;
  line: string;
  lineAccount: string;
  lineDebit: string;
  lineCredit: string;
  addLine: string;
  removeLine: string;
  balance: string;
  unbalancedHint: string;
  saveDraft: string;
  post: string;
  save: string;
  noTreasury: string;
  quickCounterparty: QuickCounterpartyText;
  errors: Readonly<Record<string, string>>;
}

/** An account a form may offer: active, without sub-accounts. */
export interface Choice {
  id: string;
  code: string;
  name: string;
}

export interface EntryChoices {
  treasury: readonly Choice[];
  income: readonly Choice[];
  expense: readonly Choice[];
  /** Every account that takes lines, for a manual entry. */
  all: readonly Choice[];
  counterparties: readonly { id: string; name: string }[];
  projects: readonly { id: string; name: string }[];
}

/** What a form starts with: a draft being edited, or the original's values after Corregir. */
export interface EntryStart {
  kind: FormKind;
  date: string;
  description: string;
  amount: string;
  treasuryAccountId: string;
  accountId: string;
  fromAccountId: string;
  toAccountId: string;
  lines: LineInput[];
  counterpartyId: string;
  projectId: string;
}

const blank = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/** A line as the form holds it: a key of its own, so removing one never moves what was typed into another. */
type LineState = LineInput & { key: string };

const withKey = (line: LineInput): LineState => ({ ...line, key: crypto.randomUUID() });

const AccountSelect = ({
  id,
  name,
  label,
  choices,
  defaultValue,
  choose,
  invalid,
  errorId,
}: {
  id: string;
  name: string;
  label: string;
  choices: readonly Choice[];
  defaultValue: string;
  choose: string;
  invalid: boolean;
  errorId: string | undefined;
}) => (
  <div className={ui.field}>
    <label className={ui.label} htmlFor={id}>
      {label}
    </label>
    <select
      id={id}
      name={name}
      className={onboarding.select}
      defaultValue={defaultValue}
      aria-invalid={invalid}
      aria-describedby={invalid ? errorId : undefined}
    >
      <option value="">{choose}</option>
      {choices.map((choice) => (
        <option key={choice.id} value={choice.id}>
          {choice.name} · {choice.code}
        </option>
      ))}
    </select>
  </div>
);

/**
 * Ingreso, Gasto, Traspaso or Asiento manual (accounting spec §2): tesorería sees forms, not debits and credits, but
 * for the manual entry, whose lines it writes itself, their sums said as they are typed. Saved as a draft or posted at
 * once; then the entry's page opens. A draft (`entryId`) is written again whole. One that records a bank line
 * (`bankLineId`, Banco's "Anotar") is posted, never kept as a draft, and matched to the line; then Banco opens again.
 */
export const EntryForm = ({
  text,
  choices,
  today,
  start,
  entryId,
  bankLineId,
  after,
}: {
  text: EntryFormText;
  choices: EntryChoices;
  today: string;
  start?: EntryStart;
  entryId?: string;
  bankLineId?: string;
  /** Where to go once saved, rather than the entry's page. */
  after?: string;
}) => {
  const router = useRouter();
  const write = useWrite(text.errors);
  const [kind, setKind] = useState<FormKind>(start?.kind ?? 'income');
  // Ingreso and Gasto first; Traspaso and Asiento manual a click away, or shown when the entry is one.
  const [others, setOthers] = useState(false);
  const [counterparties, setCounterparties] = useState(choices.counterparties);
  const [counterpartyId, setCounterpartyId] = useState(start?.counterpartyId ?? '');
  const [lines, setLines] = useState<LineState[]>(() =>
    (start?.lines.length ? start.lines : [{ accountId: '' }, { accountId: '' }]).map(withKey),
  );
  const [missing, setMissing] = useState<string>();

  const sums = lines.reduce(
    (total, line) => ({
      debit: total.debit + (parseEuros(line.debit ?? '') ?? 0),
      credit: total.credit + (parseEuros(line.credit ?? '') ?? 0),
    }),
    { debit: 0, credit: 0 },
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const read = (name: string) => formText(form, name);
    const input: EntryInput = {
      kind,
      date: read('date'),
      description: read('description'),
      counterpartyId: blank(read('counterpartyId')),
      projectId: blank(read('projectId')),
      post: bankLineId !== undefined || submitter?.getAttribute('value') === 'post',
      ...(bankLineId === undefined ? {} : { bankLineId }),
      ...(kind === 'manual'
        ? {
            lines: lines.map((line) => ({
              accountId: line.accountId,
              ...(blank(line.debit ?? '') === null ? {} : { debit: line.debit }),
              ...(blank(line.credit ?? '') === null ? {} : { credit: line.credit }),
            })),
          }
        : { amount: read('amount') }),
      ...(kind === 'income' || kind === 'expense'
        ? { treasuryAccountId: read('treasuryAccountId'), accountId: read('accountId') }
        : {}),
      ...(kind === 'transfer'
        ? { fromAccountId: read('fromAccountId'), toAccountId: read('toAccountId') }
        : {}),
    };
    const unfilled =
      input.date === ''
        ? 'date'
        : input.description.trim() === ''
          ? 'description'
          : kind !== 'manual' && parseEuros(input.amount ?? '') === undefined
            ? 'amount'
            : undefined;
    setMissing(unfilled);
    if (unfilled) {
      return;
    }
    const answer = await write.run(
      () => (entryId === undefined ? createEntry(input) : updateEntry(entryId, input)),
      { refresh: false },
    );
    const id = answer?.ok ? (entryId ?? createdId(answer.body)) : undefined;
    if (id !== undefined) {
      router.push(after ?? `/cuentas/${encodeURIComponent(id)}`);
      router.refresh();
    }
  };

  const refused = missing ?? write.refusal?.field;
  const error = missing ? text.errors[missing] : write.error;
  const errorId = error ? 'movimiento-error' : undefined;
  const invalid = (field: string) => refused === field;
  const needsTreasury = kind !== 'manual' && choices.treasury.length === 0;
  const showOthers = others || kind === 'transfer' || kind === 'manual';

  return (
    <form method="post" className={ui.form} onSubmit={submit} noValidate>
      <fieldset className={ui.fieldset}>
        <legend className={ui.label}>{text.kind}</legend>
        <div className={onboarding.choicesRow}>
          {FORM_KINDS.filter((each) => showOthers || each === 'income' || each === 'expense').map(
            (each) => (
              <label key={each} className={ui.checkbox}>
                <input
                  type="radio"
                  name="kind"
                  value={each}
                  checked={kind === each}
                  onChange={() => setKind(each)}
                />
                {text.kinds[each]}
              </label>
            ),
          )}
        </div>
        {kind === 'income' || kind === 'expense' ? (
          <div>
            <button
              type="button"
              className={ui.textButton}
              aria-expanded={others}
              onClick={() => setOthers(!others)}
            >
              {text.otherKinds}
            </button>
          </div>
        ) : null}
      </fieldset>
      {needsTreasury ? <p className={ui.notice}>{text.noTreasury}</p> : null}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="movimiento-fecha">
          {text.date}
        </label>
        <input
          id="movimiento-fecha"
          name="date"
          type="date"
          className={ui.input}
          max={today}
          defaultValue={start?.date ?? today}
          required
          aria-invalid={invalid('date')}
          aria-describedby={invalid('date') ? errorId : undefined}
        />
      </div>
      {kind === 'manual' ? null : (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="movimiento-importe">
            {text.amount}
          </label>
          <input
            id="movimiento-importe"
            name="amount"
            className={ui.input}
            inputMode="decimal"
            autoComplete="off"
            defaultValue={start?.amount ?? ''}
            required
            maxLength={40}
            aria-invalid={invalid('amount')}
            aria-describedby={describedBy('movimiento-importe-pista', invalid('amount') && errorId)}
          />
          <span id="movimiento-importe-pista" className={ui.hint}>
            {text.amountHint}
          </span>
        </div>
      )}
      {kind === 'income' || kind === 'expense' ? (
        <>
          <AccountSelect
            id="movimiento-tesoreria"
            name="treasuryAccountId"
            label={text.treasury}
            choices={choices.treasury}
            defaultValue={
              start?.treasuryAccountId ??
              (choices.treasury.length === 1 ? (choices.treasury[0]?.id ?? '') : '')
            }
            choose={text.choose}
            invalid={invalid('treasuryAccountId')}
            errorId={errorId}
          />
          <AccountSelect
            key={kind}
            id="movimiento-cuenta"
            name="accountId"
            label={kind === 'income' ? text.incomeAccount : text.expenseAccount}
            choices={kind === 'income' ? choices.income : choices.expense}
            defaultValue={start?.kind === kind ? start.accountId : ''}
            choose={text.choose}
            invalid={invalid('accountId')}
            errorId={errorId}
          />
        </>
      ) : null}
      {kind === 'transfer' ? (
        <>
          <AccountSelect
            id="movimiento-desde"
            name="fromAccountId"
            label={text.from}
            choices={choices.treasury}
            defaultValue={start?.fromAccountId ?? ''}
            choose={text.choose}
            invalid={invalid('fromAccountId')}
            errorId={errorId}
          />
          <AccountSelect
            id="movimiento-hacia"
            name="toAccountId"
            label={text.to}
            choices={choices.treasury}
            defaultValue={start?.toAccountId ?? ''}
            choose={text.choose}
            invalid={invalid('toAccountId')}
            errorId={errorId}
          />
        </>
      ) : null}
      {kind === 'manual' ? (
        <fieldset className={ui.fieldset}>
          <legend className={ui.label}>{text.lines}</legend>
          {lines.map((line, index) => {
            const number = String(index + 1);
            const id = `linea-${number}`;
            const change = (patch: Partial<LineInput>) =>
              setLines(lines.map((each) => (each.key === line.key ? { ...each, ...patch } : each)));
            return (
              <div
                key={line.key}
                className={styles.lineRow}
                role="group"
                aria-label={text.line.replace('{number}', number)}
              >
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`${id}-cuenta`}>
                    {text.lineAccount}
                  </label>
                  <select
                    id={`${id}-cuenta`}
                    className={onboarding.select}
                    value={line.accountId}
                    onChange={(event) => change({ accountId: event.target.value })}
                    aria-invalid={invalid('lines')}
                  >
                    <option value="">{text.choose}</option>
                    {choices.all.map((choice) => (
                      <option key={choice.id} value={choice.id}>
                        {choice.code} · {choice.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`${id}-debe`}>
                    {text.lineDebit}
                  </label>
                  <input
                    id={`${id}-debe`}
                    className={ui.input}
                    inputMode="decimal"
                    autoComplete="off"
                    value={line.debit ?? ''}
                    onChange={(event) => change({ debit: event.target.value })}
                    maxLength={40}
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`${id}-haber`}>
                    {text.lineCredit}
                  </label>
                  <input
                    id={`${id}-haber`}
                    className={ui.input}
                    inputMode="decimal"
                    autoComplete="off"
                    value={line.credit ?? ''}
                    onChange={(event) => change({ credit: event.target.value })}
                    maxLength={40}
                  />
                </div>
                {lines.length > 2 ? (
                  <button
                    type="button"
                    className={ui.textButton}
                    onClick={() => setLines(lines.filter((each) => each.key !== line.key))}
                  >
                    {text.removeLine.replace('{number}', number)}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <p className={styles.balance} aria-live="polite">
            {text.balance
              .replace('{debit}', formatEuros(sums.debit))
              .replace('{credit}', formatEuros(sums.credit))}
          </p>
          {sums.debit === sums.credit ? null : <p className={ui.hint}>{text.unbalancedHint}</p>}
          <div>
            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => setLines([...lines, withKey({ accountId: '' })])}
            >
              {text.addLine}
            </button>
          </div>
        </fieldset>
      ) : null}
      {kind === 'transfer' ? null : (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="movimiento-contraparte">
            {text.counterparty}
          </label>
          <select
            id="movimiento-contraparte"
            name="counterpartyId"
            className={onboarding.select}
            value={counterpartyId}
            onChange={(event) => setCounterpartyId(event.target.value)}
            aria-describedby="movimiento-contraparte-pista"
          >
            <option value="">{text.noCounterparty}</option>
            {counterparties.map((counterparty) => (
              <option key={counterparty.id} value={counterparty.id}>
                {counterparty.name}
              </option>
            ))}
          </select>
          <span id="movimiento-contraparte-pista" className={ui.hint}>
            {text.counterpartyHint}
          </span>
          <QuickCounterparty
            income={kind === 'income'}
            text={text.quickCounterparty}
            onAdded={(added) => {
              setCounterparties(
                [...counterparties, added].toSorted((a, b) => a.name.localeCompare(b.name, 'es')),
              );
              setCounterpartyId(added.id);
            }}
          />
        </div>
      )}
      {/* Only once there is a project to give: none, and the field would only be in the way. */}
      {choices.projects.length > 0 ? (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="movimiento-proyecto">
            {text.project}
          </label>
          <select
            id="movimiento-proyecto"
            name="projectId"
            className={onboarding.select}
            defaultValue={start?.projectId ?? ''}
          >
            <option value="">{text.noProject}</option>
            {choices.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="movimiento-concepto">
          {text.description}
        </label>
        <input
          id="movimiento-concepto"
          name="description"
          className={ui.input}
          defaultValue={start?.description ?? ''}
          required
          maxLength={500}
          aria-invalid={invalid('description')}
          aria-describedby={describedBy(
            'movimiento-concepto-pista',
            invalid('description') && errorId,
          )}
        />
        <span id="movimiento-concepto-pista" className={ui.hint}>
          {text.descriptionHint}
        </span>
      </div>
      <FormError id="movimiento-error" message={error} />
      <div className={ui.rowActions}>
        <button type="submit" value="post" className={ui.button} aria-disabled={write.pending}>
          {text.post}
        </button>
        {bankLineId === undefined ? (
          <button
            type="submit"
            value="draft"
            className={ui.secondaryButton}
            aria-disabled={write.pending}
          >
            {entryId === undefined ? text.saveDraft : text.save}
          </button>
        ) : null}
      </div>
    </form>
  );
};
