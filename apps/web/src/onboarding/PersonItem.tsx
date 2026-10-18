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
  arrivalLabel: string;
  nextAction: string;
  noNextAction: string;
  /** "vencido el {date}" */
  overdue: string;
  /** "para el {date}" */
  due: string;
  dueToday: string;
  /** "Sin nombre": someone saved with only a phone or an email. */
  noName: string;
  /** "({province})", after the name (PLAN M5, step 4). */
  withProvince: string;
  /** What is missing, in plain words, and the line's label ("Falta"). */
  missing: Readonly<Record<string, string>>;
  missingLabel: string;
  /** "Equipo": on the team, through an active team account linked to them (PLAN M5, step 5). */
  team: string;
}

/** A stage in words, outlined: never a colour of its own (WCAG 1.4.1). */
export const StageTag = ({ label }: { label: string }) => (
  <span className={styles.stage}>{label}</span>
);

/** "Equipo", in words, for someone on the team (PLAN M5, step 5); nothing otherwise, nor for a deactivated account. */
export const TeamTag = ({
  team,
  labels,
}: {
  team: { active: boolean } | null;
  labels: Pick<PersonLabels, 'team'>;
}) => (team?.active ? <span className={styles.teamTag}>{labels.team}</span> : null);

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

/** A name (a link on a card, a heading's text on a person's page) followed by the province: "Maite (Madrid)". */
export const NameWithProvince = ({
  name,
  province,
  labels,
}: {
  name: ReactNode;
  province: string | null;
  labels: Pick<PersonLabels, 'withProvince'>;
}) => (
  <>
    {name}
    {province ? (
      <span className={styles.province}> {fill(labels.withProvince, { province })}</span>
    ) : null}
  </>
);

/** What is missing, in plain words ("Falta: correo · qué quiere hacer"); nothing when nothing is. */
export const MissingLine = ({
  missing,
  labels,
}: {
  missing: readonly string[];
  labels: Pick<PersonLabels, 'missing' | 'missingLabel'>;
}) =>
  missing.length === 0 ? null : (
    <p className={styles.missing}>
      <span className={styles.missingLabel}>{labels.missingLabel}:</span>{' '}
      {missing.map((detail) => labels.missing[detail] ?? detail).join(' · ')}
    </p>
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
 * A person in a list (Hoy, Personas, the Onboarding Pipeline, the Bandeja's candidates), saying who they are (PLAN M5,
 * step 4): their name, linked to their page, with their province; the team's one-line summary; what is missing; then
 * their stage, owner, next action and reasons. `action` is a button of the list's own (Me lo quedo), kept outside the
 * link.
 */
export const PersonItem = ({
  person,
  labels,
  action,
  showArrival = false,
}: {
  person: PersonSummary;
  labels: PersonLabels;
  action?: ReactNode;
  showArrival?: boolean;
}) => (
  <li className={styles.personItem}>
    <div className={styles.personHead}>
      <span className={styles.personTitle}>
        <NameWithProvince
          name={
            <Link className={styles.personName} href={`/personas/${encodeURIComponent(person.id)}`}>
              {personName(person.name, labels.noName)}
            </Link>
          }
          province={person.province}
          labels={labels}
        />
      </span>
      <span className={styles.tags}>
        <TeamTag team={person.team} labels={labels} />
        <StageTag label={labels.stages[person.stage] ?? person.stage} />
      </span>
    </div>
    {person.summary ? <p className={styles.summary}>{person.summary}</p> : null}
    <MissingLine missing={person.missing} labels={labels} />
    <ul className={styles.meta}>
      <li>
        {labels.owner}: {person.owner?.displayName ?? labels.noOwner}
      </li>
      <li>{person.inCommunity ? labels.inCommunity : labels.notInCommunity}</li>
      {showArrival && person.arrival ? (
        <li>
          {labels.arrivalLabel}: {person.arrival.label}
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
