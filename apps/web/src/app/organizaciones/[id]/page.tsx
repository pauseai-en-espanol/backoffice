import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import { isForbidden } from '@/onboarding/data';
import { formatInstantDay } from '@/onboarding/format';
import * as onboarding from '@/onboarding/styles';
import { contactFormText, organisationFormText } from '@/outreach/contact-text';
import { NewContactForm } from '@/outreach/ContactForm';
import { ContactItem } from '@/outreach/ContactItem';
import { getOrganisation } from '@/outreach/data';
import { OrganisationEditor } from '@/outreach/OrganisationForm';
import { OutreachForbidden, OutreachOnly, Unavailable } from '@/outreach/OutreachOnly';
import { canOutreach, kindNames, outreachOwners, summaryWords } from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('organisations.title') };

/**
 * An organisation (outreach spec §1): its kind, territory, website and notes, edited in place; its contacts; and a new
 * contact there, its organisation already chosen.
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

  const { organisation, contacts } = page;
  const words = summaryWords(t);
  const owners = outreachOwners(isUnavailable(team) ? [] : team.staff);

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
            {organisation.notes ? (
              <>
                <dt>{t('organisations.notes')}</dt>
                <dd className={onboarding.timelineBody}>{organisation.notes}</dd>
              </>
            ) : null}
          </dl>
          <OrganisationEditor organisation={organisation} text={organisationFormText(t)} />
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
