import { useLocalization } from '../i18n/localization';
import { productionPaymentCopy, type ProductionPaymentCopyKey } from './production-payment-copy';

/**
 * WPS-015 production payment copy hook.
 *
 * The copy itself lives in `production-payment-copy.ts` so the wording rules
 * (no wallet-balance or bank-balance language, no escrow guarantees, no
 * instant-refund promises, no gateway terminology, no raw provider errors) can
 * be validated directly by the regression suite.
 */
export type ProductionPaymentTranslationKey = ProductionPaymentCopyKey;

export function useProductionPaymentTranslations() {
  const { language } = useLocalization();
  return productionPaymentCopy[language === 'ar' ? 'ar' : 'en'];
}

export { productionPaymentCopy };
