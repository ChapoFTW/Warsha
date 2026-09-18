import { useCallback } from 'react';

import { useLocalization } from '@/src/i18n/localization';

import { reviewText, type ReviewCopyKey } from './review-copy';

export type { ReviewCopyKey } from './review-copy';

export function useReviewText() {
  const { language } = useLocalization();
  return useCallback((key: ReviewCopyKey) => reviewText(language, key), [language]);
}
