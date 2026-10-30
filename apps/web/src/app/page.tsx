import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { ClaimText } from '@/onboarding/ClaimButton';
import type { PersonSummary } from '@/onboarding/types';

import { canReadBooks } from '@/accounting/text';
import { isUnavailable } from '@/data';
import { ClaimButton } from '@/onboarding/ClaimButton';
import { getToday } from '@/onboarding/data';
import { personName } from '@/onboarding/names';
import { PersonItem, StageTag } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, onboardingErrors, personLabels } from '@/onboarding/text';
import { mineLinks, unassignedQueue } from '@/onboarding/today';
import { canOutreach } from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import { Icon } from '@/ui/Icon';
import { icons } from '@/ui/icons';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('web.home.title') };

/**
 * Hoy (onboarding spec, views): where signing in ends. The staff member's people needing attention, each with why,
 * most urgent first, and a link to all of theirs (PLAN R70); then the unassigned queue, its ten oldest with "Me lo
 * quedo" and a link to all of them in Personas (PLAN M5). Staff without the onboarding role see the team and their
 * settings from here.
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
          {canReadBooks(me) ? (
            <li>
              <Link className={styles.link} href="/cuentas">
                {t('web.home.toBooks')}
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
  // "Ver las N que necesitan algo" only when Hoy got fewer of them than it counted (PLAN R70, R79).
  const mine = isUnavailable(today)
    ? undefined
    : mineLinks(today.mine.filter((person) => person.reasons.length > 0).length, today.counts.mine);

  return (
    <AppShell me={me} bandeja={isUnavailable(today) ? undefined : today.counts.bandeja}>
      <h1 className={styles.h1}>{t('web.home.title')}</h1>
      <p className={styles.text}>{t('web.home.greeting', { name: me.staff.displayName })}</p>
      {isUnavailable(today) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : (
        <Announcer>
          {/* Two figures, read at a glance (PLAN R66): each number above its words, which a reader hears first. */}
          <dl className={onboarding.figures}>
            <div>
              <dt>{t('today.figureMine')}</dt>
              <dd>{today.counts.mine}</dd>
            </div>
            <div data-tone={today.counts.unassigned > 0 ? 'attention' : undefined}>
              <dt>{t('today.figureUnassigned')}</dt>
              <dd>{today.counts.unassigned}</dd>
            </div>
          </dl>
          {today.counts.bandeja > 0 ? (
            <p>
              <Link className={onboarding.statusLink} href="/bandeja">
                <Icon icon={icons.inbox} size={16} />
                {t('today.bandejaChip', { count: today.counts.bandeja })}
              </Link>
            </p>
          ) : null}
          {today.recent.length === 0 ? null : (
            <section aria-labelledby="recientes">
              <h2 id="recientes" className={styles.h2}>
                {t('today.recent')}
              </h2>
              <p className={styles.text}>{t('today.recentIntro')}</p>
              <ul className={onboarding.recentList}>
                {today.recent.map((person) => (
                  <li key={person.id}>
                    <Link
                      className={styles.link}
                      href={`/personas/${encodeURIComponent(person.id)}`}
                    >
                      {personName(person.name, labels.noName)}
                    </Link>
                    <StageTag label={labels.stages[person.stage]} stage={person.stage} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="mias">
            <h2 id="mias" className={styles.h2}>
              {t('today.mine')}
            </h2>
            <p className={styles.text}>{t('today.mineIntro')}</p>
            {today.mine.length === 0 ? (
              <p className={styles.text}>{t('today.mineNone')}</p>
            ) : (
              <ul className={onboarding.personGrid}>
                {today.mine.map((person) => (
                  <PersonItem key={person.id} person={person} labels={labels} />
                ))}
              </ul>
            )}
            {mine === undefined ? null : (
              <ul className={styles.linkList}>
                {mine.pending === undefined ? null : (
                  <li>
                    <Link className={styles.link} href={mine.pending.href}>
                      {t('today.seeMinePending', { count: mine.pending.count })}
                    </Link>
                  </li>
                )}
                <li>
                  <Link className={styles.link} href={mine.all}>
                    {t('today.seeAllMine')}
                  </Link>
                </li>
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
              <ul className={onboarding.personGrid}>
                {queue.shown.map((person) => (
                  <PersonItem
                    key={person.id}
                    person={person}
                    labels={labels}
                    showArrival
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
