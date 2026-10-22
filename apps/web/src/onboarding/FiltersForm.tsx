import { COUNTRY_GROUPS, countryName } from '@backoffice/domain/places';
import { STAGES } from '@backoffice/domain/stages';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { TeamMember } from '@/team/data';

import { Icon } from '@/ui/Icon';
import { STAGE_ICONS, STAGE_TONE } from '@/ui/icons';
import * as ui from '@/ui/styles';

import type { ArrivalChannel, PeopleCounts } from './types';

import { hasFilters, pageQuery, pageReason, type PeopleFilters } from './filters';
import * as styles from './styles';
import { reasonNames } from './text';

const t = getTranslator();

/** "Todas": everyone the rest of the filters find, whatever their stage. */
const allCount = (counts: PeopleCounts): number =>
  Object.values(counts.stages).reduce((sum, n) => sum + (n ?? 0), 0);

/**
 * The filters of Personas and the Onboarding Pipeline, as a plain GET form: the list is the page's address, so it works
 * without scripts, and can be bookmarked or shared with the team (PLAN R59). What is used most is in view: the search
 * (Personas) and, with `counts`, a counter for every stage that is also its filter. The rest is folded under "Más
 * filtros", and whatever is on is said under it, each with a link that takes it off.
 */
export const FiltersForm = ({
  action,
  filters,
  team,
  channels,
  search,
  counts,
}: {
  action: string;
  filters: PeopleFilters;
  team: readonly TeamMember[];
  /** "Canal de alta"'s entries (PLAN M5); empty if the list couldn't be read. */
  channels: readonly ArrivalChannel[];
  search: boolean;
  /** Personas' counters (PLAN R59); without them the stage is one more filter (the Pipeline). */
  counts?: PeopleCounts | undefined;
}) => {
  const owner = filters.owner === 'me' ? 'yo' : filters.owner === 'none' ? 'nadie' : filters.owner;
  const href = (changed: Partial<PeopleFilters>) =>
    `${action}${pageQuery({ ...filters, ...changed })}`;
  const stage = filters.stages[0];

  // What is on, besides the search and (with counters) the stage, in words, each with the address without it.
  const memberName = (userId: string) =>
    team.find((member) => member.userId === userId)?.displayName ?? userId;
  const active: { label: string; without: Partial<PeopleFilters> }[] = [
    ...(counts === undefined && stage
      ? [{ label: `${t('people.stage')}: ${t(`stages.${stage}`)}`, without: { stages: [] } }]
      : []),
    ...(filters.owner
      ? [
          {
            label: `${t('people.owner')}: ${
              filters.owner === 'me'
                ? t('people.ownerMe')
                : filters.owner === 'none'
                  ? t('people.ownerNone')
                  : memberName(filters.owner)
            }`,
            without: { owner: '' },
          },
        ]
      : []),
    ...(filters.inCommunity
      ? [
          {
            label: `${t('people.inCommunity')}: ${
              filters.inCommunity === 'yes' ? t('people.inCommunityYes') : t('people.inCommunityNo')
            }`,
            without: { inCommunity: '' as const },
          },
        ]
      : []),
    ...(filters.team
      ? [
          {
            label: `${t('people.team')}: ${filters.team === 'yes' ? t('people.teamYes') : t('people.teamNo')}`,
            without: { team: '' as const },
          },
        ]
      : []),
    ...(filters.arrival
      ? [
          {
            label: `${t('people.arrival')}: ${
              filters.arrival === 'none'
                ? t('people.arrivalNone')
                : (channels.find((channel) => channel.id === filters.arrival)?.label ?? '')
            }`,
            without: { arrival: '' },
          },
        ]
      : []),
    ...(filters.arrivedOn
      ? [
          {
            label: `${t('people.arrivedOn')}: ${
              filters.arrivedOn === 'known'
                ? t('people.arrivedOnKnown')
                : t('people.arrivedOnUnknown')
            }`,
            without: { arrivedOn: '' as const },
          },
        ]
      : []),
    ...(filters.province
      ? [{ label: `${t('people.province')}: ${filters.province}`, without: { province: '' } }]
      : []),
    ...(filters.country
      ? [
          {
            label: `${t('people.country')}: ${
              filters.country === 'none' ? t('people.countryNone') : countryName(filters.country)
            }`,
            without: { country: '' },
          },
        ]
      : []),
    ...(filters.attention ? [{ label: t('people.attention'), without: { attention: false } }] : []),
    ...(filters.reason
      ? [
          {
            label: (reasonNames(t) as Record<string, string>)[filters.reason] ?? filters.reason,
            without: { reason: '' as const },
          },
        ]
      : []),
  ];
  // Those folded under "Más filtros", to say how many are on.
  const folded = active.length - (filters.reason ? 1 : 0);

  return (
    <div className={styles.filterArea}>
      <form method="get" action={action} role="search" className={styles.filterForm}>
        {search ? (
          <div className={ui.field}>
            <label className={ui.label} htmlFor="buscar">
              {t('people.search')}
            </label>
            <div className={styles.searchRow}>
              <input
                id="buscar"
                className={ui.input}
                type="search"
                name="buscar"
                defaultValue={filters.q}
                maxLength={200}
                aria-describedby="buscar-hint"
              />
              <button type="submit" className={ui.button}>
                {t('people.searchButton')}
              </button>
            </div>
            <span id="buscar-hint" className={ui.hint}>
              {t('people.searchHint')}
            </span>
          </div>
        ) : null}
        {counts && stage ? <input type="hidden" name="etapa" value={stage} /> : null}
        {filters.reason ? (
          <input type="hidden" name="motivo" value={pageReason(filters.reason)} />
        ) : null}
        <details className={styles.moreFilters}>
          <summary>
            {t('people.moreFilters')}
            {folded > 0 ? ` (${t('people.moreFiltersOn', { count: folded })})` : ''}
          </summary>
          <div className={styles.filters}>
            {counts === undefined ? (
              <div className={ui.field}>
                <label className={ui.label} htmlFor="etapa">
                  {t('people.stage')}
                </label>
                <select
                  id="etapa"
                  name="etapa"
                  className={styles.select}
                  defaultValue={stage ?? ''}
                >
                  <option value="">{t('people.anyStage')}</option>
                  {STAGES.map((value) => (
                    <option key={value} value={value}>
                      {t(`stages.${value}`)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className={ui.field}>
              <label className={ui.label} htmlFor="responsable">
                {t('people.owner')}
              </label>
              <select
                id="responsable"
                name="responsable"
                className={styles.select}
                defaultValue={owner}
              >
                <option value="">{t('people.ownerAny')}</option>
                <option value="yo">{t('people.ownerMe')}</option>
                <option value="nadie">{t('people.ownerNone')}</option>
                {team
                  .filter((member) => member.active)
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                    </option>
                  ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="comunidad">
                {t('people.inCommunity')}
              </label>
              <select
                id="comunidad"
                name="comunidad"
                className={styles.select}
                defaultValue={
                  filters.inCommunity === 'yes' ? 'si' : filters.inCommunity === 'no' ? 'no' : ''
                }
              >
                <option value="">{t('people.inCommunityAny')}</option>
                <option value="si">{t('people.inCommunityYes')}</option>
                <option value="no">{t('people.inCommunityNo')}</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="equipo">
                {t('people.team')}
              </label>
              <select
                id="equipo"
                name="equipo"
                className={styles.select}
                defaultValue={filters.team === 'yes' ? 'si' : filters.team === 'no' ? 'no' : ''}
              >
                <option value="">{t('people.teamAny')}</option>
                <option value="si">{t('people.teamYes')}</option>
                <option value="no">{t('people.teamNo')}</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="llegada">
                {t('people.arrival')}
              </label>
              <select
                id="llegada"
                name="llegada"
                className={styles.select}
                defaultValue={filters.arrival === 'none' ? 'ninguna' : filters.arrival}
              >
                <option value="">{t('people.anyArrival')}</option>
                <option value="ninguna">{t('people.arrivalNone')}</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="fecha">
                {t('people.arrivedOn')}
              </label>
              <select
                id="fecha"
                name="fecha"
                className={styles.select}
                defaultValue={
                  filters.arrivedOn === 'known'
                    ? 'sabida'
                    : filters.arrivedOn === 'unknown'
                      ? 'no-se-sabe'
                      : ''
                }
              >
                <option value="">{t('people.arrivedOnAny')}</option>
                <option value="sabida">{t('people.arrivedOnKnown')}</option>
                <option value="no-se-sabe">{t('people.arrivedOnUnknown')}</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="pais">
                {t('people.country')}
              </label>
              <select
                id="pais"
                name="pais"
                className={styles.select}
                defaultValue={
                  filters.country === 'none' ? 'ninguno' : filters.country.toLowerCase()
                }
              >
                <option value="">{t('people.countryAny')}</option>
                <option value="ninguno">{t('people.countryNone')}</option>
                {COUNTRY_GROUPS.map(({ group, codes }) =>
                  group === 'spain' ? (
                    codes.map((code) => (
                      <option key={code} value={code.toLowerCase()}>
                        {countryName(code)}
                      </option>
                    ))
                  ) : (
                    <optgroup
                      key={group}
                      label={group === 'latinAmerica' ? t('place.latinAmerica') : t('place.world')}
                    >
                      {codes.map((code) => (
                        <option key={code} value={code.toLowerCase()}>
                          {countryName(code)}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="provincia">
                {t('people.province')}
              </label>
              <input
                id="provincia"
                className={ui.input}
                name="provincia"
                defaultValue={filters.province}
                maxLength={100}
              />
            </div>
            <div className={ui.checkbox} data-wide="">
              <input
                id="atencion"
                type="checkbox"
                name="atencion"
                value="1"
                defaultChecked={filters.attention}
              />
              <label htmlFor="atencion">{t('people.attention')}</label>
            </div>
            <div className={ui.rowActions} data-wide="">
              <button type="submit" className={ui.button}>
                {t('people.apply')}
              </button>
            </div>
          </div>
        </details>
      </form>

      {counts ? (
        <nav aria-label={t('people.stages')}>
          <ul className={styles.stageCounters}>
            <li>
              <Link href={href({ stages: [] })} aria-current={stage ? undefined : 'page'}>
                {t('people.allStages')} <span className={styles.counter}>{allCount(counts)}</span>
              </Link>
            </li>
            {STAGES.filter((value) => (counts.stages[value] ?? 0) > 0 || value === stage).map(
              (value) => (
                <li key={value}>
                  <Link
                    href={href({ stages: [value] })}
                    aria-current={value === stage ? 'page' : undefined}
                  >
                    {/* Its stage's icon in its colour, as on every pill (PLAN R66): the word still says it. */}
                    <span className={styles.stageMark} data-tone={STAGE_TONE[value]}>
                      <Icon icon={STAGE_ICONS[value]} size={15} />
                    </span>
                    {t(`stages.${value}`)}{' '}
                    <span className={styles.counter}>{counts.stages[value] ?? 0}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      ) : null}

      {active.length > 0 ? (
        <div className={styles.activeFilters}>
          <span className={ui.hint}>{t('people.activeFilters')}</span>
          <ul className={styles.chips}>
            {active.map((filter) => (
              <li key={filter.label}>
                <Link
                  className={styles.chip}
                  href={href(filter.without)}
                  aria-label={t('people.removeFilter', { filter: filter.label })}
                >
                  {filter.label} <span aria-hidden="true">×</span>
                </Link>
              </li>
            ))}
          </ul>
          {hasFilters(filters) ? (
            <Link className={ui.link} href={action}>
              {t('people.clear')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
