import { useLocalization } from '../i18n/localization';
import { trustSafetyCopy, type TrustSafetyCopyKey } from './trust-safety-copy';

/**
 * WPS-016 trust and safety copy hook. The copy itself lives in
 * `trust-safety-copy.ts` so its language rules can be validated directly by the
 * regression suite without React or Expo.
 */
export type TrustSafetyTranslationKey = TrustSafetyCopyKey;

export function useTrustSafetyTranslations() {
  const { language } = useLocalization();
  return trustSafetyCopy[language === 'ar' ? 'ar' : 'en'];
}

export { trustSafetyCopy };
