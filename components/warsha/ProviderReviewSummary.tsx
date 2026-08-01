import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './Typography';
import { BrandLoadingMark as ActivityIndicator } from './BrandMark';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { realtimeService } from '@/src/realtime/realtime-service';
import { useReviews } from '@/src/reviews/review-context';
import type { RatingSummary } from '@/src/reviews/review-types';
import { formatNumber, formatTimestamp, localeFor } from '@/src/utils/date-format';

export function ProviderReviewSummary({ providerId }: { providerId: string }) {
  const { t, isRTL, language } = useLocalization();
  const { getSummary, revision } = useReviews();
  const [summary, setSummary] = useState<RatingSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const scope = useRef(revision);
  scope.current = revision;

  const load = useCallback(async () => {
    const current = ++request.current;
    const targetRevision = revision;
    setLoading(true);
    setError(false);
    setSummary(undefined);
    try {
      const next = await getSummary(providerId);
      if (request.current === current && scope.current === targetRevision) setSummary(next);
    } catch {
      if (request.current === current && scope.current === targetRevision) setError(true);
    } finally {
      if (request.current === current && scope.current === targetRevision) setLoading(false);
    }
  }, [getSummary, providerId, revision]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  useEffect(() => {
    let firstConnection = true;
    const reconcile = () => { void load(); };
    return realtimeService.providerReviews(providerId, reconcile, (status) => {
      if (status !== 'connected') return;
      if (firstConnection) firstConnection = false;
      else reconcile();
    });
  }, [load, providerId]);

  if (loading) {
    return <ActivityIndicator accessibilityLabel={t('ratingSummary')} color={colors.white} />;
  }
  if (error && !summary) {
    return (
      <View style={styles.state}>
        <AppText style={styles.error}>{t('reviewLoadError')}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('tryAgain')} onPress={() => void load()} style={styles.outline}>
          <AppText>{t('tryAgain')}</AppText>
        </Pressable>
      </View>
    );
  }
  if (!summary?.count) return <AppText style={styles.muted}>{t('noReviewsYet')}</AppText>;

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, isRTL && styles.reverse]}>
        <View>
          <AppText style={styles.title}>{t('ratingSummary')}</AppText>
          <AppText style={styles.score}>★ {formatNumber(summary.average, language)}</AppText>
        </View>
        <AppText style={styles.muted}>{formatNumber(summary.count, language)} {t('reviews')}</AppText>
      </View>
      <View style={[styles.distribution, isRTL && styles.reverse]}>
        {[5, 4, 3, 2, 1].map((rating) => (
          <AppText key={rating} style={styles.distributionItem}>
            {rating}★ {formatNumber(summary.distribution[rating as 1 | 2 | 3 | 4 | 5], language)}
          </AppText>
        ))}
      </View>
      {summary.reviews.map((review) => {
        const reviewerName = review.reviewerName === 'Customer' ? t('reviewCustomer') : review.reviewerName;
        return (
          <View key={review.id} style={styles.item}>
            <View style={[styles.header, isRTL && styles.reverse]}>
              <AppText style={styles.strong}>{reviewerName}</AppText>
              <AppText style={styles.muted}>{formatTimestamp(review.createdAt, localeFor(language))}</AppText>
            </View>
            <AppText accessibilityLabel={`${review.rating} / 5`} style={styles.strong}>★ {review.rating} / 5</AppText>
            <AppText style={[styles.verified, { textAlign: isRTL ? 'right' : 'left' }]}>{t('verifiedBooking')}</AppText>
            {review.comment ? <AppText style={[styles.copy, { textAlign: isRTL ? 'right' : 'left' }]}>{review.comment}</AppText> : null}
            {review.reply ? (
              <View style={styles.reply}>
                <AppText style={styles.strong}>{t('providerReply')}</AppText>
                <AppText style={[styles.copy, { textAlign: isRTL ? 'right' : 'left' }]}>{review.reply.body}</AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  state: { gap: spacing.sm, alignItems: 'flex-start' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  title: { fontWeight: typography.bold },
  score: { fontSize: 22, fontWeight: typography.bold },
  strong: { fontWeight: typography.semibold },
  muted: { color: colors.textMuted, fontSize: 12 },
  distribution: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  distributionItem: { color: colors.textSecondary, fontSize: 12 },
  item: { gap: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderColor: colors.border },
  verified: { color: colors.success, fontSize: 12 },
  copy: { lineHeight: 21, flexShrink: 1 },
  reply: { gap: spacing.xs, marginTop: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  outline: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.error },
});
