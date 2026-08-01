import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/warsha/Typography';
import { EmptyState } from '@/components/warsha/BrandUI';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/src/auth/auth-context';
import { useBookings } from '@/src/bookings/booking-context';
import { bookingStatusTranslationKeys, terminalStatuses, type Booking } from '@/src/bookings/booking-types';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';
import { useReviews } from '@/src/reviews/review-context';
import { formatBookingDateTime, formatNumber, localeFor } from '@/src/utils/date-format';

type Tab = 'upcoming' | 'past' | 'cancelled';

export default function Orders() {
  const { bookings, loading, error, reload } = useBookings();
  const { mode, user } = useAuth();
  const { t } = useLocalization();
  const { getReviewedBookingIds, revision: reviewsRevision } = useReviews();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [reviewStateLoading, setReviewStateLoading] = useState(false);
  const [reviewStateError, setReviewStateError] = useState(false);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  const accountKey = mode === 'mock' ? 'mock-customer' : user?.id ?? null;
  const completedIds = useMemo(
    () => [...new Set(bookings.filter(booking => booking.status === 'completed').map(booking => booking.id))],
    [bookings],
  );

  useEffect(() => () => {
    mounted.current = false;
    requestGeneration.current += 1;
  }, []);

  useEffect(() => {
    requestGeneration.current += 1;
    setReviewedIds(new Set());
    setReviewStateError(false);
    setReviewStateLoading(false);
  }, [accountKey]);

  const loadReviewState = useCallback(async () => {
    const targetAccount = accountKey;
    const request = ++requestGeneration.current;
    if (!targetAccount || !completedIds.length) {
      if (mounted.current && request === requestGeneration.current) {
        setReviewedIds(new Set());
        setReviewStateError(false);
        setReviewStateLoading(false);
      }
      return;
    }
    setReviewStateLoading(true);
    setReviewStateError(false);
    try {
      const ids = await getReviewedBookingIds(completedIds);
      if (!mounted.current || request !== requestGeneration.current || targetAccount !== accountKey) return;
      setReviewedIds(new Set(ids));
    } catch {
      if (!mounted.current || request !== requestGeneration.current || targetAccount !== accountKey) return;
      setReviewedIds(new Set());
      setReviewStateError(true);
    } finally {
      if (mounted.current && request === requestGeneration.current && targetAccount === accountKey) {
        setReviewStateLoading(false);
      }
    }
  }, [accountKey, completedIds, getReviewedBookingIds]);

  useFocusEffect(useCallback(() => {
    if (reviewsRevision >= 0) void loadReviewState();
    return () => {
      requestGeneration.current += 1;
    };
  }, [loadReviewState, reviewsRevision]));

  const visible = bookings.filter(booking =>
    tab === 'cancelled'
      ? booking.status === 'cancelled'
      : tab === 'past'
        ? (terminalStatuses.includes(booking.status) || booking.status === 'completed') && booking.status !== 'cancelled'
        : !terminalStatuses.includes(booking.status) && booking.status !== 'completed',
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <AppText style={styles.title}>{t('orders')}</AppText>
        <View style={styles.tabs}>
          {(['upcoming', 'past', 'cancelled'] as Tab[]).map(item => (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.active]}>
              <AppText style={[styles.tabText, tab === item && styles.activeText]}>
                {t(item === 'cancelled' ? 'cancelledTab' : item)}
              </AppText>
            </Pressable>
          ))}
        </View>
        {reviewStateError ? (
          <View style={styles.reviewError}>
            <AppText style={styles.reviewErrorText}>{t('reviewStatusLoadError')}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tryAgain')}
              onPress={() => void loadReviewState()}
              style={styles.reviewRetry}>
              <AppText style={styles.reviewRetryText}>{t('tryAgain')}</AppText>
            </Pressable>
          </View>
        ) : null}
      </View>
      {loading ? (
        <View style={styles.center}><EmptyState title={t('orders')} loading /></View>
      ) : error ? (
        <View style={styles.center}><EmptyState title={t('genericTryAgain')} icon="error-outline" action={t('tryAgain')} onAction={() => void reload()} /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <OrderCard booking={item} reviewed={reviewedIds.has(item.id)} reviewStateLoading={reviewStateLoading} canReview={Boolean(accountKey)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <EmptyState title={t('noBookings')} icon="receipt-long" />
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function OrderCard({ booking, reviewed, reviewStateLoading, canReview }: { booking: Booking; reviewed: boolean; reviewStateLoading: boolean; canReview: boolean }) {
  const { t, isRTL, language } = useLocalization();
  const { getProvider } = useMarketplaceData();
  const provider = getProvider(booking.providerId);
  if (!provider) return null;
  const openDetails = (focusReview = false) => router.push({
    pathname: '/booking/[id]',
    params: { id: booking.id, ...(focusReview ? { focusReview: '1' } : {}) },
  });
  return (
    <Pressable onPress={() => openDetails()} style={[styles.card, isRTL && { direction: 'rtl' }]}>
      <View style={styles.top}>
        <Image source={{ uri: provider.image }} style={styles.avatar} />
        <View style={styles.grow}>
          <View style={styles.between}>
            <AppText style={styles.name}>{provider.name}</AppText>
            <View style={[styles.badge, booking.status === 'cancelled' && styles.cancelBadge]}>
              <AppText style={[styles.badgeText, booking.status === 'cancelled' && styles.cancelText]}>
                {t(bookingStatusTranslationKeys[booking.status])}
              </AppText>
            </View>
          </View>
          <AppText style={styles.service}>{booking.serviceName}</AppText>
          <AppText style={styles.meta}>{formatBookingDateTime(booking.date, booking.time, localeFor(language), t('asap'))}</AppText>
        </View>
      </View>
      <View style={styles.bottom}>
        <AppText style={styles.price}>{formatNumber(booking.priceBreakdown?.estimatedTotal ?? booking.price, language)} {t('currency')}</AppText>
        <View style={styles.detailLink}>
          <AppText style={styles.details}>{t('viewDetails')}</AppText>
          <MaterialIcons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={15} color={colors.white} />
        </View>
      </View>
      {canReview && booking.status === 'completed' && !reviewStateLoading ? reviewed ? (
        <AppText accessibilityLabel={`${t('reviewedAccessibility')}: ${provider.name}`} style={styles.reviewed}>
          <MaterialIcons name="check-circle" size={15} color={colors.success} /> {t('reviewed')}
        </AppText>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('rateServiceAccessibility')}: ${provider.name}, ${booking.serviceName}`}
          onPress={event => {
            event.stopPropagation();
            openDetails(true);
          }}
          style={styles.rateAction}>
          <MaterialIcons name="star-outline" size={18} color={colors.background} />
          <AppText style={styles.rateActionText}>{t('rateService')}</AppText>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  title: { fontSize: 28, fontWeight: typography.bold },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: colors.white },
  tabText: { fontSize: 12, color: colors.textSecondary, fontWeight: typography.semibold },
  activeText: { color: colors.background, fontWeight: typography.bold },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxxl },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retry: { backgroundColor: colors.white, padding: spacing.md, borderRadius: radii.md },
  reviewError: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reviewErrorText: { flex: 1, color: colors.error, fontSize: 12 },
  reviewRetry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  reviewRetryText: { fontSize: 12, fontWeight: typography.semibold },
  card: { padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, gap: spacing.md },
  top: { flexDirection: 'row', gap: spacing.md },
  avatar: { width: 68, height: 78, borderRadius: radii.md },
  grow: { flex: 1, gap: 4 },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 16, fontWeight: typography.semibold, flexShrink: 1 },
  badge: { maxWidth: 120, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  badgeText: { fontSize: 9, color: colors.success, textAlign: 'center' },
  cancelBadge: { backgroundColor: colors.errorSoft },
  cancelText: { color: colors.error },
  service: { fontSize: 13, color: colors.textSecondary },
  meta: { fontSize: 11, color: colors.textMuted },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  price: { fontSize: 15, fontWeight: typography.bold },
  detailLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  details: { fontSize: 12, fontWeight: typography.semibold },
  rateAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radii.md },
  rateActionText: { color: colors.background, fontWeight: typography.bold },
  reviewed: { color: colors.success, fontSize: 12, fontWeight: typography.semibold, textAlign: 'center' },
});
