import { getTranslator } from '@backoffice/i18n/messages';
import { css, cx } from '@styled-system/css';
import Link from 'next/link';

import * as onboarding from '@/onboarding/styles';
import * as ui from '@/ui/styles';

import { Select } from './Field';
import { type ContactFilters, foldedContactFilters, hasContactFilters } from './filters';
import { kindNames, stageNames, tierNames } from './text';
import { ORGANISATION_KINDS, RELATIONSHIP_STAGES, type StaffRef, TIERS } from './types';
import { VisibilityFilter } from './VisibilityFilter';

const t = getTranslator();

/** Clear of "Nuevo contacto" above it. */
const spaced = css({ marginBlockStart: '4' });

/**
 * Contactos' filters (outreach spec §5), as a plain GET form: the list is the page's address, so it works without
 * scripts and can be bookmarked or shared. "Míos" is the signed-in staff member's. The search shows; the rest fold
 * under "Más filtros", which says how many are on, as Personas' do (PLAN R67).
 */
export const ContactFiltersForm = ({
  filters,
  owners,
}: {
  filters: ContactFilters;
  owners: readonly StaffRef[];
}) => {
  const folded = foldedContactFilters(filters);
  return (
    <div className={cx(onboarding.filterArea, spaced)}>
      <form method="get" action="/contactos" className={onboarding.filterForm} role="search">
        <div className={ui.field}>
          <label className={ui.label} htmlFor="buscar">
            {t('contacts.search')}
          </label>
          <div className={onboarding.searchRow}>
            <input
              id="buscar"
              className={ui.input}
              type="search"
              name="buscar"
              defaultValue={filters.q}
              maxLength={200}
              aria-describedby="buscar-pista"
            />
            <button type="submit" className={ui.button}>
              {t('people.searchButton')}
            </button>
          </div>
          <span id="buscar-pista" className={ui.hint}>
            {t('contacts.searchHint')}
          </span>
        </div>
        <details className={onboarding.moreFilters}>
          <summary>
            {t('people.moreFilters')}
            {folded > 0 ? ` (${t('people.moreFiltersOn', { count: folded })})` : ''}
          </summary>
          <div className={onboarding.filters}>
            <Select
              id="nivel"
              name="nivel"
              label={t('contacts.tier')}
              values={TIERS}
              names={tierNames(t)}
              defaultValue={filters.tier}
              empty={t('contacts.anyTier')}
            />
            <Select
              id="tipo"
              name="tipo"
              label={t('contacts.kind')}
              values={ORGANISATION_KINDS}
              names={kindNames(t)}
              defaultValue={filters.kind}
              empty={t('contacts.anyKind')}
            />
            <Select
              id="relacion"
              name="relacion"
              label={t('contacts.stage')}
              values={RELATIONSHIP_STAGES}
              names={stageNames(t)}
              defaultValue={filters.stage}
              empty={t('contacts.anyStage')}
            />
            <div className={ui.field}>
              <label className={ui.label} htmlFor="territorio">
                {t('contacts.territory')}
              </label>
              <input
                id="territorio"
                className={ui.input}
                name="territorio"
                defaultValue={filters.territory}
                maxLength={100}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="responsable">
                {t('contacts.owner')}
              </label>
              <select
                id="responsable"
                name="responsable"
                className={onboarding.select}
                defaultValue={
                  filters.owner === 'me' ? 'yo' : filters.owner === 'none' ? 'nadie' : filters.owner
                }
              >
                <option value="">{t('contacts.ownerAny')}</option>
                <option value="yo">{t('contacts.ownerMe')}</option>
                <option value="nadie">{t('contacts.ownerNone')}</option>
                {owners.map((owner) => (
                  <option key={owner.userId} value={owner.userId}>
                    {owner.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="revisar">
                {t('contacts.review')}
              </label>
              <select
                id="revisar"
                name="revisar"
                className={onboarding.select}
                defaultValue={filters.review === 'yes' ? 'si' : filters.review === 'no' ? 'no' : ''}
              >
                <option value="">{t('contacts.reviewAny')}</option>
                <option value="si">{t('contacts.reviewYes')}</option>
                <option value="no">{t('contacts.reviewNo')}</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="pausa">
                {t('contacts.hold')}
              </label>
              <select
                id="pausa"
                name="pausa"
                className={onboarding.select}
                defaultValue={filters.hold === 'yes' ? 'si' : filters.hold === 'no' ? 'no' : ''}
              >
                <option value="">{t('contacts.holdAny')}</option>
                <option value="si">{t('contacts.holdYes')}</option>
                <option value="no">{t('contacts.holdNo')}</option>
              </select>
            </div>
            <VisibilityFilter value={filters.visibility} />
            <div className={ui.rowActions} data-wide="">
              <button type="submit" className={ui.button}>
                {t('contacts.apply')}
              </button>
              {hasContactFilters(filters) ? (
                <Link className={ui.secondaryButton} href="/contactos">
                  {t('contacts.clear')}
                </Link>
              ) : null}
            </div>
          </div>
        </details>
      </form>
    </div>
  );
};
