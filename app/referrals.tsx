import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useGrowth } from '@/src/growth/growth-context';
import { useGrowthText } from '@/src/growth/growth-translations';
import {
  formatReferralCodeForDisplay,
  referralCodeAccessibilityLabel,
  type RewardEntitlement,
} from '@/src/growth/growth-types';
import { useLocalization } from '@/src/i18n/localization';

/**
 * Customer and worker referrals.
 *
 * The screen is honest about two things that growth features usually blur. It
 * says out loud that signing up earns nothing, and it describes an earned reward
 * as earned rather than as a balance — because it is not money, and Warsha owes
 * nothing it has not approved.
 *
 * There is no promo-code box here. The field below accepts an INVITE code, which
 * carries no discount and cannot be redeemed for one.
 */
export default function ReferralsScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const gt = useGrowthText();
  const { ready, referral, summary, claimCode } = useGrowth();

  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const code = referral.available ? referral.code : '';

  // There is no copy button. `expo-clipboard` is not a dependency, and adding a
  // native module that cannot be verified without a device was judged worse than
  // not shipping the affordance — the same call WPS-020 made about location.
  // The code is selectable, and Share is built into React Native.
  const onShare = useCallback(async () => {
    if (!code) return;
    await Share.share({ message: `${gt.text('shareMessage')} ${code}` });
  }, [code, gt]);

  const onClaim = useCallback(async () => {
    const result = await claimCode(entry);
    setMessage(gt.claimReason(result.reason));
    if (result.accepted) setEntry('');
  }, [claimCode, entry, gt]);

  if (ready && !referral.available) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader title={gt.text('referralTitle')} />
          <View style={styles.state}>
            <MaterialIcons name="card-giftcard" size={38} color={colors.textMuted} />
            <AppText style={styles.stateTitle}>{gt.text('unavailableTitle')}</AppText>
            <AppText style={styles.stateBody}>{gt.text('unavailableBody')}</AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={gt.text('referralTitle')} subtitle={gt.text('referralSubtitle')} />

        <View style={styles.card}>
          <AppText style={styles.label}>{gt.text('referralCodeLabel')}</AppText>
          <AppText
            style={styles.code}
            accessibilityLabel={referralCodeAccessibilityLabel(code)}
            selectable>
            {formatReferralCodeForDisplay(code)}
          </AppText>
          <AppText style={styles.hint}>{gt.text('referralCodeHint')}</AppText>

          <View style={[styles.row, isRTL && styles.reverse]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt.text('shareInvite')}
              onPress={onShare}
              style={[styles.action, isRTL && styles.reverse]}>
              <MaterialIcons name="ios-share" size={17} color={colors.textPrimary} />
              <AppText style={styles.actionText}>{gt.text('shareInvite')}</AppText>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>{gt.text('howItWorksTitle')}</AppText>
          <AppText style={styles.step}>1. {gt.text('howItWorksOne')}</AppText>
          <AppText style={styles.step}>2. {gt.text('howItWorksTwo')}</AppText>
          <AppText style={styles.step}>3. {gt.text('howItWorksThree')}</AppText>
          <AppText style={styles.notice}>{gt.text('noRewardForSignup')}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>{gt.text('statusTitle')}</AppText>
          <View style={[styles.row, isRTL && styles.reverse]}>
            <Stat label={gt.text('statusPending')} value={summary.pending} />
            <Stat label={gt.text('statusQualified')} value={summary.qualified} />
            <Stat label={gt.text('statusExpired')} value={summary.expired} />
          </View>
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>{gt.text('rewardsTitle')}</AppText>
          {summary.rewards.length === 0 ? (
            <AppText style={styles.hint}>{gt.text('rewardsEmpty')}</AppText>
          ) : (
            summary.rewards.map(reward => (
              <RewardRow key={reward.id} reward={reward} />
            ))
          )}
          <AppText style={styles.hint}>{gt.text('rewardExplainer')}</AppText>
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>{gt.text('enterCodeTitle')}</AppText>
          <View style={[styles.row, isRTL && styles.reverse]}>
            <TextInput
              value={entry}
              onChangeText={text => setEntry(text.toUpperCase())}
              placeholder={gt.text('enterCodePlaceholder')}
              placeholderTextColor={colors.inputPlaceholder}
              accessibilityLabel={gt.text('enterCodeTitle')}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              style={[styles.entryValue, isRTL && styles.rtlText]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={gt.text('enterCodeAction')}
              onPress={onClaim}
              style={styles.action}>
              <AppText style={styles.actionText}>{gt.text('enterCodeAction')}</AppText>
            </Pressable>
          </View>
          {message ? (
            <AppText accessibilityLiveRegion="polite" style={styles.notice}>
              {message}
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  function Stat({ label, value }: { label: string; value: number }) {
    return (
      <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
        <AppText style={styles.statValue}>{value}</AppText>
        <AppText style={styles.statLabel}>{label}</AppText>
      </View>
    );
  }

  function RewardRow({ reward }: { reward: RewardEntitlement }) {
    const statusText =
      reward.status === 'fulfilled'
        ? gt.text('rewardFulfilled')
        : reward.status === 'void'
          ? gt.text('rewardVoid')
          : gt.text('rewardRecorded');
    return (
      <View
        style={[styles.rewardRow, isRTL && styles.reverse]}
        accessibilityLabel={`${reward.ruleKey}: ${statusText}`}>
        <MaterialIcons
          name={reward.status === 'fulfilled' ? 'check-circle-outline' : 'schedule'}
          size={17}
          color={colors.textMuted}
        />
        <AppText style={styles.rewardText}>{statusText}</AppText>
      </View>
    );
  }
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, maxWidth: 720, width: '100%', alignSelf: 'center', gap: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderDefault, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  reverse: { flexDirection: 'row-reverse' },
  label: { fontSize: 12, color: colors.textMuted },
  code: { fontSize: 28, fontWeight: typography.bold, letterSpacing: 2, color: colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  sectionTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  step: { fontSize: 13, lineHeight: 20, color: colors.textPrimary },
  notice: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault },
  actionText: { fontSize: 12, fontWeight: typography.semibold, color: colors.textPrimary },
  stat: { flexGrow: 1, minWidth: 90, gap: spacing.xs },
  statValue: { fontSize: 22, fontWeight: typography.bold, color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textMuted },
  rewardRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rewardText: { fontSize: 13, color: colors.textPrimary },
  entryValue: { flexGrow: 1, minWidth: 140, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.inputBackground, fontSize: 14, letterSpacing: 1, color: colors.textPrimary },
  rtlText: { textAlign: 'right' },
  state: { alignItems: 'center', padding: spacing.xxxl, gap: spacing.md },
  stateTitle: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary, textAlign: 'center' },
  stateBody: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center' },
});
