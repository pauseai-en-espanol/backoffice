import { getTranslator } from '@backoffice/i18n/messages';

import * as onboarding from '@/onboarding/styles';
import * as ui from '@/ui/styles';

import type { Visibility } from './filters';

const t = getTranslator();

/**
 * "Quién lo ve" in a list's filters (PLAN M5, step 6): everything the reader sees, only their own private records, or
 * only the team's. The address says it as `quien=yo` or `quien=equipo`.
 */
export const VisibilityFilter = ({ value }: { value: Visibility | '' }) => (
  <div className={ui.field}>
    <label className={ui.label} htmlFor="quien">
      {t('outreach.private.filter')}
    </label>
    <select
      id="quien"
      name="quien"
      className={onboarding.select}
      defaultValue={value === 'private' ? 'yo' : value === 'team' ? 'equipo' : ''}
    >
      <option value="">{t('outreach.private.filterAny')}</option>
      <option value="yo">{t('outreach.private.filterMine')}</option>
      <option value="equipo">{t('outreach.private.filterTeam')}</option>
    </select>
  </div>
);
