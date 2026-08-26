/**
 * Language and appearance on the web use Warsha's existing preference model.
 *
 * Both contracts in `src/` were written import-free precisely so they could be
 * executed without a bundler or a device, which means the web can adopt them
 * whole rather than restate them. That matters more than it looks: the storage
 * keys, the precedence rules and the meaning of "explicit" are the parts a
 * second implementation would get subtly wrong, and a person who chose Arabic
 * on their phone and English on the laptop should find each remembered
 * correctly rather than fighting two different definitions of a default.
 */

// Re-exporting does not bring a name into this module's own scope, and the
// wrappers below genuinely call these.
import {
  directionFor,
  intlTagFor,
  isSupportedLocale,
  localeFromPreferredList,
  preferredListFromAcceptLanguage,
  supportedLocales,
  type SupportedLocale,
} from '../../src/preferences/preference-authority.ts';

export {
  languageStorageKey,
  languageExplicitKey,
  isSupportedLanguage,
  languageFromPreferredLocales,
  resolveLanguage,
  documentMetadataFor,
  type SupportedLanguage,
} from '../../src/i18n/language-preference.ts';

export {
  appearanceStorageKey,
  appearanceExplicitKey,
  appearancePreferences,
  resolvedAppearances,
  isAppearancePreference,
  resolveAppearance,
  type AppearancePreference,
  type ResolvedAppearance,
} from '../../src/appearance/appearance-types.ts';

export {
  accountLocalePrecedence,
  directionFor,
  intlTagFor,
  isSupportedLocale,
  localeCookieDomain,
  localeCookieMaxAgeSeconds,
  localeCookieName,
  localeCookieValue,
  localeDirectionAgrees,
  localeFromCookieHeader,
  localeFromPath,
  localeFromPreferredList,
  pathWithLocale,
  pathWithoutLocale,
  preferredListFromAcceptLanguage,
  resolveEffectiveLocale,
  supportedLocales,
  type EffectiveLocale,
  type LocaleDirection,
  type LocaleInputs,
  type LocaleSource,
  type SupportedLocale,
} from '../../src/preferences/preference-authority.ts';

export const LOCALES = supportedLocales;
export type Locale = SupportedLocale;

/**
 * These four were four small reimplementations of rules that now live in
 * `src/preferences/preference-authority.ts`. They stay as names because the
 * whole web surface calls them; they no longer stay as *logic*, because a
 * second copy of "which locales exist" and "which way does Arabic run" is
 * exactly the kind of duplication that lets one surface disagree with another.
 */
export function isLocale(value: unknown): value is Locale {
  return isSupportedLocale(value);
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return directionFor(locale);
}

export function intlLocale(locale: Locale): 'en-EG' | 'ar-EG' | 'fr-EG' {
  return intlTagFor(locale);
}

/**
 * Map a request's Accept-Language header onto a supported language using the
 * same rule the mobile client applies to device locales: the first preferred
 * supported language wins, and an unsupported first preference falls back to
 * English rather than hunting down the list.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  return localeFromPreferredList(preferredListFromAcceptLanguage(header)) ?? 'en';
}
