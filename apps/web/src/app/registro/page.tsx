import type { Metadata } from 'next';

import { getFormatter, getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { changedFields, cursorFrom, getAuditPage } from '@/audit/data';
import { isUnavailable } from '@/data';
import { requireRecentSecondFactor, requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('audit.title') };

const TABLES: Readonly<Record<string, string>> = {
  staff: t('audit.tables.staff'),
  staff_roles: t('audit.tables.staff_roles'),
  invitations: t('audit.tables.invitations'),
};

const ACTIONS: Readonly<Record<string, string>> = {
  insert: t('audit.actions.insert'),
  update: t('audit.actions.update'),
  delete: t('audit.actions.delete'),
};

/**
 * The audit log (ADR-0002), for admins: every write, newest first, by whom and through which channel, and which fields
 * it changed. Personal data is never in the log; the fields holding it are only named. Older entries are a page each,
 * by the cursor in the address (`?antes=<id>`), so the page needs no script.
 */
const AuditPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ antes?: string | string[] }>;
}) => {
  const me = await requireStaff('admin');
  // The whole page is one of the riskiest actions (PLAN D23).
  requireRecentSecondFactor(me, '/registro');
  const before = cursorFrom((await searchParams).antes);
  const page = await getAuditPage(before);
  const format = getFormatter();
  return (
    <AppShell me={me}>
      <h1 className={styles.h1}>{t('audit.title')}</h1>
      <p className={styles.text}>{t('audit.intro')}</p>
      {isUnavailable(page) ? (
        <p className={styles.notice}>{t('web.unavailable.body')}</p>
      ) : page.entries.length === 0 ? (
        <p className={styles.text}>{t('audit.none')}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{t('audit.title')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('audit.when')}</th>
                <th scope="col">{t('audit.who')}</th>
                <th scope="col" className={styles.wideColumn}>
                  {t('audit.channel')}
                </th>
                <th scope="col">{t('audit.what')}</th>
                <th scope="col" className={styles.wideColumn}>
                  {t('audit.fields')}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.entries.map((entry) => {
                const { fields, personal } = changedFields(entry.diff);
                const channel = t(`audit.channels.${entry.channel ?? 'none'}`);
                const changes = (
                  <>
                    {fields.length > 0 ? <span>{fields.join(', ')}</span> : null}
                    {personal.length > 0 ? (
                      <span className={styles.block}>
                        {t('audit.personalFields', { fields: personal.join(', ') })}
                      </span>
                    ) : null}
                  </>
                );
                return (
                  <tr key={entry.id}>
                    <td>
                      <time dateTime={entry.at}>
                        {format.dateTime(new Date(entry.at), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </time>
                    </td>
                    <td>
                      {entry.actor?.displayName ?? t('audit.system')}
                      <span className={styles.narrowOnly}>{channel}</span>
                    </td>
                    <td className={styles.wideColumn}>{channel}</td>
                    <td>
                      {ACTIONS[entry.action] ?? entry.action} · {TABLES[entry.table] ?? entry.table}
                      <span className={`${styles.narrowOnly} ${styles.breakAnywhere}`}>
                        {t('audit.row')}: <code>{entry.rowId}</code>
                      </span>
                      <span className={styles.narrowOnly}>{changes}</span>
                    </td>
                    <td className={`${styles.wideColumn} ${styles.breakAnywhere}`}>
                      <span className={styles.block}>
                        {t('audit.row')}: <code>{entry.rowId}</code>
                      </span>
                      {changes}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!isUnavailable(page) ? (
        <nav className={styles.pager} aria-label={t('audit.pages')}>
          {page.next === null ? null : (
            <Link className={styles.link} href={`/registro?antes=${page.next}`}>
              {t('audit.older')}
            </Link>
          )}
          {before === undefined ? null : (
            <Link className={styles.link} href="/registro">
              {t('audit.newest')}
            </Link>
          )}
        </nav>
      ) : null}
    </AppShell>
  );
};

export default AuditPage;
