import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import * as onboarding from '@/onboarding/styles';
import { contactFormText } from '@/outreach/contact-text';
import { ContactFiltersForm } from '@/outreach/ContactFiltersForm';
import { NewContactForm } from '@/outreach/ContactForm';
import { ContactItem } from '@/outreach/ContactItem';
import { getContacts, getOrganisations } from '@/outreach/data';
import { contactFiltersFromPage } from '@/outreach/filters';
import { OutreachOnly } from '@/outreach/OutreachOnly';
import { canOutreach, outreachOwners, summaryWords } from '@/outreach/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('contacts.title') };

/** The API's most per list (staff-api M3): reaching it means there may be more. */
const LIST_LIMIT = 500;

/**
 * Contactos (outreach spec §5): the directory, filtered by tier, territory, organisation kind, relationship, owner
 * ("míos"), review and hold; the filters are the page's address. Never an email or a phone in the list. "Nuevo
 * contacto" adds one, which says why it matters and where that comes from, or stays "por revisar".
 */
const ContactsPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const filters = contactFiltersFromPage(await searchParams);
  const [contacts, organisations, team] = await Promise.all([
    getContacts(filters),
    getOrganisations({ q: '', kind: '' }),
    getTeam(),
  ]);
  const owners = outreachOwners(isUnavailable(team) ? [] : team.staff);
  const words = summaryWords(t);

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('contacts.title')}</h1>
      <p className={styles.text}>{t('contacts.intro')}</p>
      <p>
        <a className={styles.secondaryButton} href="#nuevo">
          {t('contacts.new')}
        </a>
      </p>
      <ContactFiltersForm filters={filters} owners={owners} />
      {isUnavailable(contacts) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : contacts.length === 0 ? (
        <p className={styles.text}>{t('contacts.none')}</p>
      ) : (
        <section aria-label={t('contacts.listLabel')}>
          {contacts.length >= LIST_LIMIT ? (
            <p className={styles.notice}>{t('contacts.limit')}</p>
          ) : null}
          <ul className={onboarding.personList}>
            {contacts.map((contact) => (
              <ContactItem key={contact.id} contact={contact} words={words} />
            ))}
          </ul>
        </section>
      )}
      <section id="nuevo" className={onboarding.section} aria-labelledby="nuevo-titulo">
        <h2 id="nuevo-titulo" className={styles.h3}>
          {t('contacts.new')}
        </h2>
        <p className={styles.hint}>{t('contacts.newIntro')}</p>
        <NewContactForm
          organisations={
            isUnavailable(organisations) ? [] : organisations.map(({ id, name }) => ({ id, name }))
          }
          owners={owners}
          text={contactFormText(t)}
        />
      </section>
    </AppShell>
  );
};

export default ContactsPage;
