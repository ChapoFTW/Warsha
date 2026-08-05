import { useLocalization } from '@/src/i18n/localization';

import { growthCopy, type GrowthCopyKey } from './growth-copy';
import type {
  GrowthLifecycleStatus,
  ReferralClaimReason,
  ReferralRewardStatus,
} from './growth-types';

const claimKeys: Record<ReferralClaimReason, GrowthCopyKey> = {
  accepted: 'claimAccepted',
  invalid: 'claimInvalid',
  self: 'claimSelf',
  already_attributed: 'claimAlready',
  unavailable: 'claimUnavailable',
};

/**
 * Reward statuses. Note what is absent: there is no key meaning "pending
 * approval", because no such state exists — a granted reward is immediately
 * usable.
 */
const rewardStatusKeys: Record<ReferralRewardStatus, GrowthCopyKey> = {
  available: 'rewardAvailable',
  consumed: 'rewardConsumed',
  expired: 'rewardExpired',
  revoked: 'rewardRevoked',
};

const lifecycleKeys: Record<GrowthLifecycleStatus, GrowthCopyKey> = {
  draft: 'statusDraft',
  scheduled: 'statusScheduled',
  active: 'statusActive',
  paused: 'statusPaused',
  expired: 'statusExpiredLifecycle',
  cancelled: 'statusCancelled',
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
    rewardStatus: (status: ReferralRewardStatus) => growthCopy[locale][rewardStatusKeys[status]],
    lifecycle: (status: GrowthLifecycleStatus) => growthCopy[locale][lifecycleKeys[status]],
  };
}

export { growthCopy };
export type { GrowthCopyKey };
