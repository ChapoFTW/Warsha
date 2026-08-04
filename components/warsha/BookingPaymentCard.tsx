import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import type { Booking } from '@/src/bookings/booking-types';
import { useMarketplaceData } from '@/src/data/marketplace-context';
import { useLocalization } from '@/src/i18n/localization';
import { usePaymentText } from '@/src/i18n/payment-translations';
import { egpDecimalToMinor, formatMinor } from '@/src/payments/money';
import { usePayments } from '@/src/payments/payment-context';
import type {
  BookingPayment,
  BookingPaymentOptions,
  PaymentMethod,
  PaymentReceipt,
} from '@/src/payments/payment-types';
import { realtimeService } from '@/src/realtime/realtime-service';
import { AppText } from './Typography';
import { BrandLoadingMark as ActivityIndicator } from './BrandMark';

const eligibleStatuses = new Set([
  'accepted',
  'confirmed',
  'provider_on_the_way',
  'provider_arrived',
  'job_started',
  'awaiting_quote_approval',
  'work_in_progress',
  'awaiting_customer_confirmation',
  'completed',
]);

export function BookingPaymentCard({ booking }: { booking: Booking }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const pt = usePaymentText();
  const payments = usePayments();
  const marketplace = useMarketplaceData();
  const provider = marketplace.getProvider(booking.providerId);
  const [payment, setPayment] = useState<BookingPayment | null>(null);
  const [options, setOptions] = useState<BookingPaymentOptions | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [completionConfirmed, setCompletionConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const total = booking.priceBreakdown?.estimatedTotal ?? booking.price;

  const reload = useCallback(async () => {
    try {
      const [next, nextOptions] = await Promise.all([
        payments.getBookingPayment(booking.id),
        payments.getBookingPaymentOptions(booking.id, booking.providerId),
      ]);
      if (!mounted.current) return;
      setPayment(next);
      setOptions(nextOptions);
      setReceipt(next && ['paid', 'partially_refunded', 'refunded'].includes(next.status)
        ? await payments.getReceipt(booking.id)
        : null);
      setError(null);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : pt('paymentUnavailable'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [booking.id, booking.providerId, payments, pt]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void reload();
    });
    const unsubscribe = realtimeService.bookingPayment(booking.id, () => void reload());
    return () => {
      mounted.current = false;
      appState.remove();
      unsubscribe();
    };
  }, [booking.id, reload]);

  if (!eligibleStatuses.has(booking.status)) return null;

  const checkout = async (method: PaymentMethod) => {
    setError(null);
    try {
      const isRetry = method === 'online' && payment?.status === 'failed';
      const next = await payments.checkout({
        bookingId: booking.id,
        providerId: booking.providerId,
        providerName: provider?.name ?? '',
        service: booking.serviceName,
        totalMinor: egpDecimalToMinor(String(total)),
        method,
        idempotencyKey: isRetry
          ? `checkout-${booking.id}-${method}-retry-${Date.now().toString(36)}`
          : `checkout-${booking.id}-${method}`,
      });
      setPayment(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : pt('paymentUnavailable'));
    }
  };

  const simulate = async (outcome: 'pending' | 'success' | 'failure') => {
    if (!payment) return;
    try {
      setPayment(await payments.simulatePayment(payment.paymentId, outcome));
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : pt('paymentFailed'));
    }
  };

  return (
    <View style={styles.card}>
      <View style={[styles.heading, isRTL && styles.reverse]}>
        <MaterialIcons name="payments" size={23} color={colors.white} />
        <AppText style={styles.title}>{pt('payment')}</AppText>
      </View>
      {loading ? <ActivityIndicator color={colors.white} /> : null}
      {!loading && !payment ? (
        <>
          <AppText style={styles.muted}>{pt('paymentNotStarted')}</AppText>
          <MoneyRow label={pt('total')} value={formatMinor(egpDecimalToMinor(String(total)), language)} />
          {options?.onlineEnabled ? (
            <>
              {options.onlineDevelopmentOnly
                ? <AppText style={styles.warning}>{pt('mockOnlineNotice')}</AppText>
                : null}
              <AppText style={styles.note}>{pt('hostedCheckoutNotice')}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pt('payNow')}
                disabled={payments.actionInFlight !== null}
                onPress={() => void checkout('online')}
                style={styles.primary}>
                <AppText style={styles.primaryText}>{pt('payNow')}</AppText>
              </Pressable>
            </>
          ) : null}
          {options?.cashEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pt('payCash')}
              disabled={payments.actionInFlight !== null}
              onPress={() => void checkout('cash')}
              style={styles.outline}>
              <AppText style={styles.buttonText}>{pt('payCash')}</AppText>
            </Pressable>
          ) : options?.cashRestrictionReason ? (
            <AppText style={styles.note}>{pt('cashRestricted')}</AppText>
          ) : null}
          {options && !options.onlineEnabled && !options.cashEnabled
            ? <AppText style={styles.note}>{pt('paymentUnavailable')}</AppText>
            : null}
        </>
      ) : null}
      {payment ? (
        <>
          <View style={styles.status}>
            <MaterialIcons
              name={payment.status === 'paid' ? 'check-circle' : payment.status === 'failed' ? 'error-outline' : 'schedule'}
              size={24}
              color={payment.status === 'paid' ? colors.success : payment.status === 'failed' ? colors.error : colors.warning}
            />
            <AppText style={styles.title}>{statusLabel(payment, pt)}</AppText>
          </View>
          <MoneyRow label={pt('total')} value={formatMinor(payment.amountMinor, language, payment.currency)} />
          <MoneyRow label={pt('paymentMethod')} value={payment.paymentMethod === 'cash' ? pt('cash') : pt('online')} />
          <MoneyRow label={pt('reference')} value={payment.reference} />
          {payment.paymentMethod === 'cash' ? <AppText style={styles.note}>{pt('cashNotice')}</AppText> : null}
          {payment.paymentMethod === 'cash' && payment.status === 'pending' ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pt('confirmCashPaid')}
                onPress={() => void payments.respondCashCollection(booking.id, true).then(() => reload())}
                style={styles.primary}>
                <AppText style={styles.primaryText}>{pt('confirmCashPaid')}</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pt('denyCashPaid')}
                onPress={() => void payments.respondCashCollection(booking.id, false).then(() => reload())}
                style={styles.outline}>
                <AppText>{pt('denyCashPaid')}</AppText>
              </Pressable>
            </View>
          ) : null}
          {payment.status === 'failed' && options?.onlineEnabled ? (
            <Pressable onPress={() => void checkout('online')} style={styles.primary}>
              <AppText style={styles.primaryText}>{pt('tryAgain')}</AppText>
            </Pressable>
          ) : null}
          {booking.status === 'completed'
            && payment.paymentMethod === 'online'
            && payment.status === 'paid'
            && !completionConfirmed ? (
              <Pressable
                disabled={payments.actionInFlight !== null}
                onPress={() => void payments.confirmBookingCompletion(booking.id)
                  .then(() => setCompletionConfirmed(true))}
                style={styles.outline}>
                <AppText style={styles.buttonText}>{pt('confirmCompletion')}</AppText>
              </Pressable>
            ) : null}
          {completionConfirmed
            ? <AppText style={styles.success}>{pt('completionConfirmed')}</AppText>
            : null}
          {receipt ? (
            <View style={styles.receipt}>
              <AppText style={styles.title}>{pt('receipt')}</AppText>
              <MoneyRow label={pt('reference')} value={receipt.transactionReference} />
              <MoneyRow
                label={pt('approvedJobPrice')}
                value={formatMinor(receipt.approvedJobPriceMinor, language)}
              />
              {receipt.promotionMinor !== '0' ? (
                <MoneyRow
                  label={pt('promotion')}
                  value={`−${formatMinor(receipt.promotionMinor, language)}`}
                />
              ) : null}
              <MoneyRow label={pt('amountPaid')} value={formatMinor(receipt.amountMinor, language)} />
              {receipt.refundedMinor !== '0' ? (
                <MoneyRow label={pt('refundAmount')} value={formatMinor(receipt.refundedMinor, language)} />
              ) : null}
            </View>
          ) : null}
          {__DEV__ && payments.mode === 'mock' && payment.paymentMethod === 'online' ? (
            <View style={styles.dev}>
              <AppText style={styles.muted}>{pt('mockControls')}</AppText>
              <View style={styles.actions}>
                <DevAction label={pt('simulatePending')} onPress={() => void simulate('pending')} />
                <DevAction label={pt('simulateSuccess')} onPress={() => void simulate('success')} />
                <DevAction label={pt('simulateFailure')} onPress={() => void simulate('failure')} />
                {payment.status === 'paid'
                  ? <DevAction label={pt('simulateRefund')} onPress={() => void payments.simulateRefund(payment.paymentId).then(() => reload())} />
                  : null}
              </View>
            </View>
          ) : null}
        </>
      ) : null}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

function statusLabel(payment: BookingPayment, pt: ReturnType<typeof usePaymentText>) {
  if (payment.status === 'paid') return pt('paymentSuccessful');
  if (payment.status === 'failed') return pt('paymentFailed');
  return pt('paymentPending');
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <View style={[styles.row, isRTL && styles.reverse]}>
      <AppText style={styles.muted}>{label}</AppText>
      <AppText numberOfLines={2} style={styles.value}>{value}</AppText>
    </View>
  );
}

function DevAction({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={styles.devButton}>
      <AppText style={styles.devText}>{label}</AppText>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: radii.lg, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  title: { fontSize: 17, fontWeight: typography.semibold },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  note: { color: colors.warning, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.lg },
  value: { flex: 1.5, fontWeight: typography.semibold, textAlign: 'right' },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.white },
  primaryText: { color: colors.background, fontWeight: typography.bold },
  outline: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border },
  buttonText: { fontWeight: typography.semibold },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  receipt: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceElevated },
  dev: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  devButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  devText: { fontSize: 11 },
  error: { color: colors.error, fontSize: 12, lineHeight: 18 },
  success: { color: colors.success, fontSize: 12, lineHeight: 18 },
  warning: { color: colors.warning, fontSize: 12, fontWeight: typography.semibold, lineHeight: 18 },
});
