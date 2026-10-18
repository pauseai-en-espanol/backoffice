import type { Metadata } from 'next';

import { fillMessage } from '@backoffice/domain/message-templates';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';
import { Fragment } from 'react';

import type { StaffRef } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { consentText } from '@/onboarding/census/format';
import * as census from '@/onboarding/census/styles';
import { ClaimButton } from '@/onboarding/ClaimButton';
import {
  getArrivalChannels,
  getMessageTemplates,
  getPerson,
  getSettings,
  isForbidden,
} from '@/onboarding/data';
import { formatDay, formatInstant, formatMadridDay } from '@/onboarding/format';
import { personName } from '@/onboarding/names';
import { Forbidden, OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { ArrivalForm } from '@/onboarding/person/Arrival';
import { EraseData } from '@/onboarding/person/Erase';
import { Identities } from '@/onboarding/person/Identities';
import { MergePanel } from '@/onboarding/person/Merge';
import { NextActionForm } from '@/onboarding/person/Notes';
import { PresenceActions } from '@/onboarding/person/Presence';
import { ProfileEditor } from '@/onboarding/person/ProfileEditor';
import { RecordActivity } from '@/onboarding/person/Record';
import { OwnerForm, StageForm } from '@/onboarding/person/StageOwner';
import { TeamAccount } from '@/onboarding/person/TeamAccount';
import { personPageText } from '@/onboarding/person/text';
import { type WhatsAppChoice, WhatsAppHandover } from '@/onboarding/person/WhatsApp';
import { MissingLine, NextAction, ReasonChips, StageTag, TeamTag } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, isAdmin } from '@/onboarding/text';
import { describeEvent } from '@/onboarding/timeline';
import { CONSENT_KINDS } from '@/onboarding/types';
import { greetingName, handoverLink, whatsappMessage } from '@/onboarding/whatsapp-message';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getPersonSuggestions, getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import { Disclosure } from '@/ui/Disclosure';
import { EditInPlace } from '@/ui/EditInPlace';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('people.title') };

/** How much of the history is in view; the rest is behind "Ver lo anterior". */
const RECENT_EVENTS = 10;

/**
 * A person (onboarding spec, views: Persona; PLAN R57), opened from the bot's "Abrir" too. Who they are heads it, with
 * what is done first: "Me lo quedo" and WhatsApp. Then, in the wider column, where they are (stage, owner and next
 * step, each changed where it is shown), what happened since (an attempt or a note, written above the history it
 * joins), and the history, its latest in view. Beside it, what is known, each edited in its own card: contact, the
 * profile, the community, the census; and what is done rarely, folded under "Más acciones": merging, the team account,
 * their data. A phone shows the same, one column, in that order. A tombstone (merged into another record) is shown as
 * such, read only, with a link to the record that stays.
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
  const admin = isAdmin(me);
  const [page, team, settings, arrivalChannels, templates, suggestions] = await Promise.all([
    getPerson(id),
    getTeam(),
    getSettings(),
    getArrivalChannels(),
    getMessageTemplates(),
    admin ? getPersonSuggestions() : Promise.resolve([]),
  ]);
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
  const channels = isUnavailable(arrivalChannels) ? [] : arrivalChannels;
  // The history by the day things happened (a date someone gave, else the day written), newest first (PLAN M5).
  const happened = (event: (typeof timeline)[number]) =>
    `${event.happenedOn ?? formatMadridDay(event.at)} ${event.at}`;
  const merged = person.mergedInto !== null;
  const anonymised = person.anonymisedAt !== null;
  const readOnly = merged || anonymised;
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
  // The welcome: the team's messages in use (Mensajes, PLAN M5), in their order, or else the code's own.
  const greeting = greetingName(person);
  const messages = isUnavailable(templates) ? [] : templates;
  const welcomes = messages.filter((template) => template.purpose === 'welcome' && template.active);
  const choices: WhatsAppChoice[] =
    welcomes.length === 0
      ? [
          {
            template: null,
            title: null,
            link: handoverLink(
              person,
              greeting === undefined
                ? whatsappMessage(text.whatsapp.messageNameless, { me: me.staff.displayName })
                : whatsappMessage(text.whatsapp.message, {
                    name: greeting,
                    me: me.staff.displayName,
                  }),
            ),
          },
        ]
      : welcomes.map((template) => ({
          template: { id: template.id, version: template.version },
          title: template.title,
          link: handoverLink(
            person,
            fillMessage(template, { nombre: greeting, yo: me.staff.displayName }),
          ),
        }));
  const templateTitle = (templateId: string) =>
    messages.find((template) => template.id === templateId)?.title;
  const open = person.presence.some((period) => period.leftOn === null);

  // What is known of them; their names are the page's heading already.
  const profileFacts = (
    <dl className={styles.facts}>
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
      {person.pronouns ? (
        <>
          <dt>{t('person.pronouns')}</dt>
          <dd>{person.pronouns}</dd>
        </>
      ) : null}
      {person.languages.length > 0 ? (
        <>
          <dt>{t('person.languages')}</dt>
          <dd>{person.languages.join(', ')}</dd>
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
    </dl>
  );

  // When and where from they signed up: one day, whatever the way in (PLAN R58).
  const arrivalFacts = (
    <dl className={styles.facts}>
      <dt>{t('person.arrivedOn')}</dt>
      <dd>{person.arrivedOn ? formatDay(person.arrivedOn) : t('person.arrivedOnUnknown')}</dd>
      <dt>{t('person.arrival')}</dt>
      <dd>{person.arrival?.label ?? t('person.arrivalNone')}</dd>
      {person.howHeard ? (
        <>
          <dt>{t('person.howHeard')}</dt>
          <dd>{person.howHeard}</dd>
        </>
      ) : null}
    </dl>
  );
  // Their time in the group after signing up, oldest first: the first stay began with it, so only what changed since
  // is told ("Salió…", "Volvió…").
  const stays = [...person.presence].reverse();
  const openStay = stays.find((stay) => stay.leftOn === null);
  const stayLines = stays.flatMap((stay, index) => [
    ...(index === 0
      ? []
      : [
          <li key={`${stay.id}-entrada`}>
            {stay.joinedOn
              ? t('person.stayBack', { date: formatDay(stay.joinedOn) })
              : t('person.stayBackUnknown')}
          </li>,
        ]),
    ...(stay.leftOn
      ? [
          <li key={`${stay.id}-salida`}>
            {t('person.stayLeft', { date: formatDay(stay.leftOn) })}
          </li>,
        ]
      : []),
  ]);

  // The history, newest first: the latest in view, the rest behind a button, so it never outgrows the page.
  const events = [...timeline].sort((a, b) =>
    happened(a) < happened(b) ? 1 : happened(a) > happened(b) ? -1 : 0,
  );
  const recent = events.slice(0, RECENT_EVENTS);
  const older = events.slice(RECENT_EVENTS);
  const eventItem = (event: (typeof timeline)[number]) => {
    const described = describeEvent(event, { t, staffName, templateTitle });
    const who = event.actor?.displayName ?? t('person.system');
    return (
      <li key={event.id}>
        <strong>{described.title}</strong>
        {event.happenedOn ? (
          <span className={styles.block}>
            <time dateTime={event.happenedOn}>
              {t('timeline.happened', { date: formatDay(event.happenedOn) })}
            </time>
          </span>
        ) : null}
        <span className={`${styles.block} ${styles.hint}`}>
          {who}
          {event.channel === 'bot' ? ` ${t('person.viaBot')}` : ''} ·{' '}
          {event.happenedOn ? (
            <time dateTime={event.at}>
              {t('timeline.recorded', { date: formatInstant(event.at) })}
            </time>
          ) : (
            <time dateTime={event.at}>{formatInstant(event.at)}</time>
          )}
        </span>
        {described.detail ? <p className={onboarding.timelineBody}>{described.detail}</p> : null}
      </li>
    );
  };
  const stageTag = <StageTag stage={person.stage} label={text.stages[person.stage]} />;
  const ownerName = person.owner?.displayName ?? t('person.noOwner');
  const nextAction = (
    <NextAction text={person.nextAction} due={person.nextActionDue} labels={text.labels} />
  );

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
        <div className={onboarding.personHeader}>
          <div className={onboarding.personHeading}>
            <h1 className={styles.h1}>{shown.name}</h1>
            {person.fullName === null || person.name === person.fullName ? null : (
              <p className={styles.muted}>{person.fullName}</p>
            )}
            {person.summary ? <p className={onboarding.summary}>{person.summary}</p> : null}
            <MissingLine missing={person.missing} labels={text.labels} />
            <ul className={onboarding.meta}>
              <li>{open ? t('person.inCommunity') : t('person.notInCommunity')}</li>
              {person.team ? (
                <li>
                  <TeamTag team={person.team} labels={text.labels} />{' '}
                  {t('person.teamAccount.linkedTo', { name: person.team.displayName })}
                  {person.team.active ? null : ` ${t('person.teamAccount.inactive')}`}
                </li>
              ) : null}
            </ul>
            <ReasonChips reasons={person.reasons} labels={text.labels} />
          </div>
          {readOnly ? null : (
            <div className={onboarding.personActions}>
              {/* "Me lo quedo" takes someone on to welcome them: never someone gone or discarded, whose owner is
                  changed below (claim_person refuses them). */}
              {person.owner === null && person.stage !== 'left' && person.stage !== 'discarded' ? (
                <ClaimButton
                  personId={person.id}
                  text={{
                    label: t('person.claim'),
                    visible: t('person.claim'),
                    claimed: t('today.claimed', { name: shown.name }),
                    taken: t('today.claimTaken', { name: shown.name }),
                    errors: text.errors,
                  }}
                />
              ) : null}
              {choices[0]?.link === undefined ? null : (
                <WhatsAppHandover personId={person.id} choices={choices} text={text} />
              )}
            </div>
          )}
        </div>
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
            <section className={onboarding.section} aria-labelledby="seguimiento">
              <h2 id="seguimiento" className={styles.h3}>
                {t('person.followUp')}
              </h2>
              <dl className={onboarding.followUp}>
                <dt>{t('person.stageLabel')}</dt>
                <dd>
                  {readOnly ? (
                    stageTag
                  ) : (
                    <EditInPlace label={t('person.changeStage')} view={stageTag}>
                      <StageForm person={person} text={text} />
                    </EditInPlace>
                  )}
                </dd>
                <dt>{t('person.owner')}</dt>
                <dd>
                  {readOnly ? (
                    ownerName
                  ) : (
                    <EditInPlace label={t('person.changeOwner')} view={ownerName}>
                      <OwnerForm person={person} team={owners} text={text} />
                    </EditInPlace>
                  )}
                </dd>
                <dt>{t('person.nextAction')}</dt>
                <dd>
                  {readOnly ? (
                    nextAction
                  ) : (
                    <EditInPlace
                      label={
                        person.nextAction === null
                          ? t('person.addNextAction')
                          : t('person.changeNextAction')
                      }
                      view={nextAction}
                    >
                      <NextActionForm person={person} text={text} />
                    </EditInPlace>
                  )}
                </dd>
              </dl>
            </section>

            {readOnly ? null : (
              <section className={onboarding.section} aria-labelledby="registrar">
                <h2 id="registrar" className={styles.h3}>
                  {t('person.recordTitle')}
                </h2>
                <RecordActivity personId={person.id} text={text} />
              </section>
            )}

            <section className={onboarding.section} aria-labelledby="historia">
              <h2 id="historia" className={styles.h3}>
                {t('person.timeline')}
              </h2>
              {events.length === 0 ? (
                <p className={styles.hint}>{t('person.timelineNone')}</p>
              ) : (
                <ol className={onboarding.timeline}>{recent.map(eventItem)}</ol>
              )}
              {older.length === 0 ? null : (
                <Disclosure
                  id="historia-anterior"
                  label={t('person.timelineOlder', { count: older.length })}
                >
                  <ol className={onboarding.timeline}>{older.map(eventItem)}</ol>
                </Disclosure>
              )}
            </section>
          </div>

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

            <section className={onboarding.section} aria-labelledby="perfil">
              <h2 id="perfil" className={styles.h3}>
                {t('person.profile')}
              </h2>
              {readOnly ? (
                profileFacts
              ) : (
                <EditInPlace label={t('person.editProfile')} view={profileFacts} below>
                  <ProfileEditor person={person} text={text} />
                </EditInPlace>
              )}
            </section>

            <section className={onboarding.section} aria-labelledby="alta">
              <h2 id="alta" className={styles.h3}>
                {t('person.arrivalTitle')}
              </h2>
              {readOnly ? (
                arrivalFacts
              ) : (
                <EditInPlace label={t('person.changeArrival')} view={arrivalFacts} below>
                  <ArrivalForm person={person} channels={channels} text={text} />
                </EditInPlace>
              )}
              {stays.length === 0 ? (
                <p className={styles.hint}>{t('person.stayNever')}</p>
              ) : (
                <ul className={onboarding.personList}>
                  {stayLines}
                  {openStay ? (
                    <li>
                      {t('person.stayIn')}
                      {openStay.chat ? ` · ${t('person.chat')}: ${openStay.chat}` : ''}
                    </li>
                  ) : null}
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
              <Disclosure id="consentimientos" label={t('person.showConsents')}>
                <dl className={styles.facts}>
                  {CONSENT_KINDS.map((kind) => (
                    <Fragment key={kind}>
                      <dt>{t(`person.consentKinds.${kind}`)}</dt>
                      <dd>{consentText(person.consents[kind], consentWords)}</dd>
                    </Fragment>
                  ))}
                </dl>
              </Disclosure>
            </section>

            {readOnly ? null : (
              <section className={onboarding.section} aria-labelledby="mas">
                <h2 id="mas" className={styles.h3}>
                  {t('person.more')}
                </h2>
                <Disclosure id="fusionar" label={t('person.mergeTitle')}>
                  <MergePanel person={shown} text={text} />
                </Disclosure>
                {admin ? (
                  <Disclosure id="cuenta-del-equipo" label={t('person.teamAccount.title')}>
                    <TeamAccount
                      personId={person.id}
                      linked={person.team}
                      accounts={members
                        .filter((member) => member.personId === null)
                        .map(({ userId, displayName }) => ({
                          userId,
                          displayName,
                          suggested:
                            !isUnavailable(suggestions) &&
                            suggestions.some(
                              (suggestion) =>
                                suggestion.userId === userId && suggestion.person.id === person.id,
                            ),
                        }))}
                      text={{
                        linkedTo: String(t.raw('person.teamAccount.linkedTo')),
                        inactive: t('person.teamAccount.inactive'),
                        hint: t('person.teamAccount.hint'),
                        account: t('person.teamAccount.account'),
                        sameEmail: t('person.teamAccount.sameEmail'),
                        link: t('person.teamAccount.link'),
                        linked: t('person.teamAccount.linked'),
                        unlink: t('person.teamAccount.unlink'),
                        unlinked: t('person.teamAccount.unlinked'),
                        noAccounts: t('person.teamAccount.noAccounts'),
                        errors: text.errors,
                      }}
                    />
                  </Disclosure>
                ) : null}
                {admin ? (
                  <Disclosure id="sus-datos" label={t('person.rights')}>
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
                          question: t('person.eraseQuestion', {
                            name: shown.fullName ?? shown.name,
                          }),
                          understand: t('person.eraseUnderstand'),
                          confirm: t('person.eraseConfirm'),
                          cancel: t('person.cancel'),
                          done: t('person.erased'),
                          errors: { ...text.errors, stale: t('person.eraseAlready') },
                        }}
                      />
                    </div>
                  </Disclosure>
                ) : null}
              </section>
            )}
          </div>
        </div>
      </Announcer>
    </AppShell>
  );
};

export default PersonPage;
