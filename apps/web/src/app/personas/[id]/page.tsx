import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { Fragment } from 'react';

import type { StaffRef } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { consentText } from '@/onboarding/census/format';
import * as census from '@/onboarding/census/styles';
import { getPerson, getSettings, isForbidden } from '@/onboarding/data';
import { formatDay, formatInstant } from '@/onboarding/format';
import { personName } from '@/onboarding/names';
import { Forbidden, OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { EraseData } from '@/onboarding/person/Erase';
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
import { canOnboard, isAdmin, sourceName } from '@/onboarding/text';
import { describeEvent } from '@/onboarding/timeline';
import { CONSENT_KINDS } from '@/onboarding/types';
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
  const anonymised = person.anonymisedAt !== null;
  const readOnly = merged || anonymised;
  const admin = isAdmin(me);
  const consentWords = {
    granted: String(t.raw('person.consentGranted')),
    denied: String(t.raw('person.consentDenied')),
    never: t('person.consentNever'),
  };
  const chosen = (kind: 'skill' | 'interest', other: string | null) => {
    const labels = person.options
      .filter((option) => option.kind === kind)
      .map((option) => option.label);
    return other ? [...labels, t('person.otherOption', { text: other })] : labels;
  };
  // "Sin nombre" for someone saved with only a phone (PLAN R37), who is greeted without one.
  const shown = { ...person, name: personName(person.name, t('people.noName')) };
  const greeting = greetingName(person);
  const link = handoverLink(
    person,
    greeting === undefined
      ? whatsappMessage(text.whatsapp.messageNameless, { me: me.staff.displayName })
      : whatsappMessage(text.whatsapp.message, { name: greeting, me: me.staff.displayName }),
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
        {anonymised ? <p className={styles.notice}>{t('person.anonymised')}</p> : null}
        <h1 className={styles.h1}>{shown.name}</h1>
        {person.fullName === null || person.name === person.fullName ? null : (
          <p className={styles.text}>{person.fullName}</p>
        )}
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
              {readOnly ? (
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
            {readOnly ? null : (
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
                  <StageOwner person={shown} team={owners} text={text} />
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
                <dd>{shown.fullName ?? t('people.noName')}</dd>
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
              </dl>
              {readOnly ? null : <ProfileEditor person={person} text={text} />}
            </section>

            <section className={onboarding.section} aria-labelledby="censo">
              <h2 id="censo" className={styles.h3}>
                {t('person.census')}
              </h2>
              <p className={styles.hint}>
                {person.profileCompletedAt
                  ? t('person.profileCompleted', { date: formatInstant(person.profileCompletedAt) })
                  : t('person.censusNone')}
              </p>
              <dl className={styles.facts}>
                {(
                  [
                    ['skill', t('person.skills'), person.skillsOther],
                    ['interest', t('person.interests'), person.interestsOther],
                  ] as const
                ).map(([kind, label, other]) => {
                  const items = chosen(kind, other);
                  return (
                    <Fragment key={kind}>
                      <dt>{label}</dt>
                      <dd>
                        {items.length === 0 ? (
                          t('person.noOptions')
                        ) : (
                          <ul className={census.bullets}>
                            {items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </Fragment>
                  );
                })}
              </dl>
              <h3 className={styles.h3}>{t('person.consents')}</h3>
              <dl className={styles.facts}>
                {CONSENT_KINDS.map((kind) => (
                  <Fragment key={kind}>
                    <dt>{t(`person.consentKinds.${kind}`)}</dt>
                    <dd>{consentText(person.consents[kind], consentWords)}</dd>
                  </Fragment>
                ))}
              </dl>
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
              {readOnly ? null : (
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

            {readOnly ? null : (
              <section className={onboarding.section} aria-labelledby="fusionar">
                <h2 id="fusionar" className={styles.h3}>
                  {t('person.mergeTitle')}
                </h2>
                <MergePanel person={shown} text={text} />
              </section>
            )}

            {admin && !readOnly ? (
              <section className={onboarding.section} aria-labelledby="sus-datos">
                <h2 id="sus-datos" className={styles.h3}>
                  {t('person.rights')}
                </h2>
                <div className={styles.form}>
                  <p className={styles.hint}>{t('person.rightsIntro')}</p>
                  <div>
                    <a
                      className={styles.secondaryButton}
                      href={`/api/people/${encodeURIComponent(person.id)}/export`}
                      download
                      aria-describedby="exportar-pista"
                    >
                      {t('person.export')}
                    </a>
                    <p id="exportar-pista" className={styles.hint}>
                      {t('person.exportHint')}
                    </p>
                  </div>
                  <EraseData
                    personId={person.id}
                    text={{
                      erase: t('person.erase'),
                      question: t('person.eraseQuestion', { name: shown.fullName ?? shown.name }),
                      understand: t('person.eraseUnderstand'),
                      confirm: t('person.eraseConfirm'),
                      cancel: t('person.cancel'),
                      done: t('person.erased'),
                      errors: { ...text.errors, stale: t('person.eraseAlready') },
                    }}
                  />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </Announcer>
    </AppShell>
  );
};

export default PersonPage;
