import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandLoadingMark as ActivityIndicator } from '@/components/warsha/BrandMark';

import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useLocalization } from '@/src/i18n/localization';
import { usePaymentText } from '@/src/i18n/payment-translations';
import { normalizeEgyptianPhone } from '@/src/auth/phone-auth';
import { compareMinor, egpDecimalToMinor, formatMinor } from '@/src/payments/money';
import { usePayments } from '@/src/payments/payment-context';
import type { PayoutDestinationType } from '@/src/payments/payment-types';
import { formatTimestamp, localeFor } from '@/src/utils/date-format';

const destinationTypes: PayoutDestinationType[] = [
  'mobile_wallet',
  'bank_account',
];

export default function ProviderEarningsScreen() {
  const { language, isRTL, t } = useLocalization();
  const pt = usePaymentText();
  const payments = usePayments();
  const [destinationType, setDestinationType] = useState<PayoutDestinationType>('mobile_wallet');
  const [destinationLabel, setDestinationLabel] = useState('');
  const [destinationValue, setDestinationValue] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showDestination, setShowDestination] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const summary = payments.earnings;
  const preferredDestination = payments.destinations.find(item => item.isPreferred) ?? payments.destinations[0];
  const canWithdraw = Boolean(
    summary?.withdrawalsEnabled
    && compareMinor(summary.availableMinor, summary.minimumWithdrawalMinor) >= 0,
  );

  const saveDestination = async () => {
    if (!destinationLabel.trim() || !destinationValue.trim() || !ownershipConfirmed) {
      Alert.alert(pt('payoutDestination'), pt('configuredLater'));
      return;
    }
    const normalizedValue = destinationType === 'mobile_wallet'
      ? normalizeEgyptianPhone(destinationValue)
      : destinationValue.trim();
    if (!normalizedValue) {
      Alert.alert(pt('payoutDestination'), t('authInvalidPhone'));
      return;
    }
    try {
      await payments.saveDestination({
        type: destinationType,
        label: destinationLabel.trim(),
        value: normalizedValue,
        idempotencyKey: `destination-${destinationType}-${normalizedValue.replace(/\s/g, '')}`,
      });
      setDestinationValue('');
      setOwnershipConfirmed(false);
      setShowDestination(false);
    } catch (reason) {
      Alert.alert(pt('payoutDestination'), reason instanceof Error ? reason.message : pt('configuredLater'));
    }
  };

  const withdraw = async () => {
    if (!preferredDestination) {
      setShowDestination(true);
      return;
    }
    try {
      const amount = egpDecimalToMinor(withdrawAmount);
      await payments.withdraw(
        amount,
        preferredDestination.id,
        `withdrawal-${Date.now().toString(36)}`,
      );
      setWithdrawAmount('');
      setShowWithdraw(false);
      Alert.alert(pt('withdrawalRequested'), pt('withdrawalRequestedBody'));
    } catch {
      Alert.alert(pt('withdraw'), pt('invalidAmount'));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={payments.loadingEarnings} onRefresh={() => void payments.reloadEarnings()} tintColor={colors.white} />}
          contentContainerStyle={[styles.content, isRTL && styles.rtl]}
          keyboardShouldPersistTaps="handled">
          <ScreenHeader title={pt('earnings')} />
          {payments.loadingEarnings && !summary ? <ActivityIndicator color={colors.white} /> : null}
          <View style={styles.hero}>
            <AppText style={styles.muted}>{pt('availableWithdraw')}</AppText>
            <AppText
              accessibilityLabel={`${pt('availableWithdraw')}: ${formatMinor(summary?.availableMinor ?? '0', language)}`}
              style={styles.amount}>
              {formatMinor(summary?.availableMinor ?? '0', language)}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={pt('withdraw')}
              disabled={!canWithdraw || payments.actionInFlight !== null}
              onPress={() => setShowWithdraw(current => !current)}
              style={[styles.primary, !canWithdraw && styles.disabled]}>
              <MaterialIcons name="arrow-upward" size={22} color={colors.background} />
              <AppText style={styles.primaryText}>{pt('withdraw')}</AppText>
            </Pressable>
          </View>

          <View style={styles.metrics}>
            <Metric label={pt('pending')} value={formatMinor(summary?.pendingMinor ?? '0', language)} />
            <Metric label={pt('paidOut')} value={formatMinor(summary?.paidOutMinor ?? '0', language)} />
          </View>
          <View style={styles.metrics}>
            <Metric
              label={pt('cashCommissionDue')}
              value={formatMinor(summary?.cashCommissionDueMinor ?? '0', language)}
            />
            <Metric
              label={pt('recoverableAdjustment')}
              value={formatMinor(summary?.recoverableAdjustmentMinor ?? '0', language)}
            />
          </View>
          {summary?.cashPaymentsRestricted
            ? <AppText style={styles.warning}>{pt('cashRestricted')}</AppText>
            : null}
          {summary ? (
            <AppText style={styles.muted}>
              {pt('minimumWithdrawal')}: {formatMinor(summary.minimumWithdrawalMinor, language)}
              {' · '}{pt('zeroWithdrawalFee')}
            </AppText>
          ) : null}
          {summary && !summary.withdrawalsEnabled
            ? <AppText style={styles.warning}>{pt('withdrawalUnavailable')}</AppText>
            : null}
          {summary?.withdrawalsEnabled
            ? <AppText style={styles.warning}>{pt('mockPayoutNotice')}</AppText>
            : null}

          <Card>
            <View style={styles.between}>
              <View style={styles.grow}>
                <AppText style={styles.title}>{pt('payoutDestination')}</AppText>
                <AppText style={styles.muted}>
                  {preferredDestination
                    ? `${preferredDestination.label} · ${preferredDestination.maskedValue}`
                    : pt('configuredLater')}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pt('saveDestination')}
                onPress={() => setShowDestination(current => !current)}
                style={styles.iconButton}>
                <MaterialIcons name={preferredDestination ? 'edit' : 'add'} size={24} color={colors.white} />
              </Pressable>
            </View>
            {showDestination ? (
              <View style={styles.form}>
                <View style={styles.options}>
                  {destinationTypes.map(type => (
                    <Pressable
                      key={type}
                      onPress={() => setDestinationType(type)}
                      style={[styles.option, destinationType === type && styles.selected]}>
                      <AppText style={styles.optionText}>{destinationLabelFor(type, pt)}</AppText>
                    </Pressable>
                  ))}
                </View>
                <Field label={pt('destinationLabel')} value={destinationLabel} onChangeText={setDestinationLabel} />
                <Field
                  label={pt('destinationValue')}
                  value={destinationValue}
                  onChangeText={setDestinationValue}
                  autoCapitalize="none"
                  keyboardType={destinationType === 'mobile_wallet' ? 'phone-pad' : 'default'}
                />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ownershipConfirmed }}
                  onPress={() => setOwnershipConfirmed(current => !current)}
                  style={styles.check}>
                  <MaterialIcons name={ownershipConfirmed ? 'check-box' : 'check-box-outline-blank'} size={24} color={colors.white} />
                  <AppText style={styles.checkText}>{pt('ownershipConfirm')}</AppText>
                </Pressable>
                <Pressable onPress={() => void saveDestination()} style={styles.primary}>
                  <AppText style={styles.primaryText}>{pt('saveDestination')}</AppText>
                </Pressable>
              </View>
            ) : null}
          </Card>

          {showWithdraw && summary?.withdrawalsEnabled ? (
            <Card>
              <AppText style={styles.title}>{pt('withdraw')}</AppText>
              <AppText style={styles.muted}>
                {preferredDestination
                  ? `${preferredDestination.label} · ${preferredDestination.maskedValue}`
                  : pt('configuredLater')}
              </AppText>
              <Field
                label={pt('amountToWithdraw')}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="decimal-pad"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pt('withdraw')}
                disabled={payments.actionInFlight !== null}
                onPress={() => void withdraw()}
                style={styles.primary}>
                {payments.actionInFlight === 'withdraw'
                  ? <ActivityIndicator color={colors.background} />
                  : <AppText style={styles.primaryText}>{pt('withdraw')}</AppText>}
              </Pressable>
            </Card>
          ) : null}

          <Card>
            <AppText style={styles.title}>{pt('recentTransactions')}</AppText>
            {summary?.transactions.length ? summary.transactions.map(item => (
              <View key={item.id} style={styles.transaction}>
                <View style={styles.grow}>
                  <AppText style={styles.transactionTitle}>{item.service}</AppText>
                  <AppText style={styles.muted}>{formatTimestamp(item.date, localeFor(language))}</AppText>
                  {item.status === 'held_for_dispute'
                    ? <AppText style={styles.warning}>{pt('heldIssue')}</AppText>
                    : <AppText style={styles.muted}>{earningStatus(item.status, pt)}</AppText>}
                  {item.status === 'pending_release' && item.releaseEligibleAt ? (
                    <AppText style={styles.muted}>
                      {pt('releaseEligible')}{' '}
                      {formatTimestamp(item.releaseEligibleAt, localeFor(language))}
                    </AppText>
                  ) : null}
                  {item.status === 'pending_release'
                    && summary
                    && !summary.automaticReleaseSchedulerEnabled
                    ? <AppText style={styles.warning}>{pt('schedulerNotActive')}</AppText>
                    : null}
                </View>
                <View style={styles.money}>
                  <AppText style={styles.transactionAmount}>{formatMinor(item.netMinor, language)}</AppText>
                  <AppText style={styles.muted}>{pt('warshaFee')}: {formatMinor(item.commissionMinor, language)}</AppText>
                  {item.debtOffsetMinor !== '0' ? (
                    <AppText style={styles.warning}>
                      {pt('debtOffset')}: {formatMinor(item.debtOffsetMinor, language)}
                    </AppText>
                  ) : null}
                </View>
              </View>
            )) : <AppText style={styles.muted}>{pt('noTransactions')}</AppText>}
          </Card>

          {payments.withdrawals.length ? (
            <Card>
              <AppText style={styles.title}>{pt('withdrawalHistory')}</AppText>
              {payments.withdrawals.map(item => (
                <View key={item.id} style={styles.transaction}>
                  <View style={styles.grow}>
                    <AppText style={styles.transactionTitle}>{item.destinationMasked}</AppText>
                    <AppText numberOfLines={1} style={styles.muted}>{item.reference}</AppText>
                  </View>
                  <View style={styles.money}>
                    <AppText style={styles.transactionAmount}>{formatMinor(item.amountMinor, language)}</AppText>
                    <AppText style={styles.muted}>{item.status}</AppText>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          {__DEV__ && payments.mode === 'mock' ? (
            <Card>
              <AppText style={styles.title}>{pt('mockControls')}</AppText>
              <Pressable onPress={() => void payments.makeEarningsAvailable()} style={styles.outline}>
                <AppText>{pt('simulateAvailable')}</AppText>
              </Pressable>
              {summary?.transactions.filter(item => ['available', 'held_for_dispute'].includes(item.status)).map(item => (
                <Pressable
                  key={item.id}
                  onPress={() => void payments.simulateEarningHold(item.id, item.status !== 'held_for_dispute')}
                  style={styles.outline}>
                  <AppText>{item.status === 'held_for_dispute' ? pt('simulateReleaseHold') : pt('simulateHold')}</AppText>
                </Pressable>
              ))}
              {payments.withdrawals.filter(item => item.status === 'requested').map(item => (
                <View key={item.id} style={styles.options}>
                  <Pressable onPress={() => void payments.simulateWithdrawal(item.id, 'paid')} style={styles.outline}>
                    <AppText>{pt('simulateWithdrawalPaid')}</AppText>
                  </Pressable>
                  <Pressable onPress={() => void payments.simulateWithdrawal(item.id, 'failed')} style={styles.outline}>
                    <AppText>{pt('simulateWithdrawalFailed')}</AppText>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : null}
          {payments.error ? <AppText accessibilityRole="alert" style={styles.error}>{payments.error}</AppText> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText style={styles.muted}>{label}</AppText>
      <AppText style={styles.metricValue}>{value}</AppText>
    </View>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { isRTL } = useLocalization();
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
      />
    </View>
  );
}

function destinationLabelFor(type: PayoutDestinationType, pt: ReturnType<typeof usePaymentText>) {
  if (type === 'mobile_wallet') return pt('mobileWallet');
  return pt('bankAccount');
}

function earningStatus(status: string, pt: ReturnType<typeof usePaymentText>) {
  if (status === 'available') return pt('availableWithdraw');
  if (status === 'paid_out') return pt('paidOut');
  return pt('pending');
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  rtl: { direction: 'rtl' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radii.xl, backgroundColor: colors.surface },
  amount: { fontSize: 34, fontWeight: typography.bold, textAlign: 'center' },
  primary: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.white },
  primaryText: { color: colors.background, fontWeight: typography.bold },
  disabled: { opacity: 0.4 },
  metrics: { flexDirection: 'row', gap: spacing.md },
  metric: { flex: 1, minHeight: 92, justifyContent: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg },
  metricValue: { fontSize: 17, fontWeight: typography.bold },
  card: { gap: spacing.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, backgroundColor: colors.surface },
  between: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1, gap: 3 },
  title: { fontSize: 18, fontWeight: typography.bold },
  muted: { fontSize: 11, lineHeight: 17, color: colors.textMuted },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.border },
  form: { gap: spacing.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  selected: { borderColor: colors.white, backgroundColor: colors.surfaceElevated },
  optionText: { fontSize: 12 },
  field: { gap: spacing.sm },
  fieldLabel: { fontSize: 12, fontWeight: typography.semibold },
  input: { minHeight: 54, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceElevated, color: colors.white },
  check: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkText: { flex: 1, fontSize: 12, lineHeight: 18 },
  transaction: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  transactionTitle: { fontSize: 13, fontWeight: typography.semibold },
  transactionAmount: { fontSize: 13, fontWeight: typography.bold },
  money: { alignItems: 'flex-end', gap: 3, maxWidth: '48%' },
  warning: { color: colors.warning, fontSize: 11, lineHeight: 17 },
  outline: { minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  error: { color: colors.error, fontSize: 12 },
});
