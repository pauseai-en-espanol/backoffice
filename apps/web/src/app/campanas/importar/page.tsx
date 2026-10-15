import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';
import Link from 'next/link';

import { ImportCampaign } from '@/outreach/ImportCampaign';
import { OutreachOnly } from '@/outreach/OutreachOnly';
import { canOutreach, importFileNames, isAdmin, outreachErrors } from '@/outreach/text';
import { IMPORT_COUNTS } from '@/outreach/types';
import { requireStaff } from '@/session';
import { AppShell } from '@/shell/AppShell';
import { Announcer } from '@/ui/Announcer';
import * as styles from '@/ui/styles';

const t = getTranslator();

export const metadata: Metadata = { title: t('campaignImport.title') };

/**
 * Importar del repositorio (outreach spec §4), for admins: one campaign from the outreach repo's files, once; after
 * that the repo is its archive and the campaign goes on here. A dry run first, which writes nothing.
 */
const ImportPage = async () => {
  const me = await requireStaff();
  if (!canOutreach(me)) {
    return (
      <AppShell me={me}>
        <OutreachOnly />
      </AppShell>
    );
  }
  const raw = (key: Parameters<typeof t.raw>[0]) => String(t.raw(key));
  return (
    <AppShell me={me}>
      <p>
        <Link className={styles.link} href="/campanas">
          {t('campaignImport.back')}
        </Link>
      </p>
      <h1 className={styles.h1}>{t('campaignImport.title')}</h1>
      {isAdmin(me) ? (
        <>
          <p className={styles.text}>{t('campaignImport.intro')}</p>
          <Announcer>
            <ImportCampaign
              text={{
                files: t('campaignImport.files'),
                filesHint: t('campaignImport.filesHint'),
                kinds: importFileNames(t),
                chosen: t('campaignImport.chosen'),
                ignored: raw('campaignImport.ignored'),
                missing: raw('campaignImport.missing'),
                tooBig: t('campaignImport.tooBig'),
                unreadable: raw('campaignImport.unreadable'),
                check: t('campaignImport.check'),
                startAgain: t('campaignImport.startAgain'),
                dryRun: t('campaignImport.dryRun'),
                imported: t('campaignImport.imported'),
                importedTitle: t('campaignImport.importedTitle'),
                counts: Object.fromEntries(
                  IMPORT_COUNTS.map((key) => [key, t(`campaignImport.counts.${key}`)]),
                ),
                problems: t('campaignImport.problems'),
                problemsIntro: t('campaignImport.problemsIntro'),
                warnings: t('campaignImport.warnings'),
                warningsIntro: t('campaignImport.warningsIntro'),
                line: raw('campaignImport.line'),
                noProblems: t('campaignImport.noProblems'),
                confirm: t('campaignImport.confirm'),
                toCampaigns: t('campaignImport.toCampaigns'),
                errors: outreachErrors(t),
              }}
            />
          </Announcer>
        </>
      ) : (
        <p className={styles.text}>{t('campaignImport.adminOnly')}</p>
      )}
    </AppShell>
  );
};

export default ImportPage;
