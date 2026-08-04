import { useLocalization } from '@/src/i18n/localization';

import { discoveryCopy, type DiscoveryTextKey } from './discovery-copy';
import type { DiscoverySort } from './discovery-types';

const sortKeys: Record<DiscoverySort, DiscoveryTextKey> = {
  recommended: 'sortRecommended',
  distance: 'sortDistance',
  rating: 'sortRating',
  most_reviewed: 'sortMostReviewed',
  availability: 'sortAvailability',
};

/** WPS-020 copy hook. The tables themselves live in `discovery-copy.ts`. */
export function useDiscoveryText() {
  const { language, isRTL } = useLocalization();
  const locale = language === 'ar' ? 'ar' : 'en';
  return {
    locale,
    isRTL,
    text: (key: DiscoveryTextKey) => discoveryCopy[locale][key],
    sort: (sort: DiscoverySort) => discoveryCopy[locale][sortKeys[sort]],
  };
}

export { discoveryCopy };
export type { DiscoveryTextKey };
