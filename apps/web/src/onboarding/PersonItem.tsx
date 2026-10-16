import type { ReactNode } from 'react';

import Link from 'next/link';

import { fill } from '@/fill';

import type { PersonSummary } from './types';

import { dueState, formatDay, madridToday } from './format';
import { personName } from './names';
import * as styles from './styles';

/**
 * The words a person's card uses, built once by the server page (onboarding/text.ts personLabels) and handed down, so
 * the card renders the same on the server and in the browser ("Cargar más") without a message formatter.
 */
export interface PersonLabels {
  stages: Readonly<Record<string, string>>;
  reasons: Readonly<Record<string, string>>;
  sources: Readonly<Record<string, string>>;
  unknownReason: string;
  reasonsLabel: string;
  owner: string;
  noOwner: string;
  province: string;
  inCommunity: string;
  notInCommunity: string;
  sourcesLabel: string;
  nextAction: string;
  noNextAction: string;
  /** "vencido el {date}" */
  overdue: string;
  /** "para el {date}" */
  due: string;
  dueToday: string;
  /** "Sin nombre": someone saved with only a phone or an email. */
  noName: string;
}

/** A stage in words, outlined: never a colour of its own (WCAG 1.4.1). */
export const StageTag = ({ label }: { label: string }) => (
  <span className={styles.stage}>{label}</span>
);

/** Why a person needs attention, each reason with its mark and words. */
export const ReasonChips = ({
  reasons,
  labels,
}: {
  reasons: readonly string[];
  labels: Pick<PersonLabels, 'reasons' | 'unknownReason' | 'reasonsLabel'>;
}) =>
  reasons.length === 0 ? null : (
    <ul className={styles.reasons} aria-label={labels.reasonsLabel}>
      {reasons.map((reason) => (
        <li key={reason} className={styles.reason}>
          <span aria-hidden="true">!</span>
          {labels.reasons[reason] ?? labels.unknownReason}
        </li>
      ))}
    </ul>
  );

/** A next action and its due date, which says in words when it has passed or is today. */
export const NextAction = ({
  text,
  due,
  labels,
  today = madridToday(),
}: {
  text: string | null;
  due: string | null;
  labels: Pick<PersonLabels, 'noNextAction' | 'overdue' | 'due' | 'dueToday'>;
  today?: string;
}) => {
  if (text === null) {
    return <span>{labels.noNextAction}</span>;
  }
  const state = due === null ? undefined : dueState(due, today);
  return (
    <span>
      {text}
      {due === null ? null : state === 'overdue' ? (
        <span className={styles.overdue}>
          {' · '}
          <span aria-hidden="true">⚠ </span>
          {fill(labels.overdue, { date: formatDay(due) })}
        </span>
      ) : state === 'today' ? (
        <span className={styles.overdue}> · {labels.dueToday}</span>
      ) : (
        <span> · {fill(labels.due, { date: formatDay(due) })}</span>
      )}
    </span>
  );
};

/**
 * A person in a list (Hoy, Personas, the Bandeja's candidates): their name, linked to their page, their stage, owner,
 * next action and reasons. `action` is a button of the list's own (Me lo quedo), kept outside the link.
 */
export const PersonItem = ({
  person,
  labels,
  action,
  showSources = false,
}: {
  person: PersonSummary;
  labels: PersonLabels;
  action?: ReactNode;
  showSources?: boolean;
}) => (
  <li className={styles.personItem}>
    <div className={styles.personHead}>
      <Link className={styles.personName} href={`/personas/${encodeURIComponent(person.id)}`}>
        {personName(person.name, labels.noName)}
      </Link>
      <StageTag label={labels.stages[person.stage] ?? person.stage} />
    </div>
    <ul className={styles.meta}>
      <li>
        {labels.owner}: {person.owner?.displayName ?? labels.noOwner}
      </li>
      {person.province ? (
        <li>
          {labels.province}: {person.province}
        </li>
      ) : null}
      <li>{person.inCommunity ? labels.inCommunity : labels.notInCommunity}</li>
      {showSources && person.sources.length > 0 ? (
        <li>
          {labels.sourcesLabel}:{' '}
          {person.sources.map((source) => labels.sources[source] ?? source).join(', ')}
        </li>
      ) : null}
    </ul>
    <p>
      <span className={styles.meta}>{labels.nextAction}: </span>
      <NextAction text={person.nextAction} due={person.nextActionDue} labels={labels} />
    </p>
    <ReasonChips reasons={person.reasons} labels={labels} />
    {action}
  </li>
);
