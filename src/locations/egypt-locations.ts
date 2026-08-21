import type { Language } from '../i18n/translations.ts';

import { egyptAdministrativeAreas } from './egypt-administrative-areas.generated.ts';

export type EgyptLocationOption = { id: string; en: string; ar: string; fr: string };

// Official Egyptian place names have no separate French authority in the
// bundled CAPMAS/OCHA dataset. French uses the dataset's Latin transliteration
// rather than inventing or translating administrative names.
const locationLanguage = (language: Language): 'en' | 'ar' => language === 'ar' ? 'ar' : 'en';

export const EGYPT_LOCATION_DATASET = {
  id: 'ocha-hdx-cod-ab-egy-v01-2024-12-19',
  source: 'CAPMAS via OCHA/HDX Egypt COD-AB',
  sourceUrl: 'https://data.humdata.org/dataset/cod-ab-egy',
  governorateCount: 27,
  areaCount: 365,
} as const;

export function listEgyptGovernorates(language: Language, query = ''): EgyptLocationOption[] {
  const key = locationLanguage(language);
  const normalized = query.trim().toLocaleLowerCase(language);
  return egyptAdministrativeAreas
    .filter(item => !normalized || item[key].toLocaleLowerCase(language).includes(normalized))
    .map(item => ({ id: item.id, en: item.en, ar: item.ar, fr: item.en }))
    .sort((left, right) => left[language].localeCompare(right[language], language));
}

export function egyptGovernorateById(id: string): EgyptLocationOption | null {
  const item = egyptAdministrativeAreas.find(governorate => governorate.id === id);
  return item ? { id: item.id, en: item.en, ar: item.ar, fr: item.en } : null;
}

export function egyptGovernorateForStoredValue(value: string): EgyptLocationOption | null {
  const item = egyptAdministrativeAreas.find(governorate => governorate.id === value || governorate.en === value);
  return item ? { id: item.id, en: item.en, ar: item.ar, fr: item.en } : null;
}

export function listEgyptAreas(governorateId: string, language: Language, query = ''): EgyptLocationOption[] {
  const governorate = egyptAdministrativeAreas.find(item => item.id === governorateId);
  if (!governorate) return [];
  const key = locationLanguage(language);
  const normalized = query.trim().toLocaleLowerCase(language);
  return governorate.areas
    .filter(item => !normalized || item[key].toLocaleLowerCase(language).includes(normalized))
    .map(item => ({ id: item.id, en: item.en, ar: item.ar, fr: item.en }))
    .sort((left, right) => left[language].localeCompare(right[language], language));
}

export function egyptAreaForStoredValue(governorateId: string, value: string): EgyptLocationOption | null {
  const item = egyptAdministrativeAreas
    .find(governorate => governorate.id === governorateId)
    ?.areas.find(area => area.id === value || area.en === value);
  return item ? { id: item.id, en: item.en, ar: item.ar, fr: item.en } : null;
}
