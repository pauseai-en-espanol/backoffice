import type { Metadata } from 'next';

import { isStage, type Stage, STAGES } from '@backoffice/domain/stages';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { PersonLabels } from '@/onboarding/PersonItem';
import type { PersonSummary } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { getArrivalChannels, getBoard } from '@/onboarding/data';
import { filtersFromPage, pageQuery, type PeopleFilters } from '@/onboarding/filters';
import { FiltersForm } from '@/onboarding/FiltersForm';
import { personName } from '@/onboarding/names';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { NextAction, ReasonChips } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, personLabels } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('board.title') };

const Card = ({ person, labels }: { person: PersonSummary; labels: PersonLabels }) => (
  <li className={onboarding.boardCard}>
    <Link className={onboarding.personName} href={`/personas/${encodeURIComponent(person.id)}`}>
      {personName(person.name, labels.noName)}
    </Link>
    <span className={styles.hint}>
      {labels.owner}: {person.owner?.displayName ?? labels.noOwner}
    </span>
    <span className={styles.hint}>
      <NextAction text={person.nextAction} due={person.nextActionDue} labels={labels} />
    </span>
    <ReasonChips reasons={person.reasons} labels={labels} />
  </li>
);

/** "Ver las 73 de esta etapa": the full list, in Personas, with the same filters and the stage. */
const fullList = (filters: PeopleFilters, stage: Stage) =>
  `/personas${pageQuery({ ...filters, stages: [stage] })}`;

/**
 * Onboarding Pipeline (onboarding spec, views): the people by stage, in the expected path's order. From a tablet up, one column a
 * stage, side by side (scrolling sideways); on a phone, one stage at a time, picked from a list that says how many
 * each has. Each card leads to the person, where the stage is changed.
 */
const BoardPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const params = await searchParams;
  const filters = { ...filtersFromPage(params), q: '' };
  const [board, team, channels] = await Promise.all([
    getBoard(filters),
    getTeam(),
    getArrivalChannels(),
  ]);
  const labels = personLabels(t);
  const requested = Array.isArray(params.ver) ? params.ver[0] : params.ver;
  const shown: Stage = isStage(requested)
    ? requested
    : isUnavailable(board)
      ? 'new'
      : (STAGES.find((stage) => (board[stage]?.count ?? 0) > 0) ?? 'new');
  const column = (stage: Stage) => (isUnavailable(board) ? undefined : board[stage]);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('board.title')}</h1>
      <p className={styles.text}>{t('board.intro')}</p>
      <FiltersForm
        action="/pipeline"
        filters={filters}
        team={isUnavailable(team) ? [] : team.staff}
        channels={isUnavailable(channels) ? [] : channels}
        search={false}
      />
      {isUnavailable(board) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : (
        <>
          <div className={onboarding.boardColumns}>
            {STAGES.map((stage) => {
              const entry = column(stage);
              const count = entry?.count ?? 0;
              return (
                <section
                  key={stage}
                  className={onboarding.boardColumn}
                  aria-labelledby={`col-${stage}`}
                >
                  <h2 id={`col-${stage}`} className={styles.h3}>
                    {labels.stages[stage]}{' '}
                    <span className={styles.muted}>({t('board.count', { count })})</span>
                  </h2>
                  {entry === undefined || entry.people.length === 0 ? (
                    <p className={styles.hint}>{t('board.empty')}</p>
                  ) : (
                    <ul className={onboarding.personList}>
                      {entry.people.map((person) => (
                        <Card key={person.id} person={person} labels={labels} />
                      ))}
                    </ul>
                  )}
                  {count > (entry?.people.length ?? 0) ? (
                    <Link className={styles.link} href={fullList(filters, stage)}>
                      {t('board.more', { count })}
                    </Link>
                  ) : null}
                </section>
              );
            })}
          </div>
          <div className={onboarding.boardPhone}>
            <form method="get" action="/pipeline" className={styles.form}>
              {/* The filters, carried along. */}
              {[...new URLSearchParams(pageQuery(filters))].map(([name, value], index) => (
                <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
              ))}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ver">
                  {t('board.pickStage')}
                </label>
                <select id="ver" name="ver" className={onboarding.select} defaultValue={shown}>
                  {STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {labels.stages[stage]} ({column(stage)?.count ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <button type="submit" className={styles.secondaryButton}>
                  {t('board.show')}
                </button>
              </div>
            </form>
            <section aria-labelledby="etapa-elegida">
              <h2 id="etapa-elegida" className={styles.h2}>
                {labels.stages[shown]}{' '}
                <span className={styles.muted}>
                  ({t('board.count', { count: column(shown)?.count ?? 0 })})
                </span>
              </h2>
              {(column(shown)?.people.length ?? 0) === 0 ? (
                <p className={styles.text}>{t('board.empty')}</p>
              ) : (
                <ul className={onboarding.personList}>
                  {column(shown)?.people.map((person) => (
                    <Card key={person.id} person={person} labels={labels} />
                  ))}
                </ul>
              )}
              {(column(shown)?.count ?? 0) > (column(shown)?.people.length ?? 0) ? (
                <Link className={styles.link} href={fullList(filters, shown)}>
                  {t('board.more', { count: column(shown)?.count ?? 0 })}
                </Link>
              ) : null}
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
};

export default BoardPage;
