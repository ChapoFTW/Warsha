import { useLocalization } from '@/src/i18n/localization';

import { legalCopy, type LegalTextKey } from './legal-copy';
import type { LegalLanguage } from './legal-types';

/**
 * WPS-024 copy hook.
 *
 * The strings themselves live in `legal-copy.ts`, which imports nothing at
 * runtime so the regression suite can assert over them under Node. This module
 * is the React binding and nothing else.
 */

export { legalCopy, changeClassKey, guaranteeKey, restrictionKey } from './legal-copy';
export type { LegalTextKey } from './legal-copy';

/**
 * `locale` is typed as `LegalLanguage`, not inferred.
 *
 * Without the annotation TypeScript widens it to `string` through the return
 * object, and every caller that passes it to `accept()` or `bodyFor()` fails.
 * Naming the type here rather than casting at each of the nine call sites keeps
 * the narrowing where the narrowing actually happens.
 */
export function useLegalText(): { locale: LegalLanguage; text: (key: LegalTextKey) => string } {
  const { language } = useLocalization();
  const locale: LegalLanguage = language === 'ar' ? 'ar' : 'en';
  return {
    locale,
    text: (key: LegalTextKey): string => legalCopy[locale][key],
  };
}
