import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import type { ImportRun } from '@/onboarding/types';

import { isUnavailable } from '@/data';
import { MAPPING_FIELDS } from '@/onboarding/csv-mapping';
import { getImports } from '@/onboarding/data';
import { formatInstant } from '@/onboarding/format';
import { AirtableSync } from '@/onboarding/imports/AirtableSync';
import { Counts } from '@/onboarding/imports/Counts';
import { CsvImport } from '@/onboarding/imports/CsvImport';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import * as onboarding from '@/onboarding/styles';
import { canOnboard, onboardingErrors } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { getTeam } from '@/team/data';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('imports.title') };

const COUNTS = [
  'received',
  'created',
  'attached',
  'review',
  'conflict',
  'unchanged',
  'updated',
  'skipped',
  'discarded',
  'invalid',
] as const;

/**
 * Importar (onboarding spec, intake sources): Global's Airtable view, synced hourly and on demand (ADR-0005), and the
 * CSV import, which is also the fallback whenever the view can't be read. Every import is idempotent, and listed.
 */
const ImportsPage = async () => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const [imports, team] = await Promise.all([getImports(), getTeam()]);
  const errors = onboardingErrors(t);
  const counts = Object.fromEntries(COUNTS.map((key) => [key, t(`imports.counts.${key}`)]));
  const who = (run: ImportRun): string => {
    if (run.startedBy === null) {
      return t('imports.automatic');
    }
    if (typeof run.startedBy !== 'string') {
      return t('imports.by', { name: run.startedBy.displayName });
    }
    const id = run.startedBy;
    const member = isUnavailable(team) ? undefined : team.staff.find((m) => m.userId === id);
    return member ? t('imports.by', { name: member.displayName }) : t('imports.automatic');
  };
  const kind = (run: ImportRun): string =>
    run.kind === 'airtable' || run.kind === 'csv' ? t(`imports.kinds.${run.kind}`) : run.kind;

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('imports.title')}</h1>
      <p className={styles.text}>{t('imports.intro')}</p>
      {isUnavailable(imports) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : (
        <Announcer>
          <section className={onboarding.section} aria-labelledby="airtable">
            <h2 id="airtable" className={styles.h3}>
              {t('imports.airtable')}
            </h2>
            {imports.airtable.configured ? (
              <>
                <p className={styles.hint}>{t('imports.airtableIntro')}</p>
                <p>
                  {imports.airtable.lastRun
                    ? t('imports.lastRun', {
                        date: formatInstant(
                          imports.airtable.lastRun.finishedAt ?? imports.airtable.lastRun.startedAt,
                        ),
                      })
                    : t('imports.neverRun')}
                </p>
                {imports.airtable.lastRun ? (
                  <Counts counts={imports.airtable.lastRun.counts} labels={counts} />
                ) : null}
                <AirtableSync
                  text={{
                    sync: t('imports.sync'),
                    synced: t('imports.synced'),
                    running: t('imports.running'),
                    failed: t('imports.airtableFailed'),
                    reasons: {
                      columns: t('imports.airtableReasons.columns'),
                      unreachable: t('imports.airtableReasons.unreachable'),
                      blocked: t('imports.airtableReasons.blocked'),
                      format: t('imports.airtableReasons.format'),
                    },
                    counts,
                    errors,
                  }}
                />
              </>
            ) : (
              <p className={styles.notice}>{t('imports.airtableNotConfigured')}</p>
            )}
          </section>
          <section className={onboarding.section} aria-labelledby="csv">
            <h2 id="csv" className={styles.h3}>
              {t('imports.csv')}
            </h2>
            <p className={styles.hint}>{t('imports.csvIntro')}</p>
            <CsvImport
              text={{
                file: t('imports.file'),
                fileTooBig: t('imports.fileTooBig'),
                fileUnreadable: t('imports.fileUnreadable'),
                mapping: t('imports.mapping'),
                mappingIntro: t('imports.mappingIntro'),
                column: String(t.raw('imports.column')),
                fields: {
                  ignore: t('imports.fields.ignore'),
                  ...Object.fromEntries(
                    MAPPING_FIELDS.map((field) => [field, t(`imports.fields.${field}`)]),
                  ),
                } as Record<(typeof MAPPING_FIELDS)[number] | 'ignore', string>,
                recalculate: t('imports.recalculate'),
                previewTitle: t('imports.previewTitle'),
                invalidTitle: t('imports.invalidTitle'),
                invalidRow: String(t.raw('imports.invalidRow')),
                dryRun: t('imports.dryRun'),
                apply: t('imports.apply'),
                applied: t('imports.applied'),
                noName: t('imports.noName'),
                counts,
                errors,
              }}
            />
          </section>
          <section aria-labelledby="historial">
            <h2 id="historial" className={styles.h2}>
              {t('imports.history')}
            </h2>
            {imports.imports.length === 0 ? (
              <p className={styles.text}>{t('imports.historyNone')}</p>
            ) : (
              <ul className={onboarding.personList}>
                {imports.imports.map((run) => (
                  <li key={run.id} className={onboarding.personItem}>
                    <p>
                      <strong>{kind(run)}</strong> · {formatInstant(run.startedAt)} · {who(run)}
                      {run.finishedAt === null ? ` · ${t('imports.notFinished')}` : ''}
                    </p>
                    <Counts counts={run.counts} labels={counts} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Announcer>
      )}
    </AppShell>
  );
};

export default ImportsPage;
