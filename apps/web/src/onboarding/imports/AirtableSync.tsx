'use client';

import { useState } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { useWrite } from '@/ui/useWrite';

import { syncAirtable } from '../actions';
import { countsOf } from '../types';
import { Counts } from './Counts';

export interface AirtableSyncText {
  sync: string;
  synced: string;
  running: string;
  failed: string;
  /** The API's reasons for an unreadable view (`502 airtable { reason }`), in words. */
  reasons: Readonly<Record<string, string>>;
  counts: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, string>>;
}

/**
 * "Sincronizar Airtable ahora" (ADR-0005): runs the sync on demand and shows what it brought. A view that can't be
 * read (or whose columns changed) imports nothing, which the answer says, with the CSV fallback.
 */
export const AirtableSync = ({ text }: { text: AirtableSyncText }) => {
  const write = useWrite({ ...text.errors, running: text.running, airtable: text.failed });
  const [counts, setCounts] = useState<Record<string, number>>();
  const reason =
    write.refusal?.error === 'airtable' && typeof write.refusal.body.reason === 'string'
      ? text.reasons[write.refusal.body.reason]
      : undefined;
  return (
    <div className={ui.form}>
      <div>
        <button
          type="button"
          className={ui.button}
          aria-disabled={write.pending}
          onClick={async () => {
            setCounts(undefined);
            const answer = await write.run(syncAirtable, { done: text.synced });
            if (answer?.ok) {
              setCounts(countsOf(answer.body.counts));
            }
          }}
        >
          {text.sync}
        </button>
      </div>
      {counts ? <Counts counts={counts} labels={text.counts} /> : null}
      <FormError message={write.error && reason ? `${write.error} ${reason}` : write.error} />
    </div>
  );
};
