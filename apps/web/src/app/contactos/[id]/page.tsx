import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import { isForbidden } from '@/onboarding/data';
import { formatInstant, formatInstantDay } from '@/onboarding/format';
import { StageTag } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import {
  contactFormText,
  eraseText,
  holdText,
  noteText,
  reviewText,
} from '@/outreach/contact-text';
import { ContactEditor } from '@/outreach/ContactForm';
import { ContactFlags } from '@/outreach/ContactItem';
import { ContactNote, EraseContact, HoldPanel, ReviewPanel } from '@/outreach/ContactPanels';
import { getContact, getOrganisations } from '@/outreach/data';
import { contactName, isWebLink } from '@/outreach/format';
import { OutreachForbidden, OutreachOnly, Unavailable } from '@/outreach/OutreachOnly';
import * as outreach from '@/outreach/styles';
import {
  canOutreach,
  isAdmin,
  kindNames,
  outreachOwners,
  statusNames,
  summaryWords,
  treatmentNames,
} from '@/outreach/text';
import { describeContactEvent } from '@/outreach/timeline';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('contacts.title') };

/**
 * A contact (outreach spec §1): who they are and how to write to them (the only page that shows their email and phone),
 * why they matter and where that comes from, their review and hold, the campaigns they're in, and their timeline with
 * notes. Admins can erase their data. An erased contact is shown as such, read only.
 */
const ContactPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const { id } = await params;
  const [page, team, organisations] = await Promise.all([
    getContact(id),
    getTeam(),
    getOrganisations({ q: '', kind: '' }),
  ]);
  if (isForbidden(page) || isUnavailable(page)) {
    return (
      <AppShell me={me}>{isForbidden(page) ? <OutreachForbidden /> : <Unavailable />}</AppShell>
    );
  }

  const { contact, targets, timeline } = page;
  const words = summaryWords(t);
  const members = isUnavailable(team) ? [] : team.staff;
  const owners = outreachOwners(members);
  const statuses = statusNames(t);
  const readOnly = contact.anonymised;
  const name = contactName(contact, words);
  const staffName = (userId: string) =>
    members.find((member) => member.userId === userId)?.displayName;
  const campaignName = (campaignId: string) =>
    targets.find((target) => target.campaign.id === campaignId)?.campaign.name;
  const organisationChoices = isUnavailable(organisations)
    ? []
    : organisations.map(({ id: organisationId, name: organisationName }) => ({
        id: organisationId,
        name: organisationName,
      }));
  const who = (actor: (typeof timeline)[number]['actor']): string =>
    actor === null
      ? t('outreach.events.system')
      : typeof actor === 'string'
        ? (staffName(actor) ?? t('outreach.events.someone'))
        : actor.displayName || (staffName(actor.userId) ?? t('outreach.events.someone'));

  return (
    <AppShell me={me}>
      <Announcer>
        <p>
          <Link className={styles.link} href="/contactos">
            {t('contacts.back')}
          </Link>
        </p>
        {readOnly ? <p className={styles.notice}>{t('contacts.anonymisedNotice')}</p> : null}
        <h1 className={styles.h1}>{name}</h1>
        <p className={styles.text}>
          {contact.orgDisplay}
          {contact.role ? ` · ${contact.role}` : ''}
        </p>
        <ul className={onboarding.meta}>
          <li>
            <StageTag label={words.stages[contact.stage]} />
          </li>
          <li>{t('outreach.summary.tier', { tier: contact.tier })}</li>
          {contact.organisation ? (
            <li>
              <Link
                className={styles.link}
                href={`/organizaciones/${encodeURIComponent(contact.organisation.id)}`}
              >
                {contact.organisation.name}
              </Link>{' '}
              ({kindNames(t)[contact.organisation.kind]})
            </li>
          ) : null}
          {contact.territory ? (
            <li>
              {words.territory}: {contact.territory}
            </li>
          ) : null}
          <li>
            {words.owner}: {contact.owner?.displayName || words.noOwner}
          </li>
        </ul>
        <ContactFlags contact={contact} words={words} />

        <div className={onboarding.personPage}>
          <div>
            <section className={onboarding.section} aria-labelledby="escribirle">
              <h2 id="escribirle" className={styles.h3}>
                {t('contacts.contactDetails')}
              </h2>
              {contact.email || contact.phone || contact.emailsExtra.length > 0 ? (
                <dl className={styles.facts}>
                  {contact.email ? (
                    <>
                      <dt>{t('contacts.email')}</dt>
                      <dd>{contact.email}</dd>
                    </>
                  ) : null}
                  {contact.emailsExtra.length > 0 ? (
                    <>
                      <dt>{t('contacts.emailsExtra')}</dt>
                      <dd>{contact.emailsExtra.join(', ')}</dd>
                    </>
                  ) : null}
                  {contact.phone ? (
                    <>
                      <dt>{t('contacts.phone')}</dt>
                      <dd>{contact.phone}</dd>
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className={styles.hint}>{t('contacts.noContactDetails')}</p>
              )}
              {contact.website ? (
                <p>
                  <a
                    className={styles.link}
                    href={contact.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {contact.website}
                  </a>
                </p>
              ) : null}
            </section>

            <section className={onboarding.section} aria-labelledby="por-que">
              <h2 id="por-que" className={styles.h3}>
                {t('contacts.why')}
              </h2>
              <p className={onboarding.timelineBody}>{contact.reason ?? t('contacts.noReason')}</p>
              {contact.sources.length === 0 ? (
                <p className={styles.hint}>{t('contacts.noSources')}</p>
              ) : (
                <ul className={outreach.bullets}>
                  {contact.sources.map((source) => (
                    <li key={source}>
                      {isWebLink(source) ? (
                        <a
                          className={styles.link}
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {source}
                        </a>
                      ) : (
                        source
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {readOnly ? null : (
              <>
                <section className={onboarding.section} aria-labelledby="revision">
                  <h2 id="revision" className={styles.h3}>
                    {t('contacts.reviewTitle')}
                  </h2>
                  <ReviewPanel contact={contact} text={reviewText(t)} />
                </section>
                <section className={onboarding.section} aria-labelledby="pausa">
                  <h2 id="pausa" className={styles.h3}>
                    {t('contacts.holdTitle')}
                  </h2>
                  <HoldPanel contact={contact} text={holdText(t)} />
                </section>
                <section className={onboarding.section} aria-labelledby="nota">
                  <h2 id="nota" className={styles.h3}>
                    {t('contacts.noteTitle')}
                  </h2>
                  <ContactNote contactId={contact.id} text={noteText(t)} />
                </section>
              </>
            )}
          </div>

          <div>
            <section className={onboarding.section} aria-labelledby="datos">
              <h2 id="datos" className={styles.h3}>
                {t('contacts.details')}
              </h2>
              <dl className={styles.facts}>
                <dt>{t('contacts.orgDisplay')}</dt>
                <dd>{contact.orgDisplay}</dd>
                {contact.personName ? (
                  <>
                    <dt>{t('contacts.personName')}</dt>
                    <dd>{contact.personName}</dd>
                  </>
                ) : null}
                <dt>{t('contacts.treatment')}</dt>
                <dd>{treatmentNames(t)[contact.treatment]}</dd>
                {contact.greetingName ? (
                  <>
                    <dt>{t('contacts.greetingName')}</dt>
                    <dd>{contact.greetingName}</dd>
                  </>
                ) : null}
                {contact.role ? (
                  <>
                    <dt>{t('contacts.role')}</dt>
                    <dd>{contact.role}</dd>
                  </>
                ) : null}
                {contact.scope ? (
                  <>
                    <dt>{t('contacts.scope')}</dt>
                    <dd>{contact.scope}</dd>
                  </>
                ) : null}
                {contact.sector ? (
                  <>
                    <dt>{t('contacts.sector')}</dt>
                    <dd>{contact.sector}</dd>
                  </>
                ) : null}
                {contact.anchor ? (
                  <>
                    <dt>{t('contacts.anchor')}</dt>
                    <dd>{contact.anchor}</dd>
                  </>
                ) : null}
                {contact.tags.length > 0 ? (
                  <>
                    <dt>{t('contacts.tags')}</dt>
                    <dd>{contact.tags.join(', ')}</dd>
                  </>
                ) : null}
                {contact.notes ? (
                  <>
                    <dt>{t('contacts.notes')}</dt>
                    <dd className={onboarding.timelineBody}>{contact.notes}</dd>
                  </>
                ) : null}
                {contact.createdAt ? (
                  <>
                    <dt>{t('contacts.inDirectorySince')}</dt>
                    <dd>{formatInstantDay(contact.createdAt)}</dd>
                  </>
                ) : null}
              </dl>
              {readOnly ? null : (
                <ContactEditor
                  contact={contact}
                  organisations={organisationChoices}
                  owners={owners}
                  text={contactFormText(t)}
                />
              )}
            </section>

            <section className={onboarding.section} aria-labelledby="campanas">
              <h2 id="campanas" className={styles.h3}>
                {t('contacts.campaigns')}
              </h2>
              {targets.length === 0 ? (
                <p className={styles.hint}>{t('contacts.campaignsNone')}</p>
              ) : (
                <ul className={onboarding.personList}>
                  {targets.map((target) => (
                    <li key={target.id}>
                      <Link
                        className={styles.link}
                        href={`/campanas/${encodeURIComponent(target.campaign.id)}`}
                      >
                        {target.campaign.name}
                      </Link>{' '}
                      <span className={onboarding.stage}>{statuses[target.status]}</span>
                      <ul className={onboarding.meta}>
                        {target.sentAt ? (
                          <li>{t('campaigns.sentAt', { date: formatInstant(target.sentAt) })}</li>
                        ) : null}
                        {target.repliedAt ? (
                          <li>
                            {t('campaigns.repliedAt', { date: formatInstant(target.repliedAt) })}
                          </li>
                        ) : null}
                        {target.meetingAt ? (
                          <li>
                            {t('campaigns.meetingAt', { date: formatInstant(target.meetingAt) })}
                          </li>
                        ) : null}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={onboarding.section} aria-labelledby="historia">
              <h2 id="historia" className={styles.h3}>
                {t('contacts.timeline')}
              </h2>
              {timeline.length === 0 ? (
                <p className={styles.hint}>{t('contacts.timelineNone')}</p>
              ) : (
                <ol className={onboarding.timeline} reversed>
                  {[...timeline]
                    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
                    .map((event) => {
                      const described = describeContactEvent(event, {
                        t,
                        staffName,
                        campaignName,
                      });
                      return (
                        <li key={event.id}>
                          <strong>{described.title}</strong>
                          <span className={`${styles.block} ${styles.hint}`}>
                            {who(event.actor)}
                            {event.channel === 'bot'
                              ? ` ${t('outreach.events.viaBot')}`
                              : ''} · <time dateTime={event.at}>{formatInstant(event.at)}</time>
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

            {isAdmin(me) && !readOnly ? (
              <section className={onboarding.section} aria-labelledby="sus-datos">
                <h2 id="sus-datos" className={styles.h3}>
                  {t('contacts.rights')}
                </h2>
                <p className={styles.hint}>{t('contacts.rightsIntro')}</p>
                <EraseContact contactId={contact.id} text={eraseText(t, name)} />
              </section>
            ) : null}
          </div>
        </div>
      </Announcer>
    </AppShell>
  );
};

export default ContactPage;
