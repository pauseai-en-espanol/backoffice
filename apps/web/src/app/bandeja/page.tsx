import type { Metadata } from 'next';

import { foldName, spacedPhone } from '@backoffice/domain/identities';
import { countryName } from '@backoffice/domain/places';
import { getTranslator } from '@backoffice/i18n/messages';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

import type { BandejaCandidate, BandejaItem } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { BandejaActions } from '@/onboarding/BandejaActions';
import { BandejaSearch } from '@/onboarding/BandejaSearch';
import { getCensusOptions } from '@/onboarding/census/data';
import { answerRows } from '@/onboarding/census/format';
import { cellMatch } from '@/onboarding/compare';
import { getBandeja } from '@/onboarding/data';
import { formatDay, formatInstant } from '@/onboarding/format';
import { personName } from '@/onboarding/names';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { PersonItem } from '@/onboarding/PersonItem';
import * as onboarding from '@/onboarding/styles';
import {
  availabilityNames,
  canOnboard,
  onboardingErrors,
  personLabels,
  sourceName,
} from '@/onboarding/text';
import * as outreach from '@/outreach/styles';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import { Icon } from '@/ui/Icon';
import { icons } from '@/ui/icons';
import { Status } from '@/ui/Status';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('bandeja.title') };

const FIELDS: Readonly<Record<string, string>> = {
  full_name: t('bandeja.fields.full_name'),
  preferred_name: t('bandeja.fields.preferred_name'),
  province: t('bandeja.fields.province'),
  town: t('bandeja.fields.town'),
  country: t('bandeja.fields.country'),
  origin_country: t('bandeja.fields.origin_country'),
  origin_province: t('bandeja.fields.origin_province'),
  how_heard: t('bandeja.fields.how_heard'),
};

/** The conflicts' fields that hold a country's code, shown by its name (PLAN R74). */
const COUNTRY_FIELDS: ReadonlySet<string> = new Set(['country', 'origin_country']);

/** A census answer's fields, in the order the Bandeja shows them (census/format.ts answerRows). */
const CENSUS_FIELDS = [
  'name',
  'preferredName',
  'province',
  'town',
  'country',
  'originCountry',
  'originProvince',
  'languages',
  'availability',
  'howHeard',
  'pronouns',
  'skills',
  'skillsOther',
  'interests',
  'interestsOther',
  'consentEmail',
  'consentWhatsapp',
  'consentPrivacy',
  'wordingVersion',
] as const;

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
 * shows what arrived beside the records it looks like, row by row, phones and emails included (PLAN R60), with a search
 * for the one it is when it isn't among them; a conflict shows each field as the person has it and as it arrived, and
 * an identity someone else holds is only counted. A census answer (through the generic link, where anyone can type
 * anyone's number) never shows its phone or email (R24), and shows its fields in words, to check before it's applied.
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
  const [items, options] = await Promise.all([getBandeja(), getCensusOptions()]);
  const labels = personLabels(t);
  const errors = onboardingErrors(t);
  const answerWords = {
    fields: Object.fromEntries(
      CENSUS_FIELDS.map((field) => [field, t(`bandeja.censusFields.${field}`)]),
    ),
    availability: availabilityNames(t),
    yes: t('bandeja.yes'),
    no: t('bandeja.no'),
    unknownOption: isUnavailable(options) ? '—' : t('bandeja.unknownOption'),
  };

  // A possible duplicate beside each record it looks like, row by row, "igual" where they agree (PLAN R60). A census
  // answer's phone and email aren't shown (R24), nor compared.
  const comparison = (
    entry: BandejaItem,
    against: readonly BandejaCandidate[],
    words: { heading: string; intro: string },
  ) => {
    const brought = entry.brought;
    const census = entry.source === 'census';
    const list = (values: readonly string[]) => (values.length === 0 ? '—' : values.join(', '));
    const day = (value: string | null) => (value ? formatDay(value) : '—');
    const rows: {
      key: string;
      brought: string;
      of: (candidate: BandejaCandidate) => { value: string; same: boolean };
      /** Whether the row compares (an amber "distinto" where it differs), or only shows (PLAN R68). */
      compared?: false;
    }[] = [
      {
        key: 'name',
        brought: entry.name ?? '—',
        of: (candidate) => {
          const value = candidate.fullName ?? personName(candidate.name, t('people.noName'));
          return {
            value,
            same: entry.name !== null && foldName(entry.name) === foldName(value),
          };
        },
      },
      ...(census
        ? []
        : (['phone', 'email', 'discord'] as const).map((kind) => {
            const theirs = (candidate: BandejaCandidate) => candidate.contacts?.[`${kind}s`] ?? [];
            const shown = (values: readonly string[]) =>
              list(kind === 'phone' ? values.map(spacedPhone) : values);
            return {
              key: kind,
              brought: shown(brought.contacts[`${kind}s`]),
              of: (candidate: BandejaCandidate) => ({
                value: shown(theirs(candidate)),
                same: brought.contacts[`${kind}s`].some((value) =>
                  theirs(candidate).includes(value),
                ),
              }),
            };
          })),
      {
        key: 'province',
        brought: entry.province ?? '—',
        of: (candidate) => ({
          value: candidate.province ?? '—',
          same:
            entry.province !== null &&
            candidate.province !== null &&
            foldName(entry.province) === foldName(candidate.province),
        }),
      },
      {
        key: 'country',
        brought: entry.country === null ? '—' : countryName(entry.country),
        of: (candidate) => ({
          value: candidate.country === null ? '—' : countryName(candidate.country),
          same: entry.country !== null && entry.country === candidate.country,
        }),
      },
      {
        key: 'arrival',
        brought: brought.arrival ?? '—',
        of: (candidate) => ({
          value: candidate.arrival?.label ?? '—',
          same: brought.arrival !== null && brought.arrival === candidate.arrival?.label,
        }),
      },
      {
        key: 'arrivedOn',
        brought: day(brought.arrivedOn),
        of: (candidate) => ({
          value: day(candidate.arrivedOn),
          same: brought.arrivedOn !== null && brought.arrivedOn === candidate.arrivedOn,
        }),
      },
      {
        key: 'group',
        brought:
          [
            brought.joinedOn ? t('bandeja.groupJoined', { date: formatDay(brought.joinedOn) }) : '',
            brought.leftOn ? t('bandeja.groupLeft', { date: formatDay(brought.leftOn) }) : '',
          ]
            .filter(Boolean)
            .join(' · ') || '—',
        of: (candidate) => ({
          value: candidate.inCommunity ? t('bandeja.groupIn') : t('bandeja.groupOut'),
          same: false,
        }),
        compared: false,
      },
      {
        key: 'stage',
        brought: brought.stage ? labels.stages[brought.stage] : '—',
        of: (candidate) => ({
          value: labels.stages[candidate.stage],
          same: brought.stage === candidate.stage,
        }),
      },
      {
        key: 'owner',
        brought: '—',
        of: (candidate) => ({
          value: candidate.owner?.displayName ?? t('person.noOwner'),
          same: false,
        }),
        compared: false,
      },
      {
        key: 'summary',
        brought: '—',
        of: (candidate) => ({ value: candidate.summary ?? '—', same: false }),
        compared: false,
      },
    ];
    const caption = `comparar-${entry.id}`;
    return (
      <>
        <h3 id={caption} className={styles.h3}>
          {words.heading}
        </h3>
        <p className={styles.hint}>
          {words.intro}
          {census ? ` ${t('bandeja.censusContacts')}` : ''}
        </p>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable */}
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-labelledby={caption}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{words.heading}</caption>
            <thead>
              <tr>
                <th scope="col">{t('bandeja.field')}</th>
                <th scope="col">{t('bandeja.record')}</th>
                {against.map((candidate) => (
                  <th key={candidate.id} scope="col">
                    <Link
                      className={styles.link}
                      href={`/personas/${encodeURIComponent(candidate.id)}`}
                    >
                      {personName(candidate.name, t('people.noName'))}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows
                // A row nobody says anything in says nothing (PLAN R78).
                .filter(
                  (row) =>
                    row.brought !== '—' ||
                    against.some((candidate) => row.of(candidate).value !== '—'),
                )
                .map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      {t(`bandeja.compareFields.${row.key}` as 'bandeja.compareFields.name')}
                    </th>
                    <td className={styles.breakAnywhere}>{row.brought}</td>
                    {against.map((candidate) => {
                      const cell = row.of(candidate);
                      const match = cellMatch(
                        row.compared !== false,
                        cell.same,
                        row.brought,
                        cell.value,
                      );
                      return (
                        <td key={candidate.id} className={styles.breakAnywhere}>
                          {cell.value}
                          {match === 'none' ? null : (
                            <>
                              {' '}
                              <span
                                className={onboarding.reason}
                                data-tone={match === 'same' ? 'positive' : undefined}
                              >
                                <Icon icon={match === 'same' ? Check : icons.attention} size={14} />
                                {match === 'same' ? t('bandeja.same') : t('bandeja.different')}
                              </span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  const item = (entry: BandejaItem) => {
    const fields = Object.entries(entry.conflicts).filter(
      ([field, value]) => field !== 'identities' && field !== 'census' && isRecord(value),
    );
    const census = isRecord(entry.conflicts.census) ? entry.conflicts.census : undefined;
    // Why it waits and what each answer does, in words (PLAN R78).
    const explain =
      entry.status === 'review'
        ? t('bandeja.explainReview')
        : fields.length > 0
          ? t('bandeja.explainConflict')
          : entry.taken.length > 0
            ? t('bandeja.explainTaken')
            : t('bandeja.explainConflict');
    return (
      <li key={entry.id} className={onboarding.section}>
        <h2 className={styles.h3}>
          <Status
            kind="attention"
            label={entry.status === 'review' ? t('bandeja.review') : t('bandeja.conflict')}
          />{' '}
          {entry.name ?? personName(entry.person?.name, t('people.noName'))}
        </h2>
        <p className={styles.hint}>
          {t('bandeja.from', {
            source: sourceName(t, entry.source),
            date: entry.createdAt ? formatInstant(entry.createdAt) : '—',
          })}
          {entry.reportedBy ? ` · ${t('bandeja.reportedBy', { name: entry.reportedBy })}` : ''}
        </p>
        {census ? null : <p className={styles.text}>{explain}</p>}
        {census ? (
          <>
            <h3 className={styles.h3}>{t('bandeja.census')}</h3>
            <p className={styles.hint}>{t('bandeja.censusIntro')}</p>
            {isUnavailable(options) ? (
              <p className={styles.notice}>{t('bandeja.optionsUnavailable')}</p>
            ) : null}
            <dl className={styles.facts}>
              {answerRows(census, isUnavailable(options) ? [] : options, answerWords).map((row) => (
                <Fragment key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </Fragment>
              ))}
            </dl>
          </>
        ) : null}
        {entry.status === 'review' ? (
          comparison(entry, entry.candidates, {
            heading: t('bandeja.compare'),
            intro: t('bandeja.compareIntro'),
          })
        ) : (
          <>
            {entry.person ? (
              <ul className={onboarding.personList}>
                <PersonItem person={entry.person} labels={labels} />
              </ul>
            ) : null}
            {entry.person && !census
              ? comparison(entry, [entry.person], {
                  heading: t('bandeja.compareConflict'),
                  intro: t('bandeja.compareConflictIntro'),
                })
              : null}
            {entry.taken.length > 0 ? (
              <>
                <h3 className={styles.h3}>{t('bandeja.taken')}</h3>
                <ul className={outreach.bullets}>
                  {entry.taken.map((identity) => (
                    <li key={identity.value}>
                      {identity.kind ? `${t(`person.identityKinds.${identity.kind}`)} ` : ''}
                      {identity.kind === 'phone'
                        ? spacedPhone(identity.value)
                        : identity.value}:{' '}
                      {identity.holder ? (
                        <>
                          {t('bandeja.takenBy')}{' '}
                          <Link
                            className={styles.link}
                            href={`/personas/${encodeURIComponent(identity.holder.id)}`}
                          >
                            {personName(identity.holder.name, t('people.noName'))}
                          </Link>
                        </>
                      ) : (
                        t('bandeja.takenByNobody')
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {fields.length > 0 ? (
              <>
                <h3 className={styles.h3}>{t('bandeja.changes')}</h3>
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
                        const said = (side: unknown) =>
                          COUNTRY_FIELDS.has(field) && typeof side === 'string'
                            ? countryName(side)
                            : shown(side);
                        return (
                          <tr key={field}>
                            <th scope="row">{FIELDS[field] ?? field}</th>
                            <td>{said(change.current)}</td>
                            <td>{said(change.proposed)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}
        <BandejaActions
          itemId={entry.id}
          status={entry.status}
          text={{
            attachTo: entry.candidates.map((candidate) => ({
              personId: candidate.id,
              label: t('bandeja.attachTo', {
                name: personName(candidate.name, t('people.noName')),
              }),
            })),
            // A census answer that matched two people is theirs to attach to one: both hold its email or phone.
            ...(census ? {} : { isNew: t('bandeja.isNew') }),
            discard: t('bandeja.discard'),
            discardConfirm: t('bandeja.discardConfirm'),
            // With only someone else's phone or email, there's nothing to take: it's settled as it is (PLAN R78).
            apply:
              census && entry.person
                ? t('bandeja.censusApply', {
                    name: personName(entry.person.name, t('people.noName')),
                  })
                : !census && fields.length === 0
                  ? undefined
                  : t('bandeja.apply'),
            keep: census
              ? t('bandeja.censusKeep')
              : fields.length === 0
                ? t('bandeja.keepTaken')
                : t('bandeja.keep'),
            confirm: t('team.confirm'),
            cancel: t('person.cancel'),
            done: t('bandeja.done'),
            errors,
          }}
        />
        {entry.status === 'review' && entry.source !== 'census' ? (
          <details className={onboarding.moreFilters}>
            <summary>{t('bandeja.searchTitle')}</summary>
            <BandejaSearch
              itemId={entry.id}
              text={{
                label: t('bandeja.searchLabel'),
                hint: t('bandeja.searchHint'),
                button: t('bandeja.searchButton'),
                none: t('bandeja.searchNone'),
                attachTo: String(t.raw('bandeja.attachTo')),
                noName: t('people.noName'),
                stages: labels.stages,
                done: t('bandeja.done'),
                errors,
              }}
            />
          </details>
        ) : null}
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
