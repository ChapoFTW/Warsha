import { useLocalization } from '@/src/i18n/localization';

import { growthCopy, type GrowthCopyKey } from './growth-copy';
import type { CampaignStatus, ReferralClaimReason } from './growth-types';

const claimKeys: Record<ReferralClaimReason, GrowthCopyKey> = {
  accepted: 'claimAccepted',
  invalid: 'claimInvalid',
  self: 'claimSelf',
  already_attributed: 'claimAlready',
  unavailable: 'claimUnavailable',
};

const campaignStatusKeys: Record<CampaignStatus, GrowthCopyKey> = {
  draft: 'campaignStatusDraft',
  scheduled: 'campaignStatusScheduled',
  active: 'campaignStatusActive',
  paused: 'campaignStatusPaused',
  expired: 'campaignStatusExpired',
  cancelled: 'campaignStatusCancelled',
};

/** WPS-021 copy hook. The tables themselves live in `growth-copy.ts`. */
export function useGrowthText() {
  const { language, isRTL } = useLocalization();
  const locale = language === 'ar' ? 'ar' : 'en';
  return {
    locale,
    isRTL,
    text: (key: GrowthCopyKey) => growthCopy[locale][key],
    claimReason: (reason: ReferralClaimReason) => growthCopy[locale][claimKeys[reason]],
    campaignStatus: (status: CampaignStatus) => growthCopy[locale][campaignStatusKeys[status]],
  };
}

export { growthCopy };
export type { GrowthCopyKey };
