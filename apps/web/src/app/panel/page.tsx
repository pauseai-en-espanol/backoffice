import type { Metadata } from 'next';

import { STAGES } from '@backoffice/domain/stages';
import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { isUnavailable } from '@/data';
import { getPanel } from '@/onboarding/data';
import { formatDay, formatInstantDay } from '@/onboarding/format';
import { personName } from '@/onboarding/names';
import { OnboardingOnly } from '@/onboarding/OnboardingOnly';
import { channelsIn, PANEL_WEEKS, waitIn, weeksFrom, weekTotal } from '@/onboarding/panel/types';
import * as onboarding from '@/onboarding/styles';
import { canOnboard } from '@/onboarding/text';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('panel.title') };

const wait = (value: number): string => {
  const { unit, amount } = waitIn(value);
  return unit === 'hours'
    ? t('panel.hours', { count: amount })
    : t('panel.days', { count: amount });
};

/**
 * Panel (onboarding spec, views; M4): how onboarding is going, in numbers. Tables, not charts, so every figure is
 * read the same by everyone, a screen reader included; the unassigned are named, to be taken.
 */
const PanelPage = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const me = await requireStaff();
  if (!canOnboard(me)) {
    return (
      <AppShell me={me}>
        <OnboardingOnly />
      </AppShell>
    );
  }
  const weeks = weeksFrom((await searchParams).semanas);
  const panel = await getPanel(weeks);
  if (isUnavailable(panel)) {
    return (
      <AppShell me={me}>
        <h1 className={styles.h1}>{t('panel.title')}</h1>
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      </AppShell>
    );
  }
  const channels = channelsIn(panel.arrivalsByChannel);
  const totalPeople = STAGES.reduce((sum, stage) => sum + (panel.stages[stage] ?? 0), 0);
  const { arrived, contacted, medianHours, p90Hours } = panel.firstContact;

  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('panel.title')}</h1>
      <p className={styles.text}>{t('panel.intro')}</p>
      <form className={styles.rowActions} action="/panel" method="get">
        <label className={styles.label} htmlFor="panel-semanas">
          {t('panel.weeks')}
        </label>
        <select
          id="panel-semanas"
          name="semanas"
          defaultValue={String(weeks)}
          className={styles.input}
        >
          {PANEL_WEEKS.map((option) => (
            <option key={option} value={option}>
              {t('panel.weeksOption', { count: option })}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.secondaryButton}>
          {t('panel.show')}
        </button>
      </form>

      <section className={onboarding.section} aria-labelledby="por-etapa">
        <h2 id="por-etapa" className={styles.h2}>
          {t('panel.byStage')}
        </h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{t('panel.byStage')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('panel.stage')}</th>
                <th scope="col">{t('panel.people')}</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((stage) => (
                <tr key={stage}>
                  <th scope="row">{t(`stages.${stage}`)}</th>
                  <td>{panel.stages[stage] ?? 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t('panel.total')}</th>
                <td>{totalPeople}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={onboarding.section} aria-labelledby="por-donde">
        <h2 id="por-donde" className={styles.h2}>
          {t('panel.arrivalsByChannel')}
        </h2>
        <p className={styles.hint}>{t('panel.arrivalsByChannelIntro')}</p>
        {panel.unknownArrival > 0 ? (
          <p className={styles.text}>
            {t('panel.unknownArrival', { count: panel.unknownArrival })}
          </p>
        ) : null}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be focusable */}
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-labelledby="por-donde">
          <table className={styles.table}>
            <caption className={styles.srOnly}>{t('panel.arrivalsByChannel')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('panel.week')}</th>
                {channels.map((channel) => (
                  <th key={channel.id} scope="col">
                    {channel.label ?? t('panel.arrivalNone')}
                  </th>
                ))}
                <th scope="col">{t('panel.total')}</th>
              </tr>
            </thead>
            <tbody>
              {[...panel.arrivalsByChannel.weeks].reverse().map((week) => (
                <tr key={week.week}>
                  <th scope="row">{t('panel.weekOf', { date: formatDay(week.week, 'medium') })}</th>
                  {channels.map((channel) => (
                    <td key={channel.id}>{week.counts[channel.id] ?? 0}</td>
                  ))}
                  <td>{weekTotal(week)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={onboarding.section} aria-labelledby="primer-contacto">
        <h2 id="primer-contacto" className={styles.h2}>
          {t('panel.firstContact')}
        </h2>
        {contacted === 0 ? (
          <p className={styles.text}>{t('panel.firstContactNone')}</p>
        ) : (
          <>
            <p className={styles.text}>{t('panel.firstContactText', { arrived, contacted })}</p>
            {medianHours === null ? null : (
              <p className={styles.text}>{t('panel.median', { wait: wait(medianHours) })}</p>
            )}
            {p90Hours === null ? null : (
              <p className={styles.text}>{t('panel.p90', { wait: wait(p90Hours) })}</p>
            )}
          </>
        )}
      </section>

      <section className={onboarding.section} aria-labelledby="sin-nadie">
        <h2 id="sin-nadie" className={styles.h2}>
          {t('panel.unassigned', { count: panel.unassigned.count })}
        </h2>
        {panel.unassigned.people.length === 0 ? (
          <p className={styles.text}>{t('panel.unassignedNone')}</p>
        ) : (
          <>
            <p className={styles.hint}>{t('panel.unassignedIntro')}</p>
            <ul className={onboarding.personList}>
              {panel.unassigned.people.map((person) => (
                <li key={person.id}>
                  <Link
                    className={onboarding.personName}
                    href={`/personas/${encodeURIComponent(person.id)}`}
                  >
                    {personName(person.name, t('people.noName'))}
                  </Link>{' '}
                  <span className={styles.hint}>
                    {t('panel.arrivedOn', {
                      date: person.arrivedOn
                        ? formatDay(person.arrivedOn)
                        : formatInstantDay(person.createdAt),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </AppShell>
  );
};

export default PanelPage;
