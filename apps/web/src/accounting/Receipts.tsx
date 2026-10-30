'use client';

import { type FormEvent, useState } from 'react';

import { describedBy } from '@/auth/client';
import { ConfirmAction, type ConfirmText } from '@/ui/ConfirmAction';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import type { Receipt } from './types';

import { deleteReceipt, uploadReceipt } from './actions';

export interface ReceiptsText {
  title: string;
  none: string;
  download: string;
  remove: string;
  removeText: ConfirmText;
  attach: string;
  attachHint: string;
  attachButton: string;
  attached: string;
  chooseFile: string;
  tooLarge: string;
  errors: Readonly<Record<string, string>>;
}

/** 10 MB, as the API takes (ADR-0006 decision 7): refused here before a byte is sent. */
const MAX_BYTES = 10 * 1024 * 1024;

const sizeOf = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * An entry's receipts (ADR-0006 decision 7): each downloaded as a file (the API serves it only after RLS reads its
 * row); tesorería attaches more while the entry's year is open, and removes a draft's. A posted entry's stay with it.
 */
export const Receipts = ({
  entryId,
  receipts,
  canAttach,
  canRemove,
  text,
}: {
  entryId: string;
  receipts: readonly Receipt[];
  canAttach: boolean;
  canRemove: boolean;
  text: ReceiptsText;
}) => {
  const write = useWrite(text.errors);
  const [problem, setProblem] = useState<string>();

  const attach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('justificante');
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    const refused = !file ? text.chooseFile : file.size > MAX_BYTES ? text.tooLarge : undefined;
    setProblem(refused);
    if (!file || refused) {
      return;
    }
    const answer = await write.run(() => uploadReceipt(entryId, file), { done: text.attached });
    if (answer?.ok) {
      form.reset();
    }
  };

  const error = problem ?? write.error;
  return (
    <section aria-labelledby="justificantes">
      <h2 id="justificantes" className={ui.h2}>
        {text.title}
      </h2>
      {receipts.length === 0 ? (
        <p className={ui.text}>{text.none}</p>
      ) : (
        <ul className={ui.linkList}>
          {receipts.map((receipt) => (
            <li key={receipt.id}>
              <a
                className={ui.link}
                href={`/api/accounting/receipts/${encodeURIComponent(receipt.id)}`}
                download={receipt.fileName}
              >
                {text.download.replace('{name}', receipt.fileName)}
              </a>{' '}
              <span className={ui.muted}>({sizeOf(receipt.byteSize)})</span>
              {canRemove ? (
                <ConfirmAction
                  label={`${text.remove}: ${receipt.fileName}`}
                  short={text.remove}
                  text={text.removeText}
                  run={() => deleteReceipt(receipt.id)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canAttach ? (
        <form method="post" className={ui.form} onSubmit={attach} noValidate>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="justificante">
              {text.attach}
            </label>
            <input
              id="justificante"
              name="justificante"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              aria-describedby={describedBy('justificante-pista', error && 'justificante-error')}
            />
            <span id="justificante-pista" className={ui.hint}>
              {text.attachHint}
            </span>
          </div>
          <FormError id="justificante-error" message={error} />
          <div>
            <button type="submit" className={ui.secondaryButton} aria-disabled={write.pending}>
              {text.attachButton}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
};
