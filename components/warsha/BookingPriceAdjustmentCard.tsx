import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import type { Booking } from '@/src/bookings/booking-types';
import { useLocalization } from '@/src/i18n/localization';
import type { SupportedLanguage } from '@/src/i18n/language-preference';
import { usePaymentText } from '@/src/i18n/payment-translations';
import {
  compareMinor,
  egpDecimalToMinor,
  formatMinor,
  subtractMinor,
} from '@/src/payments/money';
import { usePayments } from '@/src/payments/payment-context';
import type { PriceAdjustment } from '@/src/payments/payment-types';
import { AppText } from './Typography';
import { BrandLoadingMark as ActivityIndicator } from './BrandMark';

const providerCanPropose = new Set(['job_started', 'awaiting_quote_approval', 'work_in_progress']);

export function BookingPriceAdjustmentCard({
  booking,
  role,
}: {
  booking: Booking;
  role: 'customer' | 'provider';
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const pt = usePaymentText();
  const payments = usePayments();
  const [adjustment, setAdjustment] = useState<PriceAdjustment | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentMinor = egpDecimalToMinor(String(booking.priceBreakdown?.estimatedTotal ?? booking.price));

  const reload = useCallback(async () => {
    try {
      setAdjustment(await payments.getPriceAdjustment(booking.id));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : pt('paymentUnavailable'));
    } finally {
      setLoading(false);
    }
  }, [booking.id, payments, pt]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <View style={styles.card}><ActivityIndicator color={colors.white} /></View>;
  if (!adjustment && (role === 'customer' || !providerCanPropose.has(booking.status))) return null;

  const propose = async () => {
    try {
      const next = await payments.proposePriceAdjustment(
        booking.id,
        egpDecimalToMinor(amount),
        reason.trim(),
      );
      setAdjustment(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : pt('paymentFailed'));
    }
  };

  const respond = async (accept: boolean) => {
    if (!adjustment) return;
    try {
      await payments.respondPriceAdjustment(adjustment.id, accept);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : pt('paymentFailed'));
    }
  };

  return (
    <View style={styles.card}>
      <AppText style={styles.title}>{pt('priceChange')}</AppText>
      {adjustment ? (
        <>
          <MoneyRow label={pt('oldTotal')} value={formatMinor(currentMinor, language)} />
          <MoneyRow label={pt('newTotal')} value={formatMinor(adjustment.proposedTotalMinor, language)} />
          <MoneyRow
            label={pt('difference')}
            value={formatDifference(currentMinor, adjustment.proposedTotalMinor, language)}
          />
          <AppText style={styles.reason}>{adjustment.reason}</AppText>
          {role === 'customer' ? (
            <View style={styles.actions}>
              <Pressable onPress={() => void respond(true)} style={styles.primary}>
                <AppText style={styles.primaryText}>{pt('acceptPriceChange')}</AppText>
              </Pressable>
              <Pressable onPress={() => void respond(false)} style={styles.outline}>
                <AppText>{pt('rejectPriceChange')}</AppText>
              </Pressable>
            </View>
          ) : <AppText style={styles.note}>{pt('waitingPriceApproval')}</AppText>}
        </>
      ) : (
        <>
          <AppText style={styles.note}>{pt('proposePrice')}</AppText>
          <TextInput
            accessibilityLabel={pt('newTotal')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={pt('newTotal')}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
          />
          <TextInput
            accessibilityLabel={pt('changeReason')}
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder={pt('changeReason')}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.multiline, { textAlign: isRTL ? 'right' : 'left' }]}
          />
          <Pressable
            disabled={!amount || reason.trim().length < 3 || payments.actionInFlight !== null}
            onPress={() => void propose()}
            style={[styles.primary, (!amount || reason.trim().length < 3) && styles.disabled]}>
            <AppText style={styles.primaryText}>{pt('sendPriceChange')}</AppText>
          </Pressable>
        </>
      )}
      {error ? <AppText accessibilityRole="alert" style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

function formatDifference(
  previous: string,
  proposed: string,
  language: SupportedLanguage,
) {
  const comparison = compareMinor(proposed, previous);
  if (comparison === 0) return formatMinor('0', language);
  const amount = comparison > 0
    ? subtractMinor(proposed, previous)
    : subtractMinor(previous, proposed);
  return `${comparison > 0 ? '+' : '−'}${formatMinor(amount, language)}`;
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <View style={[styles.row, isRTL && styles.reverse]}>
      <AppText style={styles.note}>{label}</AppText>
      <AppText style={styles.value}>{value}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface },
  title: { fontSize: 17, fontWeight: typography.bold },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  reason: { color: colors.textSecondary, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  value: { fontWeight: typography.bold },
  input: { minHeight: 52, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, color: colors.white },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  actions: { gap: spacing.sm },
  primary: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.white },
  primaryText: { color: colors.background, fontWeight: typography.bold, textAlign: 'center' },
  outline: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  disabled: { opacity: 0.4 },
  error: { color: colors.error, fontSize: 12 },
});
