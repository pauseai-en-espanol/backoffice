'use client';

import { type FormEvent, useState } from 'react';

import { describedBy, formText } from '@/auth/client';
import * as onboarding from '@/onboarding/styles';
import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';
import { Disclosure } from '@/ui/Disclosure';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { addBudgetLine, changeBudgetLine, deleteBudgetLine } from './actions';

export interface AddBudgetText {
  title: string;
  account: string;
  accountHint: string;
  amount: string;
  amountHint: string;
  choose: string;
  add: string;
  added: string;
  errors: Readonly<Record<string, string>>;
}

/**
 * A line for a year's budget (accounting spec §6a): an income or expense account, a group of the chart or one of its
 * accounts, and its amount written the Spanish way. The database refuses one above or below another.
 */
export const AddBudgetLine = ({
  year,
  accounts,
  text,
}: {
  year: number;
  accounts: readonly { id: string; code: string; name: string }[];
  text: AddBudgetText;
}) => {
  const write = useWrite(text.errors);
  const [missing, setMissing] = useState<'accountId' | 'amount'>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const accountId = formText(form, 'accountId');
    const amount = formText(form, 'amount');
    const unfilled = accountId === '' ? 'accountId' : amount === '' ? 'amount' : undefined;
    setMissing(unfilled);
    if (unfilled) {
      return;
    }
    const answer = await write.run(() => addBudgetLine({ year, accountId, amount }), {
      done: text.added,
    });
    if (answer?.ok) {
      form.reset();
    }
  };

  const refused = missing ?? write.refusal?.field ?? (write.refusal ? 'accountId' : undefined);
  const error = missing ? text.errors[missing] : write.error;
  return (
    <Disclosure id="presupuesto-nueva" label={text.title}>
      <form method="post" className={ui.form} onSubmit={submit} noValidate>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="presupuesto-cuenta">
            {text.account}
          </label>
          <select
            id="presupuesto-cuenta"
            name="accountId"
            className={onboarding.select}
            defaultValue=""
            aria-invalid={refused === 'accountId'}
            aria-describedby={describedBy(
              'presupuesto-cuenta-pista',
              refused === 'accountId' && error && 'presupuesto-error',
            )}
          >
            <option value="">{text.choose}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
          <span id="presupuesto-cuenta-pista" className={ui.hint}>
            {text.accountHint}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="presupuesto-importe">
            {text.amount}
          </label>
          <input
            id="presupuesto-importe"
            name="amount"
            className={ui.input}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={refused === 'amount'}
            aria-describedby={describedBy(
              'presupuesto-importe-pista',
              refused === 'amount' && error && 'presupuesto-error',
            )}
          />
          <span id="presupuesto-importe-pista" className={ui.hint}>
            {text.amountHint}
          </span>
        </div>
        <FormError id="presupuesto-error" message={error} />
        <div>
          <button type="submit" className={ui.button} aria-disabled={write.pending}>
            {text.add}
          </button>
        </div>
      </form>
    </Disclosure>
  );
};

export interface BudgetLineText {
  label: string;
  save: string;
  saved: string;
  remove: string;
  removeLabel: string;
  removeText: ConfirmText;
  errors: Readonly<Record<string, string>>;
}

/** A budget line's amount, changed in place, or the line removed: while its year is open, by tesorería. */
export const BudgetLineForm = ({
  id,
  amount,
  text,
}: {
  id: string;
  /** As typed: `1234,56`. */
  amount: string;
  text: BudgetLineText;
}) => {
  const write = useWrite(text.errors);
  const field = `presupuesto-${id}`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await write.run(() => changeBudgetLine(id, formText(event.currentTarget, 'amount')), {
      done: text.saved,
    });
  };

  return (
    <div>
      <form method="post" className={ui.fieldRow} onSubmit={submit} noValidate>
        <div className={ui.field}>
          <label className={ui.srOnly} htmlFor={field}>
            {text.label}
          </label>
          <input
            id={field}
            name="amount"
            className={ui.input}
            inputMode="decimal"
            autoComplete="off"
            defaultValue={amount}
            aria-invalid={write.refusal !== undefined}
            aria-describedby={describedBy(write.error && `${field}-error`)}
          />
        </div>
        <div className={ui.rowActions}>
          <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
            {text.save}
            <span className={ui.srOnly}>: {text.label}</span>
          </button>
          <ConfirmAction
            label={text.removeLabel}
            short={text.remove}
            text={text.removeText}
            run={() => deleteBudgetLine(id)}
          />
        </div>
      </form>
      <FormError id={`${field}-error`} message={write.error} />
    </div>
  );
};
