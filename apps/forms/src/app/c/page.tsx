import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { CensusPage } from '@/census/CensusPage';

const t = getTranslator();

export const metadata: Metadata = { title: t('census.title') };

/**
 * A personal link, `/c#token=…` (onboarding spec §7.2): the answer updates its person's record. The token is in the
 * fragment, which no request carries; the form reads it in the browser.
 */
const PersonalCensus = () => <CensusPage personal />;

export default PersonalCensus;
