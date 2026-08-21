import { translations, type Language } from './translations.ts';

/**
 * Customer-facing names for service categories and services.
 *
 * `public.service_categories` stores a language-neutral `id` and a
 * `translation_key`. The id is the authority — every request, quote and booking
 * is written against `electrical`, not against "Electrical" — and it is not
 * something a customer should ever read.
 *
 * The labels are not defined here. `src/i18n/translations.ts` already carries
 * every category name in English, Arabic and French, and the mobile client has
 * always rendered from it. Web resolved the same key against its own copy
 * catalogue, which never contained these entries, so every lookup missed and
 * fell through to the raw id — which is how Arabic customers were shown
 * `satellite-tv-installation`.
 *
 * So this reads the shared authority rather than copying thirty labels into a
 * second one that can drift.
 */

type Catalogue = Record<string, unknown>;

function fromShared(key: string, language: Language): string | null {
  const catalogue = translations[language] as unknown as Catalogue;
  const value = catalogue?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * A last resort that is still not an identifier.
 *
 * `satellite-tv-installation` becomes "Satellite tv installation". It is not
 * localized, and it should never be reached — `service-labels.test.mts` asserts
 * every seeded category resolves in all three languages — but a customer
 * meeting an unseeded category must still read words rather than a slug.
 */
export function humanizeServiceKey(key: string): string {
  const words = key.replace(/[-_]+/g, ' ').trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The customer-facing name for a category's `translation_key`. */
export function serviceCategoryLabel(
  translationKey: string,
  language: Language,
  categoryId?: string,
): string {
  return fromShared(translationKey, language)
    ?? humanizeServiceKey(categoryId ?? translationKey);
}

/** The customer-facing description for a category's `description_key`. */
export function serviceCategoryDescription(
  descriptionKey: string | null,
  language: Language,
): string | null {
  return descriptionKey ? fromShared(descriptionKey, language) : null;
}
