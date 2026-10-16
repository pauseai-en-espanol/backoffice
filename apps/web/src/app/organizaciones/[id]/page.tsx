import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import { isForbidden } from '@/onboarding/data';
import { formatInstantDay } from '@/onboarding/format';
import * as onboarding from '@/onboarding/styles';
import {
  contactFormText,
  noteText,
  organisationFormText,
  shareText,
} from '@/outreach/contact-text';
import { NewContactForm } from '@/outreach/ContactForm';
import { ContactItem } from '@/outreach/ContactItem';
import { NoteForm } from '@/outreach/ContactPanels';
import { getOrganisation } from '@/outreach/data';
import { EntryWhen } from '@/outreach/EntryWhen';
import { OrganisationEditor } from '@/outreach/OrganisationForm';
import { OutreachForbidden, OutreachOnly, Unavailable } from '@/outreach/OutreachOnly';
import { PrivateMark } from '@/outreach/PrivateMark';
import { canOutreach, kindNames, outreachOwners, summaryWords } from '@/outreach/text';
import { byHappened } from '@/outreach/timeline';
import { SharePanel } from '@/outreach/Visibility';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('organisations.title') };

/**
 * An organisation (outreach spec §1): its kind, territory and website, edited in place; its timeline of notes, each
 * dated when it happened (PLAN M5, step 6); its contacts; and a new contact there, its organisation already chosen.
 */
const OrganisationPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const { id } = await params;
  const [page, team] = await Promise.all([getOrganisation(id), getTeam()]);
  if (isForbidden(page) || isUnavailable(page)) {
    return (
      <AppShell me={me}>{isForbidden(page) ? <OutreachForbidden /> : <Unavailable />}</AppShell>
    );
  }

  const { organisation, contacts, notes } = page;
  const words = summaryWords(t);
  const members = isUnavailable(team) ? [] : team.staff;
  const owners = outreachOwners(members);
  const who = (actor: (typeof notes)[number]['actor']): string => {
    const id = typeof actor === 'string' ? actor : actor?.userId;
    const named = typeof actor === 'object' && actor !== null ? actor.displayName : '';
    return actor === null
      ? t('outreach.events.system')
      : named ||
          (members.find((member) => member.userId === id)?.displayName ??
            t('outreach.events.someone'));
  };

  return (
    <AppShell me={me}>
      <Announcer>
        <p>
          <Link className={styles.link} href="/organizaciones">
            {t('organisations.back')}
          </Link>
        </p>
        <h1 className={styles.h1}>{organisation.name}</h1>
        <ul className={onboarding.meta}>
          <li>
            <span className={onboarding.stage}>{kindNames(t)[organisation.kind]}</span>
          </li>
          {organisation.territory ? (
            <li>
              {t('organisations.territory')}: {organisation.territory}
            </li>
          ) : null}
          {organisation.createdAt ? (
            <li>
              {t('organisations.createdOn', { date: formatInstantDay(organisation.createdAt) })}
            </li>
          ) : null}
        </ul>
        {organisation.private ? <PrivateMark label={words.private} /> : null}

        {organisation.private ? (
          <section className={onboarding.section} aria-labelledby="compartir">
            <h2 id="compartir" className={styles.h3}>
              {t('outreach.private.share')}
            </h2>
            <SharePanel
              record={{ kind: 'organisation', id: organisation.id }}
              matches={[]}
              text={shareText(t, 'organisation')}
            />
          </section>
        ) : null}

        <section className={onboarding.section} aria-labelledby="datos">
          <h2 id="datos" className={styles.h3}>
            {t('organisations.details')}
          </h2>
          <dl className={styles.facts}>
            {organisation.website ? (
              <>
                <dt>{t('organisations.website')}</dt>
                <dd>
                  <a
                    className={styles.link}
                    href={organisation.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {organisation.website}
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          <OrganisationEditor organisation={organisation} text={organisationFormText(t)} />
        </section>

        <section className={onboarding.section} aria-labelledby="notas">
          <h2 id="notas" className={styles.h3}>
            {t('organisations.timeline')}
          </h2>
          {notes.length === 0 ? (
            <p className={styles.hint}>{t('organisations.timelineNone')}</p>
          ) : (
            <ol className={onboarding.timeline} reversed>
              {[...notes].sort(byHappened).map((note) => (
                <li key={note.id}>
                  <strong>{t('outreach.events.note')}</strong>
                  {note.private && !organisation.private ? (
                    <PrivateMark label={words.private} />
                  ) : null}
                  <EntryWhen
                    happenedOn={note.happenedOn}
                    at={note.at}
                    who={who(note.actor)}
                    viaBot={note.channel === 'bot'}
                  />
                  {note.body ? <p className={onboarding.timelineBody}>{note.body}</p> : null}
                </li>
              ))}
            </ol>
          )}
          <h3 className={styles.h3}>{t('contacts.noteTitle')}</h3>
          <NoteForm
            on={{ kind: 'organisation', id: organisation.id, private: organisation.private }}
            text={noteText(t)}
          />
        </section>

        <section aria-labelledby="sus-contactos">
          <h2 id="sus-contactos" className={styles.h2}>
            {t('organisations.contacts')}
          </h2>
          {contacts.length === 0 ? (
            <p className={styles.text}>{t('organisations.contactsNone')}</p>
          ) : (
            <ul className={onboarding.personList}>
              {contacts.map((contact) => (
                <ContactItem key={contact.id} contact={contact} words={words} />
              ))}
            </ul>
          )}
        </section>

        <section id="nuevo" className={onboarding.section} aria-labelledby="nuevo-titulo">
          <h2 id="nuevo-titulo" className={styles.h3}>
            {t('organisations.addContact')}
          </h2>
          <p className={styles.hint}>{t('contacts.newIntro')}</p>
          <NewContactForm
            defaults={{
              organisationId: organisation.id,
              orgDisplay: organisation.name,
              territory: organisation.territory,
            }}
            organisations={[{ id: organisation.id, name: organisation.name }]}
            owners={owners}
            text={contactFormText(t)}
          />
        </section>
      </Announcer>
    </AppShell>
  );
};

export default OrganisationPage;
