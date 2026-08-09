/**
 * Device-level language preference contracts.
 *
 * This module is intentionally import-free so the precedence rules can be
 * exercised by the Node regression suite without loading React Native.
 */

export type SupportedLanguage = 'en' | 'ar';

export const languageStorageKey = 'warsha:language:v1';
export const languageExplicitKey = 'warsha:language-explicit:v1';

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'en' || value === 'ar';
}

/** Arabic wins only when it is the first preferred supported language. */
export function languageFromPreferredLocales(
  locales: readonly (string | { languageCode?: string | null; languageTag?: string | null })[],
): SupportedLanguage {
  const preferred = locales[0];
  const raw = typeof preferred === 'string'
    ? preferred
    : preferred?.languageCode ?? preferred?.languageTag ?? '';
  return raw.toLowerCase().split(/[-_]/, 1)[0] === 'ar' ? 'ar' : 'en';
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
  return language === 'ar'
    ? { language: 'ar', direction: 'rtl' as const, title: 'ورشة', manifest: '/manifest.ar.webmanifest' }
    : { language: 'en', direction: 'ltr' as const, title: 'Warsha', manifest: '/manifest.webmanifest' };
}
