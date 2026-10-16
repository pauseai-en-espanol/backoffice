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
import { EraseData } from '@/onboarding/person/Erase';
import { Identities } from '@/onboarding/person/Identities';
import { MergePanel } from '@/onboarding/person/Merge';
import { AttemptForm, NextActionForm, NoteForm } from '@/onboarding/person/Notes';
import { PresenceActions } from '@/onboarding/person/Presence';
import { ProfileEditor } from '@/onboarding/person/ProfileEditor';
import { StageOwner } from '@/onboarding/person/StageOwner';
import { TeamAccount } from '@/onboarding/person/TeamAccount';
import { personPageText } from '@/onboarding/person/text';
import { type WhatsAppChoice, WhatsAppHandover } from '@/onboarding/person/WhatsApp';
import { MissingLine, NextAction, ReasonChips, StageTag, TeamTag } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, isAdmin, sourceName } from '@/onboarding/text';
import { describeEvent } from '@/onboarding/timeline';
import { CONSENT_KINDS } from '@/onboarding/types';
import { greetingName, handoverLink, whatsappMessage } from '@/onboarding/whatsapp-message';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getPersonSuggestions, getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import { Disclosure } from '@/ui/Disclosure';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('people.title') };

/**
 * A person (onboarding spec, views: Persona), led by what is done most, which is what a phone shows first, opened
 * from the bot's "Abrir" (PLAN M5): "Me lo quedo" by the owner line, then the quick actions (WhatsApp, the stage and
 * the owner), the next step, and a contact attempt or a note behind their buttons. Then what is known: contact (adding
 * another phone or email folded), the profile, the census, the community, the history that lets anyone pick them up,
 * and merging. A tombstone (merged into another record) is shown as such, read only, with a link to the record that
 * stays.
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
        {person.summary ? <p className={onboarding.summary}>{person.summary}</p> : null}
        <MissingLine missing={person.missing} labels={text.labels} />
        <ul className={onboarding.meta}>
          <li>
            <StageTag label={text.stages[person.stage]} />
          </li>
          <li>
            {t('person.owner')}: {person.owner?.displayName ?? t('person.noOwner')}
          </li>
          {person.owner === null && !readOnly ? (
            <li>
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
            </li>
          ) : null}
          <li>{open ? t('person.inCommunity') : t('person.notInCommunity')}</li>
          {person.team ? (
            <li>
              <TeamTag team={person.team} labels={text.labels} />{' '}
              {t('person.teamAccount.linkedTo', { name: person.team.displayName })}
              {person.team.active ? null : ` ${t('person.teamAccount.inactive')}`}
            </li>
          ) : null}
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
          {readOnly ? null : (
            <div>
              <section className={onboarding.section} aria-labelledby="acciones">
                <h2 id="acciones" className={styles.h3}>
                  {t('person.quickTitle')}
                </h2>
                {choices[0]?.link === undefined ? null : (
                  <WhatsAppHandover personId={person.id} choices={choices} text={text} />
                )}
                <StageOwner person={shown} team={owners} text={text} />
              </section>
              <section className={onboarding.section} aria-labelledby="siguiente">
                <h2 id="siguiente" className={styles.h3}>
                  {t('person.nextActionTitle')}
                </h2>
                <NextActionForm person={person} text={text} />
              </section>
              <section className={onboarding.section} aria-labelledby="registrar">
                <h2 id="registrar" className={styles.h3}>
                  {t('person.recordTitle')}
                </h2>
                <Disclosure id="registrar-intento" label={t('person.attemptTitle')}>
                  <AttemptForm personId={person.id} text={text} />
                </Disclosure>
                <Disclosure id="registrar-nota" label={t('person.noteTitle')}>
                  <NoteForm personId={person.id} text={text} />
                </Disclosure>
              </section>
            </div>
          )}

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
                <dt>{t('person.arrivedOn')}</dt>
                <dd>
                  {person.arrivedOn ? formatDay(person.arrivedOn) : t('person.arrivedOnUnknown')}
                </dd>
                <dt>{t('person.arrival')}</dt>
                <dd>{person.arrival?.label ?? t('person.arrivalNone')}</dd>
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
              {readOnly ? null : <ProfileEditor person={person} channels={channels} text={text} />}
            </section>

            {admin && !readOnly ? (
              <section className={onboarding.section} aria-labelledby="cuenta-del-equipo">
                <h2 id="cuenta-del-equipo" className={styles.h3}>
                  {t('person.teamAccount.title')}
                </h2>
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
              </section>
            ) : null}
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
                    .sort((a, b) =>
                      happened(a) < happened(b) ? 1 : happened(a) > happened(b) ? -1 : 0,
                    )
                    .map((event) => {
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
