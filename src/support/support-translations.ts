import { useLocalization } from '@/src/i18n/localization';
import { supportCopy, type SupportTextKey } from './support-copy';
import type { SupportCategory, SupportLocale, SupportStatus } from './support-types';

/** WPS-019 copy hook. The tables themselves live in support-copy.ts. */
export function useSupportText() {
  const { language, isRTL } = useLocalization();
  const copyLocale = language;
  const locale: SupportLocale = language === 'ar' ? 'ar' : 'en';
  return {
    locale,
    isRTL,
    text: (key: SupportTextKey) => supportCopy[copyLocale][key],
    status: (status: SupportStatus) => supportCopy[copyLocale][`status_${status}` as SupportTextKey],
    category: (category: SupportCategory) => supportCopy[copyLocale][`category_${category}` as SupportTextKey],
  };
}

export { supportCopy };
export type { SupportTextKey };
