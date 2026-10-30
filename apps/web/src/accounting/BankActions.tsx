'use client';

import { formatDay } from '@backoffice/domain/days';
import { formatEuros } from '@backoffice/domain/money';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { describedBy, formText } from '@/auth/client';
import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';
import { Disclosure } from '@/ui/Disclosure';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { BankLine } from './types';

import { deleteStatement, matchLine, unmatchLine } from './actions';

export interface BankLineText {
  matchWith: string;
  matchWithHint: string;
  record: string;
  recordLabel: string;
  unmatchLabel: string;
  byNumber: string;
  byNumberLabel: string;
  byNumberYear: string;
  byNumberButton: string;
  byNumberMissing: string;
  matched: string;
  unmatch: string;
  unmatchText: ConfirmText;
  errors: Readonly<Record<string, string>>;
}

const fill = (template: string, values: Readonly<Record<string, string | number>>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

/**
 * What tesorería does with a bank line (accounting spec §6a). One waiting for its entry: match it to a suggestion,
 * "Anotar" it (Nuevo movimiento with its day, amount and account, matched once posted), or match it to an entry by
 * its number. One matched: undo the match, which leaves the entry in the books. Nothing is matched on its own.
 */
export const BankLineActions = ({ line, text }: { line: BankLine; text: BankLineText }) => {
  const write = useWrite(text.errors);
  const [missing, setMissing] = useState(false);
  const id = `linea-${line.id}`;
  const which = { date: formatDay(line.bookedOn), amount: formatEuros(line.amountCents) };

  if (line.entry !== null && !line.entry.corrected) {
    return (
      <ConfirmAction
        label={fill(text.unmatchLabel, which)}
        short={text.unmatch}
        text={text.unmatchText}
        run={() => unmatchLine(line.id)}
      />
    );
  }

  const byNumber = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const number = Number(formText(event.currentTarget, 'number'));
    const year = Number(formText(event.currentTarget, 'year'));
    const valid = Number.isInteger(number) && number > 0 && Number.isInteger(year);
    setMissing(!valid);
    if (valid) {
      await write.run(() => matchLine(line.id, { year, number }), { done: text.matched });
    }
  };

  const error = missing ? text.byNumberMissing : write.error;
  return (
    <div className={ui.disclosure}>
      {line.suggestions.length > 0 ? (
        <ul className={ui.linkList}>
          {line.suggestions.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={ui.secondaryButton}
                aria-disabled={write.pending}
                aria-describedby={`${id}-${entry.id}`}
                onClick={() =>
                  void write.run(() => matchLine(line.id, { entryId: entry.id }), {
                    done: text.matched,
                  })
                }
              >
                {fill(text.matchWith, { number: entry.number ?? '—', year: entry.year })}
              </button>{' '}
              <span id={`${id}-${entry.id}`} className={ui.hint}>
                {fill(text.matchWithHint, {
                  date: formatDay(entry.date),
                  description: entry.description,
                })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Link
          className={ui.secondaryButton}
          href={`/cuentas/nuevo?extracto=${encodeURIComponent(line.id)}`}
          aria-label={fill(text.recordLabel, which)}
        >
          {text.record}
        </Link>
      </div>
      <Disclosure id={`${id}-otro`} label={text.byNumber}>
        <form method="post" className={ui.fieldRow} onSubmit={byNumber} noValidate>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-numero`}>
              {text.byNumberLabel}
            </label>
            <input
              id={`${id}-numero`}
              name="number"
              className={ui.input}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={missing}
              aria-describedby={describedBy(error && `${id}-error`)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`${id}-ejercicio`}>
              {text.byNumberYear}
            </label>
            <input
              id={`${id}-ejercicio`}
              name="year"
              className={ui.input}
              inputMode="numeric"
              defaultValue={line.bookedOn.slice(0, 4)}
            />
          </div>
          <div>
            <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
              {text.byNumberButton}
            </button>
          </div>
        </form>
      </Disclosure>
      <FormError id={`${id}-error`} message={error} />
    </div>
  );
};

/** Undoes an import whose lines are all still waiting: they go with it. */
export const UndoImport = ({
  statementId,
  label,
  short,
  text,
}: {
  statementId: string;
  label: string;
  short: string;
  text: ConfirmText;
}) => (
  <ConfirmAction label={label} short={short} text={text} run={() => deleteStatement(statementId)} />
);
