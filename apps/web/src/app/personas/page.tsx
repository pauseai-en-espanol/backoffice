import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { riskyDownload } from '@/auth/confirm';
import { isUnavailable } from '@/data';
import { getArrivalChannels, getPeople } from '@/onboarding/data';
import { apiQuery, exportHref, filtersFromPage, pageQuery } from '@/onboarding/filters';
import { FiltersForm } from '@/onboarding/FiltersForm';
import { MorePeople } from '@/onboarding/MorePeople';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { PersonRow, PersonRowsHead } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, isAdmin, onboardingErrors, personLabels } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('people.title') };

/**
 * Personas (onboarding spec, views): everyone in onboarding, searchable by name (typo-tolerant), phone or email, and
 * filtered; the filters are the page's address. How many there are, in all and in each stage, is counted above the
 * list, each stage's counter its filter (PLAN R59). "Cargar más" adds the next page by the API's cursor. Admins export
 * the list as CSV, every export recorded by the API.
 */
const PeoplePage = async ({
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
  const filters = filtersFromPage(await searchParams);
  const [page, team, channels] = await Promise.all([
    getPeople(filters),
    getTeam(),
    getArrivalChannels(),
  ]);
  const labels = personLabels(t);
  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('people.title')}</h1>
      <p className={styles.text}>{t('people.intro')}</p>
      <FiltersForm
        action="/personas"
        filters={filters}
        team={isUnavailable(team) ? [] : team.staff}
        channels={isUnavailable(channels) ? [] : channels}
        search
        counts={isUnavailable(page) ? undefined : page.counts}
      />
      <div className={onboarding.listHead}>
        {isUnavailable(page) || !page.counts ? null : (
          <p className={onboarding.listCount}>{t('people.count', { count: page.counts.total })}</p>
        )}
        {isAdmin(me) ? (
          <p>
            <a
              className={styles.secondaryButton}
              {...riskyDownload(
                me.recentSecondFactor,
                exportHref(filters),
                `/personas${pageQuery(filters)}`,
              )}
              aria-describedby="exportar-pista"
            >
              {t('people.export')}
            </a>{' '}
            <span id="exportar-pista" className={styles.hint}>
              {t('people.exportHint')}
            </span>
          </p>
        ) : null}
      </div>
      {isUnavailable(page) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : page.people.length === 0 ? (
        <p className={styles.text}>{t('people.none')}</p>
      ) : (
        <section aria-label={t('people.listLabel')}>
          <PersonRowsHead labels={labels} />
          <ul className={onboarding.personRows}>
            {page.people.map((person) => (
              <PersonRow key={person.id} person={person} labels={labels} />
            ))}
          </ul>
          {page.next === null ? null : (
            <MorePeople
              query={apiQuery(filters)}
              next={page.next}
              labels={labels}
              text={{ more: t('people.more'), errors: onboardingErrors(t) }}
            />
          )}
        </section>
      )}
    </AppShell>
  );
};

export default PeoplePage;
