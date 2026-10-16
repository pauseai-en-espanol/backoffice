import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { ClaimText } from '@/onboarding/ClaimButton';
import type { PersonSummary } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { ClaimButton } from '@/onboarding/ClaimButton';
import { getToday } from '@/onboarding/data';
import { personName } from '@/onboarding/names';
import { PersonItem } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, onboardingErrors, personLabels } from '@/onboarding/text';
import { unassignedQueue } from '@/onboarding/today';
import { canOutreach } from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.home.title') };

/**
 * Hoy (onboarding spec, views): where signing in ends. The staff member's people needing attention, each with why,
 * then the unassigned queue, its ten oldest with "Me lo quedo" and a link to all of them in Personas (PLAN M5). Staff
 * without the onboarding role see the team and their settings from here.
 */
const Today = async () => {
  const me = await requireStaff();
  const admin = me.staff.roles.includes('admin');
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <h1 className={styles.h1}>{t('web.home.title')}</h1>
        <p className={styles.text}>{t('web.home.greeting', { name: me.staff.displayName })}</p>
        <p className={styles.text}>{t('web.home.notOnboarding')}</p>
        <ul className={styles.linkList}>
          {canOutreach(me) ? (
            <li>
              <Link className={styles.link} href="/siguiente">
                {t('web.home.toNext')}
              </Link>
            </li>
          ) : null}
          <li>
            <Link className={styles.link} href="/equipo">
              {t('web.home.toTeam')}
            </Link>
          </li>
          {admin ? (
            <li>
              <Link className={styles.link} href="/registro">
                {t('web.home.toAudit')}
              </Link>
            </li>
          ) : null}
        </ul>
      </AppShell>
    );
  }

  const today = await getToday();
  const errors = onboardingErrors(t);
  const labels = personLabels(t);
  const claimText = (person: PersonSummary): ClaimText => {
    const name = personName(person.name, labels.noName);
    return {
      label: t('today.claimFor', { name }),
      visible: t('today.claim'),
      claimed: t('today.claimed', { name }),
      taken: t('today.claimTaken', { name }),
      errors,
    };
  };

  const queue = isUnavailable(today)
    ? undefined
    : unassignedQueue(today.unassigned, today.counts.unassigned);

  return (
    <AppShell me={me} bandeja={isUnavailable(today) ? undefined : today.counts.bandeja}>
      <h1 className={styles.h1}>{t('web.home.title')}</h1>
      <p className={styles.text}>{t('web.home.greeting', { name: me.staff.displayName })}</p>
      {isUnavailable(today) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : (
        <Announcer>
          <p className={styles.text}>
            {t('today.counts', {
              mine: today.counts.mine,
              unassigned: today.counts.unassigned,
            })}
          </p>
          {today.counts.bandeja > 0 ? (
            <p className={styles.notice}>
              {t('today.bandeja', { count: today.counts.bandeja })}{' '}
              <Link className={styles.link} href="/bandeja">
                {t('today.toBandeja')}
              </Link>
            </p>
          ) : null}
          <section aria-labelledby="mias">
            <h2 id="mias" className={styles.h2}>
              {t('today.mine')}
            </h2>
            <p className={styles.text}>{t('today.mineIntro')}</p>
            {today.mine.length === 0 ? (
              <p className={styles.text}>{t('today.mineNone')}</p>
            ) : (
              <ul className={onboarding.personList}>
                {today.mine.map((person) => (
                  <PersonItem key={person.id} person={person} labels={labels} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="libres">
            <h2 id="libres" className={styles.h2}>
              {t('today.unassigned')}
            </h2>
            <p className={styles.text}>{t('today.unassignedIntro')}</p>
            {queue === undefined || queue.shown.length === 0 ? (
              <p className={styles.text}>{t('today.unassignedNone')}</p>
            ) : (
              <ul className={onboarding.personList}>
                {queue.shown.map((person) => (
                  <PersonItem
                    key={person.id}
                    person={person}
                    labels={labels}
                    showSources
                    action={<ClaimButton personId={person.id} text={claimText(person)} />}
                  />
                ))}
              </ul>
            )}
            {queue?.more === undefined ? null : (
              <p className={styles.text}>
                <Link className={styles.link} href={queue.more.href}>
                  {t('today.seeAllUnassigned', { count: queue.more.count })}
                </Link>
              </p>
            )}
          </section>
          <p>
            <Link className={styles.secondaryButton} href="/anadir">
              {t('today.add')}
            </Link>
          </p>
        </Announcer>
      )}
    </AppShell>
  );
};

export default Today;
