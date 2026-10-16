import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { isUnavailable } from '@/data';
import * as onboarding from '@/onboarding/styles';
import { contactFormText, eraseText } from '@/outreach/contact-text';
import { ContactFiltersForm } from '@/outreach/ContactFiltersForm';
import { NewContactForm } from '@/outreach/ContactForm';
import { ContactItem } from '@/outreach/ContactItem';
import { EraseContact } from '@/outreach/ContactPanels';
import { getContacts, getOrganisations, getRightsContacts } from '@/outreach/data';
import { contactFiltersFromPage } from '@/outreach/filters';
import { OutreachOnly } from '@/outreach/OutreachOnly';
import { PrivateMark } from '@/outreach/PrivateMark';
import { canOutreach, isAdmin, outreachOwners, summaryWords } from '@/outreach/text';
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
  const params = await searchParams;
  const filters = contactFiltersFromPage(params);
  // A rights request (PLAN M5, step 6): admins find the person's contacts, private ones too, to export or erase.
  const admin = isAdmin(me);
  const rightsQuery = admin
    ? (Array.isArray(params.derechos) ? params.derechos[0] : params.derechos)?.trim().slice(0, 254)
    : undefined;
  const [contacts, organisations, team, rights] = await Promise.all([
    getContacts(filters),
    getOrganisations({ q: '', kind: '', visibility: '' }),
    getTeam(),
    rightsQuery ? getRightsContacts(rightsQuery) : Promise.resolve(undefined),
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
      {admin ? (
        <section id="derechos" className={onboarding.section} aria-labelledby="derechos-titulo">
          <h2 id="derechos-titulo" className={styles.h3}>
            {t('outreach.private.rights.title')}
          </h2>
          <p className={styles.hint}>{t('outreach.private.rights.intro')}</p>
          <form method="get" action="/contactos#derechos" className={styles.form} role="search">
            <div className={styles.field}>
              <label className={styles.label} htmlFor="derechos-q">
                {t('outreach.private.rights.search')}
              </label>
              <input
                id="derechos-q"
                className={styles.input}
                type="search"
                name="derechos"
                defaultValue={rightsQuery ?? ''}
                maxLength={254}
                required
              />
            </div>
            <div>
              <button type="submit" className={styles.button}>
                {t('outreach.private.rights.button')}
              </button>
            </div>
          </form>
          {rights === undefined ? null : isUnavailable(rights) ? (
            <p className={styles.notice}>{t('web.unavailable.body')}</p>
          ) : rights.length === 0 ? (
            <p className={styles.text}>{t('outreach.private.rights.none')}</p>
          ) : (
            <ul className={onboarding.personList}>
              {rights.map((found) => {
                const name = found.personName ?? found.orgDisplay;
                return (
                  <li key={found.id} className={onboarding.personItem}>
                    <p>
                      <strong>{name}</strong> · {found.orgDisplay}
                    </p>
                    {found.private ? (
                      <PrivateMark label={t('outreach.private.rights.privateMark')} />
                    ) : null}
                    <div className={styles.rowActions}>
                      <a
                        className={styles.secondaryButton}
                        href={`/api/outreach/contacts/${encodeURIComponent(found.id)}/export`}
                        download
                      >
                        {t('outreach.private.rights.export')}
                      </a>
                      <EraseContact contactId={found.id} text={eraseText(t, name)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </AppShell>
  );
};

export default ContactsPage;
