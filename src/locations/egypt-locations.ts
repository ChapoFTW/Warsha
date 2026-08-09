import type { Language } from '../i18n/translations.ts';

import { egyptAdministrativeAreas } from './egypt-administrative-areas.generated.ts';

export type EgyptLocationOption = { id: string; en: string; ar: string };

export const EGYPT_LOCATION_DATASET = {
  id: 'ocha-hdx-cod-ab-egy-v01-2024-12-19',
  source: 'CAPMAS via OCHA/HDX Egypt COD-AB',
  sourceUrl: 'https://data.humdata.org/dataset/cod-ab-egy',
  governorateCount: 27,
  areaCount: 365,
} as const;

export function listEgyptGovernorates(language: Language, query = ''): EgyptLocationOption[] {
  const normalized = query.trim().toLocaleLowerCase(language);
  return egyptAdministrativeAreas
    .filter(item => !normalized || item[language].toLocaleLowerCase(language).includes(normalized))
    .map(item => ({ id: item.id, en: item.en, ar: item.ar }))
    .sort((left, right) => left[language].localeCompare(right[language], language));
}

export function egyptGovernorateById(id: string): EgyptLocationOption | null {
  const item = egyptAdministrativeAreas.find(governorate => governorate.id === id);
  return item ? { id: item.id, en: item.en, ar: item.ar } : null;
}

export function egyptGovernorateForStoredValue(value: string): EgyptLocationOption | null {
  const item = egyptAdministrativeAreas.find(governorate => governorate.id === value || governorate.en === value);
  return item ? { id: item.id, en: item.en, ar: item.ar } : null;
}

export function listEgyptAreas(governorateId: string, language: Language, query = ''): EgyptLocationOption[] {
  const governorate = egyptAdministrativeAreas.find(item => item.id === governorateId);
  if (!governorate) return [];
  const normalized = query.trim().toLocaleLowerCase(language);
  return governorate.areas
    .filter(item => !normalized || item[language].toLocaleLowerCase(language).includes(normalized))
    .map(item => ({ id: item.id, en: item.en, ar: item.ar }))
    .sort((left, right) => left[language].localeCompare(right[language], language));
}

export function egyptAreaForStoredValue(governorateId: string, value: string): EgyptLocationOption | null {
  const item = egyptAdministrativeAreas
    .find(governorate => governorate.id === governorateId)
    ?.areas.find(area => area.id === value || area.en === value);
  return item ? { id: item.id, en: item.en, ar: item.ar } : null;
}
