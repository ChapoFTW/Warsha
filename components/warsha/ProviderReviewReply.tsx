import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './Typography';
import { BrandLoadingMark as ActivityIndicator } from './BrandMark';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { realtimeService } from '@/src/realtime/realtime-service';
import { useReviews } from '@/src/reviews/review-context';
import type { BookingReview } from '@/src/reviews/review-types';
import { formatTimestamp, localeFor } from '@/src/utils/date-format';

export function ProviderReviewReply({ bookingId }: { bookingId: string }) {
  const { t, isRTL, language } = useLocalization();
  const { getBookingReview, reply, busy, revision } = useReviews();
  const [review, setReview] = useState<BookingReview>();
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const request = useRef(0);
  const scope = useRef(revision);
  scope.current = revision;

  const load = useCallback(async () => {
    const current = ++request.current;
    const targetRevision = revision;
    setLoading(true);
    setError(false);
    setReview(undefined);
    try {
      const next = await getBookingReview(bookingId);
      if (request.current === current && scope.current === targetRevision) setReview(next);
    } catch {
      if (request.current === current && scope.current === targetRevision) setError(true);
    } finally {
      if (request.current === current && scope.current === targetRevision) setLoading(false);
    }
  }, [bookingId, getBookingReview, revision]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  useEffect(() => {
    let firstConnection = true;
    const reconcile = () => { void load(); };
    const connection = (status: 'connected' | 'reconnecting' | 'error') => {
      if (status !== 'connected') return;
      if (firstConnection) firstConnection = false;
      else reconcile();
    };
    return review?.id
      ? realtimeService.reviewDetail(review.id, reconcile, connection)
      : realtimeService.bookingReview(bookingId, reconcile, connection);
  }, [bookingId, load, review?.id]);

  const submit = async () => {
    const body = text.trim();
    if (!body || submitting || busy || !review) return;
    setSubmitting(true);
    setError(false);
    try {
      await reply(review.id, body);
      setText('');
      await load();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <ActivityIndicator accessibilityLabel={t('customerReview')} color={colors.white} />;
  }
  if (error && !review) {
    return (
      <View style={styles.state}>
        <AppText style={styles.error}>{t('reviewLoadError')}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={t('tryAgain')} onPress={() => void load()} style={styles.outline}>
          <AppText>{t('tryAgain')}</AppText>
        </Pressable>
      </View>
    );
  }
  if (!review) return <AppText style={styles.muted}>{t('noReviewYet')}</AppText>;

  const reviewerName = review.reviewerName === 'Customer' ? t('reviewCustomer') : review.reviewerName;
  return (
    <View style={styles.wrap}>
      <View style={[styles.row, isRTL && styles.reverse]}>
        <AppText style={styles.strong}>{reviewerName}</AppText>
        <AppText style={styles.muted}>{formatTimestamp(review.createdAt, localeFor(language))}</AppText>
      </View>
      <AppText accessibilityLabel={`${review.rating} / 5`} style={styles.rating}>★ {review.rating} / 5</AppText>
      <AppText style={[styles.verified, { textAlign: isRTL ? 'right' : 'left' }]}>{t('verifiedBooking')}</AppText>
      {review.comment ? <AppText style={[styles.copy, { textAlign: isRTL ? 'right' : 'left' }]}>{review.comment}</AppText> : null}
      {review.attachments.length ? (
        <ScrollView horizontal contentContainerStyle={styles.images}>
          {review.attachments.map((attachment) => attachment.url ? (
            <Image key={attachment.id} source={{ uri: attachment.url }} style={styles.image} />
          ) : (
            <AppText key={attachment.id}>{t('reviewImageUnavailable')}</AppText>
          ))}
        </ScrollView>
      ) : null}
      {review.reply ? (
        <View style={styles.reply}>
          <AppText style={styles.strong}>{t('providerReply')}</AppText>
          <AppText style={[styles.copy, { textAlign: isRTL ? 'right' : 'left' }]}>{review.reply.body}</AppText>
          <AppText style={styles.muted}>{formatTimestamp(review.reply.createdAt, localeFor(language))}</AppText>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            accessibilityLabel={t('writeReply')}
            value={text}
            onChangeText={setText}
            maxLength={1500}
            multiline
            placeholder={t('writeReply')}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
          />
          {error ? <AppText style={styles.error}>{t('reviewReplyError')}</AppText> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sendReply')}
            disabled={busy || submitting || !text.trim()}
            onPress={() => void submit()}
            style={[styles.button, (busy || submitting || !text.trim()) && styles.disabled]}
          >
            {busy || submitting
              ? <ActivityIndicator color={colors.background} />
              : <AppText style={styles.buttonText}>{t('sendReply')}</AppText>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  state: { gap: spacing.sm, alignItems: 'flex-start' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  strong: { fontWeight: typography.semibold },
  muted: { color: colors.textMuted, fontSize: 12 },
  rating: { fontSize: 17, fontWeight: typography.bold },
  verified: { color: colors.success, fontSize: 12 },
  copy: { lineHeight: 21, flexShrink: 1 },
  images: { gap: spacing.sm },
  image: { width: 88, height: 88, borderRadius: radii.md },
  reply: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  form: { gap: spacing.sm },
  input: { minHeight: 90, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, color: colors.white, padding: spacing.sm, textAlignVertical: 'top' },
  button: { minHeight: 48, borderRadius: radii.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  outline: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.background, fontWeight: typography.bold },
  error: { color: colors.error },
  disabled: { opacity: 0.5 },
});
