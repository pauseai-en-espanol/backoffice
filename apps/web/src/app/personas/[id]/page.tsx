import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import type { StaffRef } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { getPerson, getSettings, isForbidden } from '@/onboarding/data';
import { formatDay, formatInstant } from '@/onboarding/format';
import { Forbidden, OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { Identities } from '@/onboarding/person/Identities';
import { MergePanel } from '@/onboarding/person/Merge';
import { AttemptForm, NextActionForm, NoteForm } from '@/onboarding/person/Notes';
import { PresenceActions } from '@/onboarding/person/Presence';
import { ProfileEditor } from '@/onboarding/person/ProfileEditor';
import { StageOwner } from '@/onboarding/person/StageOwner';
import { personPageText } from '@/onboarding/person/text';
import { WhatsAppHandover } from '@/onboarding/person/WhatsApp';
import { NextAction, ReasonChips, StageTag } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, sourceName } from '@/onboarding/text';
import { describeEvent } from '@/onboarding/timeline';
import { greetingName, handoverLink, whatsappMessage } from '@/onboarding/whatsapp-message';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('people.title') };

/**
 * A person (onboarding spec, views: Persona): what the onboarder needs to act first (contact, WhatsApp, stage and
 * owner, next action, a contact attempt or a note), then the profile, the community, the history that lets anyone
 * pick them up, and merging. A tombstone (merged into another record) is shown as such, read only, with a link to the
 * record that stays.
 */
const PersonPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const { id } = await params;
  const [page, team, settings] = await Promise.all([getPerson(id), getTeam(), getSettings()]);
  if (isForbidden(page)) {
    return (
      <AppShell me={me}>
        <Forbidden />
      </AppShell>
    );
  }
  if (isUnavailable(page)) {
    return (
      <AppShell me={me}>
        <h1 className={styles.h1}>{t('web.unavailable.title')}</h1>
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      </AppShell>
    );
  }

  const { person, timeline } = page;
  const text = personPageText(t);
  const members = isUnavailable(team) ? [] : team.staff;
  const staffName = (userId: string) =>
    members.find((member) => member.userId === userId)?.displayName;
  const owners: StaffRef[] = members
    .filter(
      (member) =>
        member.active && (member.roles.includes('onboarding') || member.roles.includes('admin')),
    )
    .map(({ userId, displayName }) => ({ userId, displayName }));
  const chats = isUnavailable(settings) ? [] : settings.communityChats;
  const merged = person.mergedInto !== null;
  const link = handoverLink(
    person,
    whatsappMessage(text.whatsapp.message, {
      name: greetingName(person),
      me: me.staff.displayName,
    }),
  );
  const open = person.presence.some((period) => period.leftOn === null);

  const reporter = (value: StaffRef | string | null): string | undefined =>
    value === null ? undefined : typeof value === 'string' ? staffName(value) : value.displayName;

  return (
    <AppShell me={me}>
      <Announcer>
        <p>
          <Link className={styles.link} href="/personas">
            {t('person.back')}
          </Link>
        </p>
        {person.id === id ? null : <p className={styles.notice}>{t('person.tombstoneNotice')}</p>}
        <h1 className={styles.h1}>{person.name}</h1>
        {person.name === person.fullName ? null : <p className={styles.text}>{person.fullName}</p>}
        <ul className={onboarding.meta}>
          <li>
            <StageTag label={text.stages[person.stage]} />
          </li>
          <li>
            {t('person.owner')}: {person.owner?.displayName ?? t('person.noOwner')}
          </li>
          <li>{open ? t('person.inCommunity') : t('person.notInCommunity')}</li>
        </ul>
        <p>
          <span className={styles.muted}>{t('person.nextAction')}: </span>
          <NextAction text={person.nextAction} due={person.nextActionDue} labels={text.labels} />
        </p>
        <ReasonChips reasons={person.reasons} labels={text.labels} />
        {merged ? (
          <p className={styles.notice}>
            {t('person.merged')}{' '}
            <Link
              className={styles.link}
              href={`/personas/${encodeURIComponent(person.mergedInto ?? '')}`}
            >
              {t('person.mergedInto')}
            </Link>
          </p>
        ) : null}

        <div className={onboarding.personPage}>
          <div>
            <section className={onboarding.section} aria-labelledby="contacto">
              <h2 id="contacto" className={styles.h3}>
                {t('person.identities')}
              </h2>
              {person.identities.length === 0 ? (
                <p className={styles.hint}>{t('person.noIdentities')}</p>
              ) : null}
              {merged ? (
                <ul className={onboarding.personList}>
                  {person.identities.map((identity) => (
                    <li key={identity.id} className={styles.breakAnywhere}>
                      {text.identityKinds[identity.kind]}: {identity.value}
                    </li>
                  ))}
                </ul>
              ) : (
                <Identities personId={person.id} identities={person.identities} text={text} />
              )}
            </section>
            {merged ? null : (
              <>
                <section className={onboarding.section} aria-labelledby="whatsapp">
                  <h2 id="whatsapp" className={styles.h3}>
                    {t('person.whatsappTitle')}
                  </h2>
                  <WhatsAppHandover personId={person.id} link={link} text={text} />
                </section>
                <section className={onboarding.section} aria-labelledby="etapa">
                  <h2 id="etapa" className={styles.h3}>
                    {t('person.stageTitle')}
                  </h2>
                  <StageOwner person={person} team={owners} text={text} />
                </section>
                <section className={onboarding.section} aria-labelledby="siguiente">
                  <h2 id="siguiente" className={styles.h3}>
                    {t('person.nextActionTitle')}
                  </h2>
                  <NextActionForm person={person} text={text} />
                </section>
                <section className={onboarding.section} aria-labelledby="intento">
                  <h2 id="intento" className={styles.h3}>
                    {t('person.attemptTitle')}
                  </h2>
                  <AttemptForm personId={person.id} text={text} />
                </section>
                <section className={onboarding.section} aria-labelledby="nota">
                  <h2 id="nota" className={styles.h3}>
                    {t('person.noteTitle')}
                  </h2>
                  <NoteForm personId={person.id} text={text} />
                </section>
              </>
            )}
          </div>

          <div>
            <section className={onboarding.section} aria-labelledby="perfil">
              <h2 id="perfil" className={styles.h3}>
                {t('person.profile')}
              </h2>
              <dl className={styles.facts}>
                <dt>{t('person.fullName')}</dt>
                <dd>{person.fullName}</dd>
                {person.preferredName ? (
                  <>
                    <dt>{t('person.preferredName')}</dt>
                    <dd>{person.preferredName}</dd>
                  </>
                ) : null}
                {person.province ? (
                  <>
                    <dt>{t('person.province')}</dt>
                    <dd>{person.province}</dd>
                  </>
                ) : null}
                {person.town ? (
                  <>
                    <dt>{t('person.town')}</dt>
                    <dd>{person.town}</dd>
                  </>
                ) : null}
                {person.languages.length > 0 ? (
                  <>
                    <dt>{t('person.languages')}</dt>
                    <dd>{person.languages.join(', ')}</dd>
                  </>
                ) : null}
                {person.pronouns ? (
                  <>
                    <dt>{t('person.pronouns')}</dt>
                    <dd>{person.pronouns}</dd>
                  </>
                ) : null}
                {person.availability ? (
                  <>
                    <dt>{t('person.availability')}</dt>
                    <dd>
                      {(text.availability as Record<string, string>)[person.availability] ??
                        person.availability}
                    </dd>
                  </>
                ) : null}
                {person.howHeard ? (
                  <>
                    <dt>{t('person.howHeard')}</dt>
                    <dd>{person.howHeard}</dd>
                  </>
                ) : null}
                {person.sources.length > 0 ? (
                  <>
                    <dt>{t('person.sources')}</dt>
                    <dd>
                      <ul className={onboarding.meta}>
                        {person.sources.map((source) => {
                          const by = reporter(source.reportedBy);
                          return (
                            <li key={source.source}>
                              {sourceName(t, source.source)}
                              {source.firstSeenAt ? ` · ${formatInstant(source.firstSeenAt)}` : ''}
                              {by ? ` · ${by}` : ''}
                            </li>
                          );
                        })}
                      </ul>
                    </dd>
                  </>
                ) : null}
                {person.profileCompletedAt ? (
                  <>
                    <dt>{t('person.profile')}</dt>
                    <dd>
                      {t('person.profileCompleted', {
                        date: formatInstant(person.profileCompletedAt),
                      })}
                    </dd>
                  </>
                ) : null}
              </dl>
              {merged ? null : <ProfileEditor person={person} text={text} />}
            </section>

            <section className={onboarding.section} aria-labelledby="comunidad">
              <h2 id="comunidad" className={styles.h3}>
                {t('person.presence')}
              </h2>
              {person.presence.length === 0 ? (
                <p className={styles.hint}>{t('person.presenceNone')}</p>
              ) : (
                <ul className={onboarding.personList}>
                  {person.presence.map((period) => (
                    <li key={period.id}>
                      {period.joinedOn
                        ? t('person.joinedOn', { date: formatDay(period.joinedOn) })
                        : t('person.joinedUnknown')}
                      {period.leftOn
                        ? `, ${t('person.leftOn', { date: formatDay(period.leftOn) })}`
                        : ''}
                      {period.chat ? ` · ${t('person.chat')}: ${period.chat}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {merged ? null : (
                <PresenceActions
                  personId={person.id}
                  inCommunity={open}
                  chats={chats}
                  text={text}
                />
              )}
            </section>

            <section className={onboarding.section} aria-labelledby="historia">
              <h2 id="historia" className={styles.h3}>
                {t('person.timeline')}
              </h2>
              {timeline.length === 0 ? (
                <p className={styles.hint}>{t('person.timelineNone')}</p>
              ) : (
                <ol className={onboarding.timeline} reversed>
                  {[...timeline]
                    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
                    .map((event) => {
                      const described = describeEvent(event, { t, staffName });
                      const who = event.actor?.displayName ?? t('person.system');
                      return (
                        <li key={event.id}>
                          <strong>{described.title}</strong>
                          <span className={`${styles.block} ${styles.hint}`}>
                            {who}
                            {event.channel === 'bot' ? ` ${t('person.viaBot')}` : ''} ·{' '}
                            <time dateTime={event.at}>{formatInstant(event.at)}</time>
                          </span>
                          {described.detail ? (
                            <p className={onboarding.timelineBody}>{described.detail}</p>
                          ) : null}
                        </li>
                      );
                    })}
                </ol>
              )}
            </section>

            {merged ? null : (
              <section className={onboarding.section} aria-labelledby="fusionar">
                <h2 id="fusionar" className={styles.h3}>
                  {t('person.mergeTitle')}
                </h2>
                <MergePanel person={person} text={text} />
              </section>
            )}
          </div>
        </div>
      </Announcer>
    </AppShell>
  );
};

export default PersonPage;
