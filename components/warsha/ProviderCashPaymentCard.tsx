import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { usePaymentText } from '@/src/i18n/payment-translations';
import { formatMinor } from '@/src/payments/money';
import { usePayments } from '@/src/payments/payment-context';
import type { ProviderBookingPayment } from '@/src/payments/payment-types';
import { AppText } from './Typography';

export function ProviderCashPaymentCard({ bookingId, completed }: { bookingId: string; completed: boolean }) {
  const { language } = useLocalization();
  const pt = usePaymentText();
  const payments = usePayments();
  const [payment, setPayment] = useState<ProviderBookingPayment | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setPayment(await payments.getProviderBookingPayment(bookingId));
    } catch {
      setPayment(null);
    } finally {
      setLoading(false);
    }
  }, [bookingId, payments]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <View style={styles.card}><ActivityIndicator color={colors.white} /></View>;
  if (!payment || payment.paymentMethod !== 'cash') return null;
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <MaterialIcons name="payments" size={23} color={colors.white} />
        <AppText style={styles.title}>{pt('cash')}</AppText>
      </View>
      <AppText style={styles.amount}>{formatMinor(payment.amountMinor, language)}</AppText>
      <AppText style={styles.note}>
        {pt('cashCommissionDue')}: {formatMinor(payment.commissionMinor, language)}
      </AppText>
      {payment.status === 'awaiting_payment' && completed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pt('reportCashCollected')}
          disabled={payments.actionInFlight !== null}
          onPress={() => void payments.confirmCashCollected(bookingId).then(() => reload())}
          style={styles.primary}>
          <AppText style={styles.primaryText}>{pt('reportCashCollected')}</AppText>
        </Pressable>
      ) : null}
      {payment.status === 'pending' ? <AppText style={styles.note}>{pt('cashReported')}</AppText> : null}
      {payment.status === 'paid' ? <AppText style={styles.success}>{pt('paymentSuccessful')}</AppText> : null}
      {payment.status === 'failed' ? <AppText style={styles.error}>{pt('paymentFailed')}</AppText> : null}
      <AppText style={styles.note}>{pt('cashNotice')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 17, fontWeight: typography.bold },
  amount: { fontSize: 24, fontWeight: typography.bold },
  primary: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radii.lg, backgroundColor: colors.white },
  primaryText: { color: colors.background, fontWeight: typography.bold },
  note: { color: colors.warning, fontSize: 11, lineHeight: 17 },
  success: { color: colors.success, fontWeight: typography.semibold },
  error: { color: colors.error, fontWeight: typography.semibold },
});
