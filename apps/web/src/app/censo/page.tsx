import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import { CensusLinkPanel, type CensusLinkText } from '@/onboarding/census/CensusLinkPanel';
import { CopyLink } from '@/onboarding/census/CopyLink';
import { censusUrl, getCensus } from '@/onboarding/census/data';
import { linkState, linkText, progressOf, textBar } from '@/onboarding/census/format';
import { getMessageTemplates } from '@/onboarding/data';
import { personName } from '@/onboarding/names';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { PersonItem } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, onboardingErrors, personLabels } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('censo.title') };

/** Censo's address for a search and a page: `buscar` as in Personas, `desde` the API's cursor. */
const censoHref = (q: string, cursor?: string): string => {
  const query = new URLSearchParams();
  if (q !== '') {
    query.set('buscar', q);
  }
  if (cursor) {
    query.set('desde', cursor);
  }
  const search = query.toString();
  return `/censo${search === '' ? '' : `?${search}`}#por-censar`;
};

const one = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 200) ?? '';

/**
 * Censo (census spec): how many people have completed their profile, the generic link to publish, and the people
 * still to answer, oldest first, 50 at a time and searchable (PLAN R47), each with a personal link to make and send
 * from the onboarder's own WhatsApp.
 */
const CensusPage = async ({
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
  const q = one(params.buscar);
  const cursor = one(params.desde);
  const [census, templates] = await Promise.all([getCensus({ q, cursor }), getMessageTemplates()]);
  // The census link messages in use, one's own and then the team's (Mensajes, PLAN M5, R71); none: the code's own.
  const messages = isUnavailable(templates)
    ? []
    : templates
        .filter((template) => template.purpose === 'census_link' && template.active)
        .map(({ id, title, mine }) => ({ id, title, mine }));
  const general = censusUrl();
  const labels = personLabels(t);
  const raw = (key: Parameters<typeof t.raw>[0]) => String(t.raw(key));
  const linkWords = {
    created: raw('censo.linkCreated'),
    expires: raw('censo.linkExpires'),
    expired: raw('censo.linkExpired'),
    sent: raw('censo.linkSent'),
    notSent: t('censo.linkNotSent'),
    used: raw('censo.linkUsed'),
  };
  const copy = {
    copy: t('censo.copy'),
    copied: t('censo.copied'),
    copyFailed: t('censo.copyFailed'),
  };
  const text: CensusLinkText = {
    linkNone: t('censo.linkNone'),
    create: t('censo.create'),
    createFor: raw('censo.createFor'),
    createAgain: t('censo.createAgain'),
    createAgainFor: raw('censo.createAgainFor'),
    createAgainHint: t('censo.createAgainHint'),
    created: t('censo.created'),
    url: t('censo.url'),
    urlHint: t('censo.urlHint'),
    ...copy,
    whatsapp: t('censo.whatsapp'),
    email: t('person.handover.email'),
    copyMessage: t('person.handover.copy'),
    messageCopied: t('person.handover.copied'),
    how: t('censo.how'),
    where: t('person.handover.where'),
    channels: (['discord', 'telegram', 'whatsapp', 'email', 'other'] as const).map((channel) => ({
      value: channel,
      label: t(`contactChannels.${channel}`),
    })),
    choose: t('censo.choose'),
    chooseMine: t('messageTemplates.pickerMine'),
    chooseTeam: t('messageTemplates.pickerTeam'),
    chooseHint: t('censo.chooseHint'),
    sent: t('censo.sent'),
    sentYes: t('censo.sentYes'),
    sentNo: t('censo.sentNo'),
    sentDone: t('censo.sentDone'),
    errors: onboardingErrors(t),
  };
  const progress = isUnavailable(census)
    ? undefined
    : { ...progressOf(census.counts), counts: census.counts };

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('censo.title')}</h1>
      <p className={styles.text}>{t('censo.intro')}</p>
      <Announcer>
        <section className={onboarding.section} aria-labelledby="progreso">
          <h2 id="progreso" className={styles.h3}>
            {t('censo.progress')}
          </h2>
          {progress === undefined ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : (
            <>
              <p>
                <span aria-hidden="true" className={styles.block}>
                  [{textBar(progress.percent)}]
                </span>
                {t('censo.progressText', {
                  completed: progress.completed,
                  people: progress.people,
                  percent: progress.percent,
                })}
              </p>
              <dl className={onboarding.counts}>
                <dt>{t('censo.people')}</dt>
                <dd>{progress.counts.people}</dd>
                <dt>{t('censo.completed')}</dt>
                <dd>{progress.counts.completed}</dd>
                <dt>{t('censo.linksSent')}</dt>
                <dd>{progress.counts.linksSent}</dd>
                <dt>{t('censo.linksUsed')}</dt>
                <dd>{progress.counts.linksUsed}</dd>
              </dl>
            </>
          )}
        </section>

        <section className={onboarding.section} aria-labelledby="general">
          <h2 id="general" className={styles.h3}>
            {t('censo.general')}
          </h2>
          {general === '' ? (
            <p className={styles.notice}>{t('censo.generalNotConfigured')}</p>
          ) : (
            <CopyLink
              id="censo-general"
              url={general}
              text={{ label: t('censo.general'), hint: t('censo.generalIntro'), ...copy }}
            />
          )}
        </section>

        <section className={onboarding.section} aria-labelledby="por-censar">
          <h2 id="por-censar" className={styles.h3}>
            {t('censo.queue')}
          </h2>
          <p className={styles.hint}>{t('censo.queueIntro')}</p>
          {isUnavailable(census) ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : (
            <>
              <p className={styles.text}>{t('censo.waiting', { count: census.counts.waiting })}</p>
              {census.counts.waiting > 0 || q !== '' ? (
                <form
                  method="get"
                  action="/censo#por-censar"
                  className={onboarding.filters}
                  role="search"
                >
                  <div className={styles.field} data-wide="">
                    <label className={styles.label} htmlFor="buscar">
                      {t('censo.search')}
                    </label>
                    <input
                      id="buscar"
                      className={styles.input}
                      type="search"
                      name="buscar"
                      defaultValue={q}
                      maxLength={200}
                      aria-describedby="buscar-hint"
                    />
                    <span id="buscar-hint" className={styles.hint}>
                      {t('censo.searchHint')}
                    </span>
                  </div>
                  <div className={styles.rowActions} data-wide="">
                    <button type="submit" className={styles.button}>
                      {t('censo.searchButton')}
                    </button>
                    {q === '' ? null : (
                      <Link className={styles.secondaryButton} href={censoHref('')}>
                        {t('censo.searchClear')}
                      </Link>
                    )}
                  </div>
                </form>
              ) : null}
              {census.queue.length === 0 ? (
                <p className={styles.text}>
                  {q === '' ? t('censo.queueNone') : t('censo.searchNone', { q })}
                </p>
              ) : (
                <ul className={onboarding.personList}>
                  {census.queue.map(({ person, link }) => {
                    const state = link === null ? undefined : linkState(link);
                    return (
                      <PersonItem
                        key={person.id}
                        person={person}
                        labels={labels}
                        action={
                          <CensusLinkPanel
                            personId={person.id}
                            name={personName(person.name, labels.noName)}
                            link={
                              link === null
                                ? null
                                : {
                                    line: linkText(link, linkWords),
                                    serves: state === 'new' || state === 'sent',
                                  }
                            }
                            messages={messages}
                            text={text}
                          />
                        }
                      />
                    );
                  })}
                </ul>
              )}
              {census.next === null && cursor === '' ? null : (
                <p className={styles.rowActions}>
                  {cursor === '' ? null : (
                    <Link className={styles.secondaryButton} href={censoHref(q)}>
                      {t('censo.firstPage')}
                    </Link>
                  )}
                  {census.next === null ? null : (
                    <Link className={styles.secondaryButton} href={censoHref(q, census.next)}>
                      {t('censo.nextPage')}
                    </Link>
                  )}
                </p>
              )}
            </>
          )}
        </section>
      </Announcer>
    </AppShell>
  );
};

export default CensusPage;
