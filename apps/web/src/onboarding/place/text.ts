import type { getTranslator } from '@backoffice/i18n/messages';

type Translator = ReturnType<typeof getTranslator>;

/** The place pickers' words (PLAN R74), built once by the server page. */
export const placeText = (t: Translator) => ({
  country: t('place.country'),
  countryPlaceholder: t('place.countryPlaceholder'),
  noCountry: t('place.noCountry'),
  latinAmerica: t('place.latinAmerica'),
  world: t('place.world'),
  province: t('place.province'),
  provinceHint: t('place.provinceHint'),
  regionHint: t('place.regionHint'),
  town: t('place.town'),
  openCountries: t('place.openCountries'),
  clearCountry: t('place.clearCountry'),
  openProvinces: t('place.openProvinces'),
});

export type PlaceText = ReturnType<typeof placeText>;
