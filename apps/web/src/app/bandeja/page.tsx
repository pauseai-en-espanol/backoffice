import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import type { BandejaItem } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { BandejaActions } from '@/onboarding/BandejaActions';
import { getBandeja } from '@/onboarding/data';
import { formatInstant } from '@/onboarding/format';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { PersonItem } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, onboardingErrors, personLabels, sourceName } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import { Status } from '@/ui/Status';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('bandeja.title') };

const FIELDS: Readonly<Record<string, string>> = {
  full_name: t('bandeja.fields.full_name'),
  preferred_name: t('bandeja.fields.preferred_name'),
  province: t('bandeja.fields.province'),
  town: t('bandeja.fields.town'),
  how_heard: t('bandeja.fields.how_heard'),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const shown = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? '—'
      : JSON.stringify(value);

/**
 * The Bandeja (onboarding spec, views and matching): records waiting for a person's decision. A possible duplicate
 * shows what arrived beside the records it looks like; a conflict shows each field as the person has it and as it
 * arrived. Contact details never appear here: an identity someone else holds is only counted.
 */
const BandejaPage = async () => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const items = await getBandeja();
  const labels = personLabels(t);
  const errors = onboardingErrors(t);

  const item = (entry: BandejaItem) => {
    const fields = Object.entries(entry.conflicts).filter(
      ([field, value]) => field !== 'identities' && isRecord(value),
    );
    const takenIdentities = Array.isArray(entry.conflicts.identities)
      ? entry.conflicts.identities.length
      : 0;
    return (
      <li key={entry.id} className={onboarding.section}>
        <h2 className={styles.h3}>
          <Status
            kind="attention"
            label={entry.status === 'review' ? t('bandeja.review') : t('bandeja.conflict')}
          />{' '}
          {entry.name ?? entry.person?.name ?? '—'}
        </h2>
        <p className={styles.hint}>
          {t('bandeja.from', {
            source: sourceName(t, entry.source),
            date: entry.createdAt ? formatInstant(entry.createdAt) : '—',
          })}
          {entry.reportedBy ? ` · ${t('bandeja.reportedBy', { name: entry.reportedBy })}` : ''}
        </p>
        {entry.status === 'review' ? (
          <>
            <h3 className={styles.h3}>{t('bandeja.record')}</h3>
            <dl className={styles.facts}>
              <dt>{t('bandeja.fields.full_name')}</dt>
              <dd>{entry.name ?? '—'}</dd>
              {entry.province ? (
                <>
                  <dt>{t('bandeja.fields.province')}</dt>
                  <dd>{entry.province}</dd>
                </>
              ) : null}
              {entry.town ? (
                <>
                  <dt>{t('bandeja.fields.town')}</dt>
                  <dd>{entry.town}</dd>
                </>
              ) : null}
            </dl>
            <h3 className={styles.h3}>{t('bandeja.candidates')}</h3>
            <ul className={onboarding.personList}>
              {entry.candidates.map((candidate) => (
                <PersonItem key={candidate.id} person={candidate} labels={labels} />
              ))}
            </ul>
          </>
        ) : (
          <>
            {entry.person ? (
              <ul className={onboarding.personList}>
                <PersonItem person={entry.person} labels={labels} />
              </ul>
            ) : null}
            {fields.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('bandeja.field')}</th>
                      <th scope="col">{t('bandeja.current')}</th>
                      <th scope="col">{t('bandeja.proposed')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map(([field, value]) => {
                      const change = value as Record<string, unknown>;
                      return (
                        <tr key={field}>
                          <th scope="row">{FIELDS[field] ?? field}</th>
                          <td>{shown(change.current)}</td>
                          <td>{shown(change.proposed)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {takenIdentities > 0 ? (
              <p className={styles.hint}>
                {t('bandeja.identities')}: {takenIdentities}
              </p>
            ) : null}
          </>
        )}
        <BandejaActions
          itemId={entry.id}
          status={entry.status}
          text={{
            attachTo: entry.candidates.map((candidate) => ({
              personId: candidate.id,
              label: t('bandeja.attachTo', { name: candidate.name }),
            })),
            isNew: t('bandeja.isNew'),
            discard: t('bandeja.discard'),
            discardConfirm: t('bandeja.discardConfirm'),
            apply: t('bandeja.apply'),
            keep: t('bandeja.keep'),
            confirm: t('team.confirm'),
            cancel: t('person.cancel'),
            done: t('bandeja.done'),
            errors,
          }}
        />
      </li>
    );
  };

  return (
    <AppShell me={me} bandeja={isUnavailable(items) ? undefined : items.length}>
      <h1 className={styles.h1}>{t('bandeja.title')}</h1>
      <p className={styles.text}>{t('bandeja.intro')}</p>
      {isUnavailable(items) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : (
        <Announcer>
          {items.length === 0 ? (
            <p className={styles.text}>{t('bandeja.none')}</p>
          ) : (
            <ul className={onboarding.personList}>{items.map(item)}</ul>
          )}
        </Announcer>
      )}
    </AppShell>
  );
};

export default BandejaPage;
