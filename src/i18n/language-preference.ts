/**
 * Device-level language preference contracts.
 *
 * This module is intentionally import-free so the precedence rules can be
 * exercised by the Node regression suite without loading React Native.
 */

export const supportedLanguages = ['en', 'ar', 'fr'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languageMetadata: Record<SupportedLanguage, {
  label: string;
  direction: 'ltr' | 'rtl';
  localeTag: string;
}> = {
  en: { label: 'English', direction: 'ltr', localeTag: 'en-EG' },
  ar: { label: 'العربية', direction: 'rtl', localeTag: 'ar-EG' },
  fr: { label: 'Français', direction: 'ltr', localeTag: 'fr-EG' },
};

export const languageStorageKey = 'warsha:language:v1';
export const languageExplicitKey = 'warsha:language-explicit:v1';

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'en' || value === 'ar' || value === 'fr';
}

/** The first preferred supported language wins; unsupported languages fall back to English. */
export function languageFromPreferredLocales(
  locales: readonly (string | { languageCode?: string | null; languageTag?: string | null })[],
): SupportedLanguage {
  const preferred = locales[0];
  const raw = typeof preferred === 'string'
    ? preferred
    : preferred?.languageCode ?? preferred?.languageTag ?? '';
  const language = raw.toLowerCase().split(/[-_]/, 1)[0];
  return isSupportedLanguage(language) ? language : 'en';
}

export function resolveLanguage(input: {
  savedLanguage: unknown;
  savedExplicitly: boolean;
  preferredLocales: readonly (string | { languageCode?: string | null; languageTag?: string | null })[];
}): { language: SupportedLanguage; explicit: boolean } {
  if (input.savedExplicitly && isSupportedLanguage(input.savedLanguage)) {
    return { language: input.savedLanguage, explicit: true };
  }
  return { language: languageFromPreferredLocales(input.preferredLocales), explicit: false };
}

export function documentMetadataFor(language: SupportedLanguage) {
  return {
    language,
    direction: languageMetadata[language].direction,
    title: language === 'ar' ? 'ورشة' : 'Warsha',
    manifest: language === 'ar' ? '/manifest.ar.webmanifest' : '/manifest.webmanifest',
  };
}
