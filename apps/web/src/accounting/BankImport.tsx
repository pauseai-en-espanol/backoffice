'use client';

import { formatIban } from '@backoffice/domain/accounting';
import { formatDay } from '@backoffice/domain/days';
import { formatEuros } from '@backoffice/domain/money';
import { type FormEvent, useState } from 'react';

import { describedBy } from '@/auth/client';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { importStatement, reviewStatement } from './actions';
import * as styles from './styles';
import { parseStatementReview, type StatementReview } from './types';

export interface BankImportText {
  title: string;
  file: string;
  hint: string;
  review: string;
  reviewTitle: string;
  import: string;
  imported: string;
  chooseFile: string;
  tooLarge: string;
  statementOf: string;
  goesTo: string;
  unknownAccount: string;
  period: string;
  balances: string;
  counts: string;
  closedYearCount: string;
  nothingNew: string;
  previewLabel: string;
  date: string;
  concept: string;
  amount: string;
  /** Norma 43's common concepts, by code: what a line shows when the bank wrote no text. */
  concepts: Readonly<Record<string, string>>;
  /** A file refused, by the problem the API found (norma43.ts), with `{line}`. */
  norma43: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
}

/** 2 MB, as the API takes: refused here before a byte is sent. */
const MAX_BYTES = 2 * 1024 * 1024;

const fill = (template: string, values: Readonly<Record<string, string | number>>): string =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );

/**
 * Importing a statement (accounting spec §6a): tesorería picks the Norma 43 file, and "Revisar" sends it as a dry run,
 * the real import rolled back, which says for each account in it where it goes, its period and balances, and how many
 * movements are new; "Importar" sends the same file for real. Choosing another file starts over.
 */
export const BankImport = ({ text }: { text: BankImportText }) => {
  const write = useWrite(text.errors);
  const [file, setFile] = useState<File>();
  const [review, setReview] = useState<StatementReview>();
  const [problem, setProblem] = useState<string>();

  const refusedFile = (answer: { error?: string; body: Record<string, unknown> } | undefined) => {
    if (answer?.error !== 'norma43') {
      return undefined;
    }
    const template = text.norma43[String(answer.body.problem)] ?? text.errors.unexpected ?? '';
    return fill(template, { line: Number(answer.body.line ?? 1) });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const refused = !file ? text.chooseFile : file.size > MAX_BYTES ? text.tooLarge : undefined;
    setProblem(refused);
    if (!file || refused) {
      return;
    }
    setReview(undefined);
    const answer = await write.run(() => reviewStatement(file), { refresh: false });
    setProblem(refusedFile(answer));
    if (answer?.ok) {
      setReview(parseStatementReview(answer.body));
    }
  };

  const apply = async (form: HTMLFormElement | null) => {
    if (!file) {
      return;
    }
    const answer = await write.run(() => importStatement(file), { done: text.imported });
    setProblem(refusedFile(answer));
    if (answer?.ok) {
      setReview(undefined);
      setFile(undefined);
      form?.reset();
    }
  };

  const error = problem ?? write.error;
  const nothingNew = review?.statements.every((each) => each.new === 0) === true;
  return (
    <section aria-labelledby="importar-extracto">
      <h2 id="importar-extracto" className={ui.h2}>
        {text.title}
      </h2>
      <form method="post" className={ui.form} onSubmit={submit} noValidate>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="extracto">
            {text.file}
          </label>
          <input
            id="extracto"
            name="extracto"
            type="file"
            accept=".n43,.N43,.aeb,.AEB,.txt,.TXT,.dat,.DAT,text/plain"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0]);
              setReview(undefined);
              setProblem(undefined);
              write.clear();
            }}
            aria-describedby={describedBy('extracto-pista', error && 'extracto-error')}
          />
          <span id="extracto-pista" className={ui.hint}>
            {text.hint}
          </span>
        </div>
        <FormError id="extracto-error" message={error} />
        <div className={ui.rowActions}>
          <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
            {text.review}
          </button>
        </div>
        {review ? (
          <div aria-labelledby="extracto-revision">
            <h3 id="extracto-revision" className={ui.h3}>
              {text.reviewTitle}
            </h3>
            <ul className={ui.cardList}>
              {review.statements.map((each) => (
                <li key={`${each.iban}-${each.startsOn}`} className={ui.card}>
                  <p>
                    <strong>{fill(text.statementOf, { iban: formatIban(each.iban) })}</strong>
                  </p>
                  <p className={ui.text}>
                    {each.account
                      ? fill(text.goesTo, {
                          account: `${each.account.code} · ${each.account.name}`,
                        })
                      : text.unknownAccount}
                  </p>
                  <p className={ui.text}>
                    {fill(text.period, {
                      from: formatDay(each.startsOn),
                      to: formatDay(each.endsOn),
                    })}
                    {' · '}
                    {fill(text.balances, {
                      opening: formatEuros(each.openingCents),
                      closing: formatEuros(each.closingCents),
                    })}
                  </p>
                  <p className={ui.text}>
                    {fill(text.counts, { lines: each.lines, new: each.new, already: each.already })}
                  </p>
                  {each.closedYear > 0 ? (
                    <p className={ui.alert}>
                      {fill(text.closedYearCount, { count: each.closedYear })}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {nothingNew ? <p className={ui.notice}>{text.nothingNew}</p> : null}
            {review.preview.length > 0 ? (
              <div className={ui.tableWrap}>
                <table className={ui.table}>
                  <caption>{text.previewLabel}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{text.date}</th>
                      <th scope="col">{text.concept}</th>
                      <th scope="col" className={styles.amount}>
                        {text.amount}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.preview.map((line, index) => (
                      // The same movement twice is two lines: their place tells them apart.
                      // oxlint-disable-next-line react/no-array-index-key
                      <tr key={index}>
                        <td>{formatDay(line.bookedOn)}</td>
                        <td className={ui.breakAnywhere}>
                          {line.description || text.concepts[line.commonConcept] || line.reference}
                        </td>
                        <td className={styles.amount}>{formatEuros(line.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {review.canApply ? (
              <div className={ui.rowActions}>
                <button
                  type="button"
                  className={ui.button}
                  aria-disabled={write.pending}
                  onClick={(event) => void apply(event.currentTarget.form)}
                >
                  {text.import}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
};
