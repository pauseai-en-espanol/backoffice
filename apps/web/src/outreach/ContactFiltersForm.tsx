import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import * as onboarding from '@/onboarding/styles';
import * as ui from '@/ui/styles';

import { Select } from './Field';
import { type ContactFilters, hasContactFilters } from './filters';
import { kindNames, stageNames, tierNames } from './text';
import { ORGANISATION_KINDS, RELATIONSHIP_STAGES, type StaffRef, TIERS } from './types';

const t = getTranslator();

/**
 * Contactos' filters (outreach spec §5), as a plain GET form: the list is the page's address, so it works without
 * scripts and can be bookmarked or shared. "Míos" is the signed-in staff member's.
 */
export const ContactFiltersForm = ({
  filters,
  owners,
}: {
  filters: ContactFilters;
  owners: readonly StaffRef[];
}) => (
  <form method="get" action="/contactos" className={onboarding.filters} role="search">
    <div className={ui.field} data-wide="">
      <label className={ui.label} htmlFor="buscar">
        {t('contacts.search')}
      </label>
      <input
        id="buscar"
        className={ui.input}
        type="search"
        name="buscar"
        defaultValue={filters.q}
        maxLength={200}
        aria-describedby="buscar-pista"
      />
      <span id="buscar-pista" className={ui.hint}>
        {t('contacts.searchHint')}
      </span>
    </div>
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
        defaultValue={filters.owner === 'me' ? 'yo' : filters.owner}
      >
        <option value="">{t('contacts.ownerAny')}</option>
        <option value="yo">{t('contacts.ownerMe')}</option>
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
  </form>
);
