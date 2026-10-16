import { SOURCES, STAGES } from '@backoffice/domain/stages';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { TeamMember } from '@/team/data';

import * as ui from '@/ui/styles';

import { hasFilters, type PeopleFilters } from './filters';
import * as styles from './styles';

const t = getTranslator();

/**
 * The filters of Personas and the Onboarding Pipeline, as a plain GET form: the list is the page's address, so it works without
 * scripts, and can be bookmarked or shared with the team. `search` adds the search box (Personas).
 */
export const FiltersForm = ({
  action,
  filters,
  team,
  search,
}: {
  action: string;
  filters: PeopleFilters;
  team: readonly TeamMember[];
  search: boolean;
}) => {
  const owner = filters.owner === 'me' ? 'yo' : filters.owner === 'none' ? 'nadie' : filters.owner;
  return (
    <form method="get" action={action} className={styles.filters} role="search">
      {search ? (
        <div className={ui.field} data-wide="">
          <label className={ui.label} htmlFor="buscar">
            {t('people.search')}
          </label>
          <input
            id="buscar"
            className={ui.input}
            type="search"
            name="buscar"
            defaultValue={filters.q}
            maxLength={200}
            aria-describedby="buscar-hint"
          />
          <span id="buscar-hint" className={ui.hint}>
            {t('people.searchHint')}
          </span>
        </div>
      ) : null}
      <div className={ui.field}>
        <label className={ui.label} htmlFor="etapa">
          {t('people.stage')}
        </label>
        <select
          id="etapa"
          name="etapa"
          className={styles.select}
          defaultValue={filters.stages[0] ?? ''}
        >
          <option value="">{t('people.anyStage')}</option>
          {STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {t(`stages.${stage}`)}
            </option>
          ))}
        </select>
      </div>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="responsable">
          {t('people.owner')}
        </label>
        <select id="responsable" name="responsable" className={styles.select} defaultValue={owner}>
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
        <label className={ui.label} htmlFor="fuente">
          {t('people.source')}
        </label>
        <select id="fuente" name="fuente" className={styles.select} defaultValue={filters.source}>
          <option value="">{t('people.anySource')}</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {t(`sources.${source}`)}
            </option>
          ))}
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
        {hasFilters(filters) ? (
          <Link className={ui.secondaryButton} href={action}>
            {t('people.clear')}
          </Link>
        ) : null}
      </div>
    </form>
  );
};
