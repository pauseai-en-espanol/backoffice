import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import { CensusLinkPanel, type CensusLinkText } from '@/onboarding/census/CensusLinkPanel';
import { CopyLink } from '@/onboarding/census/CopyLink';
import { censusUrl, getCensus } from '@/onboarding/census/data';
import { linkState, linkText, progressOf, textBar } from '@/onboarding/census/format';
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

/**
 * Censo (census spec): how many people have completed their profile, the generic link to publish, and the people
 * still to answer, oldest first, each with a personal link to make and send from the onboarder's own WhatsApp.
 */
const CensusPage = async () => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const census = await getCensus();
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
    whatsappIntro: t('censo.whatsappIntro'),
    noPhone: t('censo.noPhone'),
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
          ) : census.queue.length === 0 ? (
            <p className={styles.text}>{t('censo.queueNone')}</p>
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
                        text={text}
                      />
                    }
                  />
                );
              })}
            </ul>
          )}
        </section>
      </Announcer>
    </AppShell>
  );
};

export default CensusPage;
