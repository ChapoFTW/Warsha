import { useLocalization } from '@/src/i18n/localization';

import { privacyCopy, type PrivacyCopyKey } from './privacy-copy';
import type { DeletionBlockerCode, DeletionStatus, ExportStatus } from './privacy-types';

/**
 * Every blocker code has a sentence, and every sentence describes something
 * the reader owns: their booking, their dispute, their payment. None mentions
 * another person, a report, or a staff decision — `legal_hold` in particular
 * says what it can and then stops, rather than hinting.
 */
const blockerKeys: Record<DeletionBlockerCode, PrivacyCopyKey> = {
  active_booking: 'blockedActiveBooking',
  open_dispute: 'blockedOpenDispute',
  unsettled_payment: 'blockedUnsettledPayment',
  outstanding_earnings: 'blockedOutstandingEarnings',
  active_payout: 'blockedActivePayout',
  open_chargeback: 'blockedOpenChargeback',
  open_support_case: 'blockedOpenSupportCase',
  active_enforcement: 'blockedActiveEnforcement',
  legal_hold: 'blockedLegalHold',
};

const deletionStatusKeys: Record<DeletionStatus, PrivacyCopyKey> = {
  cooling_off: 'deleteWaiting',
  blocked: 'blockedTitle',
  legal_hold: 'blockedTitle',
  approved: 'deleteProcessing',
  processing: 'deleteProcessing',
  anonymized: 'deleteProcessing',
  completed: 'deleteCompleted',
  cancelled: 'deleteCancelled',
  failed: 'deleteFailedState',
};

const exportStatusKeys: Record<ExportStatus, PrivacyCopyKey> = {
  requested: 'exportPreparing',
  // `manifest_ready` reads as "being prepared" too. The manifest exists but the
  // file does not, and calling that "ready" would be a promise Warsha cannot
  // keep until a worker is deployed to produce it.
  manifest_ready: 'exportPreparing',
  ready: 'exportReady',
  expired: 'exportExpired',
  failed: 'exportFailed',
  cancelled: 'exportCancelled',
};

/** WPS-022 copy hook. The tables themselves live in `privacy-copy.ts`. */
export function usePrivacyText() {
  const { language, isRTL } = useLocalization();
  const locale = language === 'ar' ? 'ar' : 'en';
  return {
    locale,
    isRTL,
    text: (key: PrivacyCopyKey) => privacyCopy[locale][key],
    blocker: (code: DeletionBlockerCode) => privacyCopy[locale][blockerKeys[code]],
    deletionStatus: (status: DeletionStatus) => privacyCopy[locale][deletionStatusKeys[status]],
    exportStatus: (status: ExportStatus) => privacyCopy[locale][exportStatusKeys[status]],
    categoryLabel: (category: { labelEn: string; labelAr: string }) =>
      locale === 'ar' ? category.labelAr : category.labelEn,
    consentTitle: (entry: { titleEn: string; titleAr: string }) =>
      locale === 'ar' ? entry.titleAr : entry.titleEn,
    consentExplanation: (entry: { explanationEn: string; explanationAr: string }) =>
      locale === 'ar' ? entry.explanationAr : entry.explanationEn,
  };
}

export { privacyCopy };
export type { PrivacyCopyKey };
