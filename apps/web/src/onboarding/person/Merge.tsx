'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { formText } from '@/auth/client';
import { fill } from '@/fill';
import { useAnnounce } from '@/ui/announce';
import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import type { PersonPageText } from './text';

import { merge, searchPeople } from '../actions';
import { personName } from '../names';
import * as styles from '../styles';
import { parsePeople, type PersonSummary } from '../types';

/**
 * Merging (onboarding spec, merging), a human action: search for the other record of the same person, pick it, and
 * confirm. This person stays; the other becomes a tombstone pointing here, with its identities, presence and records.
 * Merges are not undone by themselves, which the question says.
 */
export const MergePanel = ({
  person,
  text,
}: {
  person: { id: string; name: string };
  text: PersonPageText;
}) => {
  const t = text.merge;
  const router = useRouter();
  const announce = useAnnounce();
  const [results, setResults] = useState<PersonSummary[]>();
  const [chosen, setChosen] = useState<PersonSummary>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const question = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chosen) {
      question.current?.focus();
    }
  }, [chosen]);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = formText(event.currentTarget, 'q').trim();
    if (q === '' || pending) {
      return;
    }
    setPending(true);
    setError(undefined);
    setChosen(undefined);
    const answer = await searchPeople(q);
    setPending(false);
    const page = answer.ok ? parsePeople(answer.body) : undefined;
    if (!page) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    setResults(page.people.filter((found) => found.id !== person.id));
  };

  const confirm = async () => {
    if (!chosen || pending) {
      return;
    }
    setPending(true);
    const answer = await merge(person.id, chosen.id);
    setPending(false);
    if (!answer.ok) {
      setError(messageFor(answer, text.errors));
      return;
    }
    setChosen(undefined);
    setResults(undefined);
    announce(t.done);
    router.refresh();
  };

  return (
    <div className={ui.form}>
      <p className={ui.hint}>{t.intro}</p>
      <form method="post" className={ui.form} onSubmit={search} role="search">
        <div className={ui.field}>
          <label className={ui.label} htmlFor="fusion-buscar">
            {t.search}
          </label>
          <input
            id="fusion-buscar"
            className={ui.input}
            type="search"
            name="q"
            maxLength={200}
            aria-describedby="fusion-hint"
          />
          <span id="fusion-hint" className={ui.hint}>
            {t.searchHint}
          </span>
        </div>
        <div>
          <button type="submit" className={ui.secondaryButton} aria-disabled={pending}>
            {t.searchButton}
          </button>
        </div>
      </form>
      <div role="status">
        {results !== undefined && results.length === 0 ? <p>{t.none}</p> : null}
      </div>
      {results !== undefined && results.length > 0 ? (
        <ul className={styles.personList}>
          {results.map((found) => (
            <li key={found.id} className={styles.boardCard}>
              <span>
                {personName(found.name, text.labels.noName)} · {text.stages[found.stage]}
              </span>
              <span className={ui.hint}>
                {text.labels.owner}: {found.owner?.displayName ?? text.labels.noOwner}
              </span>
              <div>
                <button
                  type="button"
                  className={ui.secondaryButton}
                  onClick={() => setChosen(found)}
                >
                  {fill(t.pick, { name: personName(found.name, text.labels.noName) })}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {chosen ? (
        <div ref={question} tabIndex={-1} role="group" aria-label={t.title} className={ui.confirm}>
          <p>
            {fill(t.confirm, {
              other: personName(chosen.name, text.labels.noName),
              name: person.name,
            })}
          </p>
          <div className={ui.rowActions}>
            <button
              type="button"
              className={ui.button}
              aria-disabled={pending}
              onClick={() => void confirm()}
            >
              {t.confirmButton}
            </button>
            <button type="button" className={ui.textButton} onClick={() => setChosen(undefined)}>
              {text.cancel}
            </button>
          </div>
        </div>
      ) : null}
      <FormError message={error} />
    </div>
  );
};
