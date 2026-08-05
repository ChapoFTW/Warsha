import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { usePrivacy } from '@/src/privacy/privacy-context';
import { usePrivacyText } from '@/src/privacy/privacy-translations';
import { hoursUntil, isActionableBlocker, needsAction } from '@/src/privacy/privacy-types';

/**
 * Account deletion.
 *
 * The confirmation is a second deliberate press, not a phrase to type. Asking
 * someone to type DELETE is hostile to anyone using a screen reader, anyone on
 * a phone in Arabic, and anyone with a tremor — and it does not actually
 * establish intent, only dexterity. Two clearly-labelled buttons do.
 *
 * The screen states what remains BEFORE the request, not after it. Discovering
 * afterwards that the ledger survives is how people end up feeling deceived by
 * a product that was technically truthful.
 */
export default function PrivacyDeleteScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const pt = usePrivacyText();
  const { ready, overview, requestDeletion, cancelDeletion } = usePrivacy();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const request = overview.deletionRequest;

  const onRequest = useCallback(async () => {
    setBusy(true);
    const result = await requestDeletion(null);
    setBusy(false);
    setConfirming(false);
    setNotice(result ? pt.deletionStatus(result.status) : pt.text('errorGeneric'));
  }, [requestDeletion, pt]);

  const onCancel = useCallback(async () => {
    setBusy(true);
    const ok = await cancelDeletion();
    setBusy(false);
    setNotice(ok ? pt.text('deleteCancelled') : pt.text('errorGeneric'));
  }, [cancelDeletion, pt]);

  if (ready && !overview.deletionAvailable && !request) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title={pt.text('deleteTitle')} />
          <View style={styles.state}>
            <MaterialIcons name="lock-outline" size={38} color={colors.textMuted} />
            <AppText style={styles.stateTitle}>{pt.text('unavailableTitle')}</AppText>
            <AppText style={styles.stateBody}>{pt.text('unavailableBody')}</AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={pt.text('deleteTitle')} subtitle={pt.text('deleteBody')} />

        {request ? (
          <View style={styles.card}>
            <AppText style={styles.sectionTitle} accessibilityRole="header">
              {needsAction(request.status) ? pt.text('blockedTitle') : pt.text('deleteRequested')}
            </AppText>
            <AppText style={styles.body} accessibilityLiveRegion="polite">
              {pt.deletionStatus(request.status)}
            </AppText>

            {request.status === 'cooling_off' ? (
              <AppText style={styles.hint}>
                {pt.text('deleteWaitingIn')}: {hoursUntil(request.coolingOffEndsAt)}{' '}
                {pt.text('deleteHours')}
              </AppText>
            ) : null}

            {request.blockerCodes.length > 0 ? (
              <View style={styles.blockers}>
                {/* Only actionable blockers get the "finish these" framing. A
                    hold is stated on its own; telling somebody to resolve
                    something they cannot touch is worse than saying nothing. */}
                {request.blockerCodes.some(isActionableBlocker) ? (
                  <AppText style={styles.hint}>{pt.text('blockedBody')}</AppText>
                ) : null}
                {request.blockerCodes.map(code => (
                  <View key={code} style={[styles.row, isRTL && styles.reverse]}>
                    <MaterialIcons name="error-outline" size={16} color={colors.textMuted} />
                    <AppText style={styles.blockerText}>{pt.blocker(code)}</AppText>
                  </View>
                ))}
              </View>
            ) : null}

            {request.cancellable ? (
              <>
                <AppText style={styles.hint}>{pt.text('blockedStillCancellable')}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={pt.text('deleteCancel')}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => void onCancel()}
                  style={styles.action}>
                  <AppText style={styles.actionText}>{pt.text('deleteCancel')}</AppText>
                </Pressable>
              </>
            ) : (
              <AppText style={styles.hint}>{pt.text('deleteProcessing')}</AppText>
            )}
          </View>
        ) : null}

        {/* What happens — always shown, before any request is made. */}
        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('deleteWhatGoes')}
          </AppText>
          <Line icon="check" text={pt.text('deleteGoesName')} tone="go" />
          <Line icon="check" text={pt.text('deleteGoesProfile')} tone="go" />
          <Line icon="check" text={pt.text('deleteGoesHistory')} tone="go" />
          <Line icon="check" text={pt.text('deleteGoesDevices')} tone="go" />
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle} accessibilityRole="header">
            {pt.text('deleteWhatStays')}
          </AppText>
          <Line icon="lock-outline" text={pt.text('deleteStaysBookings')} tone="stay" />
          <Line icon="lock-outline" text={pt.text('deleteStaysMoney')} tone="stay" />
          <Line icon="lock-outline" text={pt.text('deleteStaysReviews')} tone="stay" />
          <Line icon="lock-outline" text={pt.text('deleteStaysSafety')} tone="stay" />
          <AppText style={styles.hint}>{pt.text('deleteNotTotal')}</AppText>
          <AppText style={styles.hint}>{pt.text('deleteNotInstant')}</AppText>
        </View>

        {!request && overview.deletionAvailable ? (
          <View style={styles.card}>
            {confirming ? (
              <>
                <AppText style={styles.sectionTitle} accessibilityRole="header">
                  {pt.text('deleteConfirmTitle')}
                </AppText>
                <AppText style={styles.body}>{pt.text('deleteConfirmBody')}</AppText>
                <View style={[styles.actions, isRTL && styles.reverse]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pt.text('deleteConfirmAction')}
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    onPress={() => void onRequest()}
                    style={[styles.action, styles.destructive]}>
                    <AppText style={styles.destructiveText}>{pt.text('deleteConfirmAction')}</AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pt.text('deleteCancelAction')}
                    disabled={busy}
                    onPress={() => setConfirming(false)}
                    style={styles.action}>
                    <AppText style={styles.actionText}>{pt.text('deleteCancelAction')}</AppText>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={pt.text('deleteAction')}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => setConfirming(true)}
                style={styles.action}>
                <AppText style={styles.actionText}>{pt.text('deleteAction')}</AppText>
              </Pressable>
            )}
          </View>
        ) : null}

        {notice ? (
          <AppText accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.notice}>
            {notice}
          </AppText>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );

  function Line({ icon, text, tone }: { icon: 'check' | 'lock-outline'; text: string; tone: 'go' | 'stay' }) {
    return (
      <View style={[styles.row, isRTL && styles.reverse]} accessibilityLabel={text}>
        <MaterialIcons
          name={icon}
          size={16}
          color={tone === 'go' ? colors.successText : colors.textMuted}
        />
        <AppText style={styles.lineText}>{text}</AppText>
      </View>
    );
  }
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 720, width: '100%', alignSelf: 'center', gap: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderDefault, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  body: { fontSize: 13, lineHeight: 20, color: colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  notice: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  reverse: { flexDirection: 'row-reverse' },
  lineText: { flexShrink: 1, fontSize: 13, lineHeight: 19, color: colors.textPrimary },
  blockers: { gap: spacing.xs },
  blockerText: { flexShrink: 1, fontSize: 13, lineHeight: 19, color: colors.textPrimary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault },
  actionText: { fontSize: 12, fontWeight: typography.semibold, color: colors.textPrimary },
  destructive: { borderColor: colors.errorText },
  destructiveText: { fontSize: 12, fontWeight: typography.semibold, color: colors.errorText },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
