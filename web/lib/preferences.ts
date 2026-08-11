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

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar';
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** The other language, for the switcher and for hreflang alternates. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

/**
 * Map a request's Accept-Language header onto a supported language using the
 * same rule the mobile client applies to device locales: Arabic wins only when
 * it is the first preferred supported language.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return 'en';
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(';');
      const quality = parameters
        .map((parameter) => /^q=([0-9.]+)$/.exec(parameter.trim()))
        .find(Boolean);
      return { tag: tag.trim(), quality: quality ? Number(quality[1]) : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
  return tags[0]?.toLowerCase().split(/[-_]/, 1)[0] === 'ar' ? 'ar' : 'en';
}
