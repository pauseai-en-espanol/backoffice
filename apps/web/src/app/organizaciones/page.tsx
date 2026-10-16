import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import * as onboarding from '@/onboarding/styles';
import { organisationFormText } from '@/outreach/contact-text';
import { getOrganisations } from '@/outreach/data';
import { Select } from '@/outreach/Field';
import { hasOrganisationFilters, organisationFiltersFromPage } from '@/outreach/filters';
import { NewOrganisationForm } from '@/outreach/OrganisationForm';
import { OutreachOnly } from '@/outreach/OutreachOnly';
import { PrivateMark } from '@/outreach/PrivateMark';
import { canOutreach, kindNames } from '@/outreach/text';
import { ORGANISATION_KINDS } from '@/outreach/types';
import { VisibilityFilter } from '@/outreach/VisibilityFilter';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('organisations.title') };

/** The API's most per list (staff-api M3): reaching it means there may be more. */
const LIST_LIMIT = 500;

/**
 * Organizaciones (outreach spec §5): every organisation by name, filtered by kind or searched by name, each with its
 * territory, website and how many contacts it has; and a form to add one.
 */
const OrganisationsPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const filters = organisationFiltersFromPage(await searchParams);
  const organisations = await getOrganisations(filters);
  const kinds = kindNames(t);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('organisations.title')}</h1>
      <p className={styles.text}>{t('organisations.intro')}</p>
      <p>
        <a className={styles.secondaryButton} href="#nueva">
          {t('organisations.new')}
        </a>
      </p>
      <form method="get" action="/organizaciones" className={onboarding.filters} role="search">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="buscar">
            {t('organisations.search')}
          </label>
          <input
            id="buscar"
            className={styles.input}
            type="search"
            name="buscar"
            defaultValue={filters.q}
            maxLength={200}
            aria-describedby="buscar-pista"
          />
          <span id="buscar-pista" className={styles.hint}>
            {t('organisations.searchHint')}
          </span>
        </div>
        <Select
          id="tipo"
          name="tipo"
          label={t('organisations.kind')}
          values={ORGANISATION_KINDS}
          names={kinds}
          defaultValue={filters.kind}
          empty={t('organisations.anyKind')}
        />
        <VisibilityFilter value={filters.visibility} />
        <div className={styles.rowActions} data-wide="">
          <button type="submit" className={styles.button}>
            {t('organisations.apply')}
          </button>
          {hasOrganisationFilters(filters) ? (
            <Link className={styles.secondaryButton} href="/organizaciones">
              {t('organisations.clear')}
            </Link>
          ) : null}
        </div>
      </form>
      {isUnavailable(organisations) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : organisations.length === 0 ? (
        <p className={styles.text}>{t('organisations.none')}</p>
      ) : (
        <section aria-label={t('organisations.listLabel')}>
          {organisations.length >= LIST_LIMIT ? (
            <p className={styles.notice}>{t('organisations.limit')}</p>
          ) : null}
          <ul className={onboarding.personList}>
            {organisations.map((organisation) => (
              <li key={organisation.id} className={onboarding.personItem}>
                <div className={onboarding.personHead}>
                  <Link
                    className={onboarding.personName}
                    href={`/organizaciones/${encodeURIComponent(organisation.id)}`}
                  >
                    {organisation.name}
                  </Link>
                  <span className={onboarding.stage}>{kinds[organisation.kind]}</span>
                </div>
                <ul className={onboarding.meta}>
                  {organisation.territory ? (
                    <li>
                      {t('organisations.territory')}: {organisation.territory}
                    </li>
                  ) : null}
                  {organisation.website ? (
                    <li className={styles.breakAnywhere}>{organisation.website}</li>
                  ) : null}
                  <li>{t('organisations.contactsCount', { count: organisation.contacts })}</li>
                </ul>
                {organisation.private ? <PrivateMark label={t('outreach.private.mark')} /> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section id="nueva" className={onboarding.section} aria-labelledby="nueva-titulo">
        <h2 id="nueva-titulo" className={styles.h3}>
          {t('organisations.new')}
        </h2>
        <NewOrganisationForm text={organisationFormText(t)} />
      </section>
    </AppShell>
  );
};

export default OrganisationsPage;
