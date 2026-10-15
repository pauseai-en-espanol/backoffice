import type { Metadata } from 'next';

import { getTranslator } from '@backoffice/i18n/messages';

import { CensusPage } from '@/census/CensusPage';

const t = getTranslator();

export const metadata: Metadata = { title: t('census.title') };

/** The generic census: anyone with the address; the API matches the answer to a person by email or phone. */
const GenericCensus = () => <CensusPage personal={false} />;

export default GenericCensus;
