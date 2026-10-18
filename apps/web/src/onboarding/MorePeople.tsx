'use client';

import { useRef, useState } from 'react';

import { FormError } from '@/ui/FormError';
import * as ui from '@/ui/styles';
import { messageFor } from '@/write';

import { read } from './actions';
import { type PersonLabels, PersonRow } from './PersonItem';
import * as styles from './styles';
import { parsePeople, type PersonSummary } from './types';

/**
 * "Cargar más" under Personas: the next page, by the API's cursor, added under the first, the same rows (PLAN R62). Focus moves
 * to the first person added, so a keyboard or screen reader user goes on reading where the new ones start.
 */
export const MorePeople = ({
  query,
  next,
  labels,
  text,
}: {
  /** The API's query for the list's filters (filters.ts apiQuery), without the cursor. */
  query: string;
  next: string;
  labels: PersonLabels;
  text: { more: string; errors: Readonly<Record<string, string>> };
}) => {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(next);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const list = useRef<HTMLUListElement>(null);

  const load = async () => {
    if (pending || cursor === null) {
      return;
    }
    setPending(true);
    setError(undefined);
    const separator = query === '' ? '?' : '&';
    const answer = await read(
      `/api/people${query}${separator}${new URLSearchParams({ cursor }).toString()}`,
    );
    setPending(false);
    const page = answer.ok ? parsePeople(answer.body) : undefined;
    if (!page) {
      setError(messageFor(answer.ok ? { status: 500 } : answer, text.errors));
      return;
    }
    const first = people.length;
    setPeople((current) => [...current, ...page.people]);
    setCursor(page.next);
    requestAnimationFrame(() => {
      list.current
        ?.querySelectorAll<HTMLLIElement>(':scope > li')
        .item(first)
        ?.querySelector<HTMLAnchorElement>('a')
        ?.focus();
    });
  };

  return (
    <>
      {people.length > 0 ? (
        <ul ref={list} className={styles.personRows}>
          {people.map((person) => (
            <PersonRow key={person.id} person={person} labels={labels} />
          ))}
        </ul>
      ) : (
        <ul ref={list} className={styles.personRows} hidden />
      )}
      {cursor === null ? null : (
        <button
          type="button"
          className={ui.secondaryButton}
          aria-disabled={pending}
          onClick={() => void load()}
        >
          {text.more}
        </button>
      )}
      <FormError message={error} />
    </>
  );
};
