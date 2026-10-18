import type { Stage } from '@backoffice/domain/stages';
import type { StageTone } from '@backoffice/ui/brand';
import type { LucideIcon } from 'lucide-react';

import { cx } from '@styled-system/css';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';

import { fill } from '@/fill';
import { Icon } from '@/ui/Icon';
import { icons, MISSING_ICONS, STAGE_ICONS, STAGE_TONE } from '@/ui/icons';
import { srOnly } from '@/ui/styles';

import type { PersonSummary } from './types';

import { chipReasons, nextStepTone, ownerSlot } from './card';
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
  /** The names of Personas' columns that no other label gives: "Persona" and "Etapa" (PLAN R62). */
  personColumn: string;
  stageColumn: string;
}

const isOnboardingStage = (stage: string): stage is Stage => stage in STAGE_ICONS;

/**
 * A pill in a stage's colour with its icon and its word (PLAN R61), so it is never a colour alone: the onboarding's
 * stages (StageTag) and outreach's relationships (RelationshipTag).
 */
export const StagePill = ({
  tone,
  icon,
  label,
}: {
  tone: StageTone;
  icon: LucideIcon;
  label: string;
}) => (
  <span className={styles.stage} data-tone={tone}>
    <Icon icon={icon} size={15} />
    {label}
  </span>
);

/** An onboarding stage as its pill; given a word alone, an outline in words. */
export const StageTag = ({ label, stage }: { label: string; stage?: string }) =>
  stage !== undefined && isOnboardingStage(stage) ? (
    <StagePill tone={STAGE_TONE[stage]} icon={STAGE_ICONS[stage]} label={label} />
  ) : (
    <span className={styles.stage}>{label}</span>
  );

/** "Equipo", a quiet tag for someone on the team (PLAN M5, step 5); nothing otherwise, nor for a deactivated account. */
export const TeamTag = ({
  team,
  labels,
}: {
  team: { active: boolean } | null;
  labels: Pick<PersonLabels, 'team'>;
}) =>
  team?.active ? (
    <span className={styles.teamTag}>
      <Icon icon={icons.team} size={13} />
      {labels.team}
    </span>
  ) : null;

/** Each reason's icon and colour: red for a step whose day has passed, amber for the rest (PLAN R61). */
const REASON_LOOK: Readonly<Record<string, { icon: LucideIcon; tone?: 'negative' }>> = {
  unassigned: { icon: icons.unassigned },
  action_due: { icon: icons.late, tone: 'negative' },
  no_next_step: { icon: icons.attention },
  follow_up: { icon: icons.followUp },
  left_community: { icon: icons.outOfCommunity },
  possible_duplicate: { icon: icons.duplicate },
};

/** Why a person needs attention: each reason a status chip with its icon and its words. */
export const ReasonChips = ({
  reasons,
  labels,
}: {
  reasons: readonly string[];
  labels: Pick<PersonLabels, 'reasons' | 'unknownReason' | 'reasonsLabel'>;
}) =>
  reasons.length === 0 ? null : (
    <ul className={styles.reasons} aria-label={labels.reasonsLabel}>
      {reasons.map((reason) => {
        const look = REASON_LOOK[reason] ?? { icon: icons.attention };
        return (
          <li key={reason} className={styles.reason} data-tone={look.tone}>
            <Icon icon={look.icon} size={15} />
            {labels.reasons[reason] ?? labels.unknownReason}
          </li>
        );
      })}
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

/**
 * What is missing ("Falta: correo · qué quiere hacer"), each detail a dashed chip with its icon; nothing when nothing
 * is. The separators are there for a reader, so the line still says it as one sentence.
 */
export const MissingLine = ({
  missing,
  labels,
  labelClassName,
}: {
  missing: readonly string[];
  labels: Pick<PersonLabels, 'missing' | 'missingLabel'>;
  /** How "Falta:" itself shows: Personas' rows say it only to a reader, under their column's name. */
  labelClassName?: string;
}) =>
  missing.length === 0 ? null : (
    <p className={styles.missing}>
      <span className={cx(styles.missingLabel, labelClassName)}>{labels.missingLabel}:</span>{' '}
      {missing.map((detail, index) => {
        const glyph = (MISSING_ICONS as Readonly<Record<string, LucideIcon>>)[detail];
        return (
          <Fragment key={detail}>
            {index > 0 ? <span className={srOnly}> · </span> : null}
            <span className={styles.missingChip}>
              {glyph ? <Icon icon={glyph} size={13} /> : null}
              {labels.missing[detail] ?? detail}
            </span>
          </Fragment>
        );
      })}
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
          <Icon icon={icons.late} size={15} />
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
 * The next step's strip (PLAN R61): the step and when it is due, red when its day has passed and amber when it is
 * today; with none, amber "Sin siguiente paso" for someone who needs one, quiet for someone who doesn't.
 */
export const NextStep = ({
  person,
  labels,
  today = madridToday(),
}: {
  person: Pick<PersonSummary, 'nextAction' | 'nextActionDue' | 'reasons'>;
  labels: Pick<PersonLabels, 'nextAction' | 'noNextAction' | 'overdue' | 'due' | 'dueToday'>;
  today?: string;
}) => {
  const tone = nextStepTone(person.nextAction, person.nextActionDue, person.reasons, today);
  if (person.nextAction === null) {
    return (
      <p className={styles.nextStep} data-tone={tone}>
        {tone === 'attention' ? <Icon icon={icons.attention} size={15} /> : null}
        {labels.noNextAction}
      </p>
    );
  }
  const due = person.nextActionDue;
  const state = due === null ? undefined : dueState(due, today);
  return (
    <p className={styles.nextStep} data-tone={tone}>
      <Icon icon={icons.nextStep} size={15} />
      <span>
        <span className={srOnly}>{labels.nextAction}: </span>
        {person.nextAction}
      </span>
      {due === null ? null : (
        <span className={styles.nextStepWhen}>
          <Icon icon={state === 'overdue' ? icons.late : icons.due} size={14} />
          {state === 'overdue'
            ? fill(labels.overdue, { date: formatDay(due) })
            : state === 'today'
              ? labels.dueToday
              : fill(labels.due, { date: formatDay(due) })}
        </span>
      )}
    </p>
  );
};

/** Who looks after someone: their name, "Sin asignar" in amber when they wait for someone, or "Sin responsable". */
const OwnerFact = ({ person, labels }: { person: PersonSummary; labels: PersonLabels }) => {
  const slot = ownerSlot(person.owner, person.reasons);
  return slot.kind === 'unassigned' ? (
    <li className={styles.factAttention}>
      <Icon icon={icons.unassigned} size={15} />
      {labels.reasons.unassigned}
    </li>
  ) : (
    <li>
      <Icon icon={slot.kind === 'owner' ? icons.owner : icons.unassigned} size={15} />
      <span className={srOnly}>{labels.owner}: </span>
      {slot.kind === 'owner' ? slot.name : labels.noOwner}
    </li>
  );
};

/** Where someone came from and whether they are in the community, and "Equipo" for someone on the team. */
const PlaceFacts = ({
  person,
  labels,
  showArrival,
}: {
  person: PersonSummary;
  labels: PersonLabels;
  showArrival: boolean;
}) => (
  <>
    {showArrival && person.arrival ? (
      <li>
        <Icon icon={icons.arrival} size={15} />
        <span className={srOnly}>{labels.arrivalLabel}: </span>
        {person.arrival.label}
      </li>
    ) : null}
    <li>
      <Icon icon={person.inCommunity ? icons.inCommunity : icons.outOfCommunity} size={15} />
      {person.inCommunity ? labels.inCommunity : labels.notInCommunity}
    </li>
    {person.team?.active ? (
      <li>
        <TeamTag team={person.team} labels={labels} />
      </li>
    ) : null}
  </>
);

/** The name, linked to the person's page, with the province; "Sin nombre" never looks like a name. */
const PersonTitle = ({ person, labels }: { person: PersonSummary; labels: PersonLabels }) => (
  <span className={styles.personTitle}>
    <NameWithProvince
      name={
        <Link
          className={cx(styles.personName, person.name === null ? styles.nameless : undefined)}
          href={`/personas/${encodeURIComponent(person.id)}`}
        >
          {personName(person.name, labels.noName)}
        </Link>
      }
      province={person.province}
      labels={labels}
    />
  </span>
);

/**
 * A person in a list (Hoy, the Onboarding Pipeline, Censo, the Bandeja's candidates), each fact once and in its place
 * (PLAN R61): the name with the province and the stage; the team's one-line summary; the owner, where they came from,
 * the community and the team; the next step; the reasons no slot already shows; what is missing, last. `action` is
 * the list's own button (Me lo quedo), kept outside the link. The Pipeline leaves the stage out (`hideStage`): its
 * column says it.
 */
export const PersonItem = ({
  person,
  labels,
  action,
  showArrival = false,
  hideStage = false,
  compact = false,
}: {
  person: PersonSummary;
  labels: PersonLabels;
  action?: ReactNode;
  showArrival?: boolean;
  hideStage?: boolean;
  compact?: boolean;
}) => (
  <li className={styles.personItem} data-compact={compact ? '' : undefined}>
    <div className={styles.personHead}>
      <PersonTitle person={person} labels={labels} />
      {hideStage ? null : (
        <StageTag stage={person.stage} label={labels.stages[person.stage] ?? person.stage} />
      )}
    </div>
    {person.summary ? <p className={styles.summary}>{person.summary}</p> : null}
    <ul className={styles.facts}>
      <OwnerFact person={person} labels={labels} />
      <PlaceFacts person={person} labels={labels} showArrival={showArrival} />
    </ul>
    <NextStep person={person} labels={labels} />
    <ReasonChips reasons={chipReasons(person.reasons)} labels={labels} />
    <MissingLine missing={person.missing} labels={labels} />
    {action ? <div className={styles.cardFoot}>{action}</div> : null}
  </li>
);

/**
 * A person as a row of Personas (PLAN R62): Persona · Etapa · Responsable · Siguiente paso · Falta, in columns that
 * line up from a tablet up, and the same facts as a card on a phone. Each cell says its own name to a reader, so the
 * columns' names above (PersonRowsHead) are decoration.
 */
export const PersonRow = ({ person, labels }: { person: PersonSummary; labels: PersonLabels }) => (
  <li className={styles.personRow}>
    <div className={styles.rowCell}>
      <PersonTitle person={person} labels={labels} />
      {person.summary ? <p className={styles.summary}>{person.summary}</p> : null}
      <ul className={styles.facts}>
        <PlaceFacts person={person} labels={labels} showArrival />
      </ul>
    </div>
    <div>
      <StageTag stage={person.stage} label={labels.stages[person.stage] ?? person.stage} />
    </div>
    <ul className={styles.facts} data-wide="">
      <OwnerFact person={person} labels={labels} />
    </ul>
    <div className={styles.rowCell} data-wide="">
      <NextStep person={person} labels={labels} />
      <ReasonChips reasons={chipReasons(person.reasons)} labels={labels} />
    </div>
    <div data-wide="">
      <MissingLine missing={person.missing} labels={labels} labelClassName={styles.rowLabel} />
    </div>
  </li>
);

/** The names of Personas' columns, from a tablet up: hidden from a reader, as each cell says its own. */
export const PersonRowsHead = ({ labels }: { labels: PersonLabels }) => (
  <div className={styles.rowHead} aria-hidden="true">
    <span>{labels.personColumn}</span>
    <span>{labels.stageColumn}</span>
    <span>{labels.owner}</span>
    <span>{labels.nextAction}</span>
    <span>{labels.missingLabel}</span>
  </div>
);
