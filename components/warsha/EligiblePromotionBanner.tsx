import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useGrowth } from '@/src/growth/growth-context';
import { growthRepository } from '@/src/growth/growth-repository';
import { useGrowthText } from '@/src/growth/growth-translations';
import { formatMinorAsEgp, type BookingBenefit } from '@/src/growth/growth-types';
import { useLocalization } from '@/src/i18n/localization';

type Props = {
  bookingId: string;
  /** The current customer-facing total in minor units. */
  baseMinor: number;
  onApplied?: () => void;
};

/**
 * The only place a customer ever sees a benefit on a booking.
 *
 * A booking receives at most ONE benefit, and the server decides which: a
 * referral reward the customer earned, or an admin campaign they qualify for.
 * The two are labelled differently on purpose — "your referral reward" is
 * something they worked for, "Warsha offer" is something Warsha chose to give.
 *
 * Nothing renders unless the SERVER returns a result. There is no code entry,
 * no campaign list, and no "you might qualify" state — a client cannot tell the
 * difference between "nothing exists" and "you are not eligible", which is what
 * stops this surface from becoming an enumerator.
 */
export function EligiblePromotionBanner({ bookingId, baseMinor, onApplied }: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const gt = useGrowthText();
  const { accountKey, role } = useGrowth();

  const [benefit, setBenefit] = useState<BookingBenefit>({ eligible: false });
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!accountKey || !bookingId || baseMinor < 2) {
      setBenefit({ eligible: false });
      return;
    }
    void (async () => {
      try {
        const result = await growthRepository.getBookingBenefit(
          accountKey,
          bookingId,
          baseMinor,
          role,
        );
        if (current !== generation.current) return;
        setBenefit(result);
      } catch {
        // A benefit failure must never break a booking. It resolves to
        // "no benefit", exactly as the server's own evaluator does.
        if (current !== generation.current) return;
        setBenefit({ eligible: false });
      }
    })();
  }, [accountKey, bookingId, baseMinor, role]);

  const onApply = useCallback(async () => {
    if (!benefit.eligible || busy) return;
    setBusy(true);
    setError(null);
    try {
      await growthRepository.redeemBookingBenefit(accountKey, bookingId, baseMinor, role);
      setApplied(true);
      onApplied?.();
    } catch {
      setError(gt.text('benefitUnavailable'));
      setBenefit({ eligible: false });
    } finally {
      setBusy(false);
    }
  }, [benefit, busy, accountKey, bookingId, baseMinor, role, onApplied, gt]);

  if (!benefit.eligible) return null;

  const isReward = benefit.source === 'referral_reward';
  const title = isReward
    ? gt.text('benefitRewardTitle')
    : gt.locale === 'ar'
      ? benefit.titleAr
      : benefit.titleEn;
  const saves = `${gt.text('benefitSaves')} ${formatMinorAsEgp(benefit.discountMinor)} ${gt.text('currency')}`;

  return (
    <View
      style={styles.card}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${saves}. ${gt.text('benefitFunded')}`}>
      <View style={[styles.row, isRTL && styles.reverse]}>
        <MaterialIcons
          name={isReward ? 'redeem' : 'local-offer'}
          size={18}
          color={colors.textPrimary}
        />
        <AppText style={styles.title}>{title}</AppText>
      </View>
      <AppText style={styles.saves}>{saves}</AppText>
      <AppText style={styles.funded}>{gt.text('benefitFunded')}</AppText>
      <AppText style={styles.funded}>{gt.text('benefitOnePerBooking')}</AppText>

      {applied ? (
        // Confirmed by an icon and a word, never by colour alone.
        <View style={[styles.row, isRTL && styles.reverse]}>
          <MaterialIcons name="check-circle-outline" size={17} color={colors.successText} />
          <AppText style={styles.applied}>{gt.text('benefitApplied')}</AppText>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt.text('benefitApply')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void onApply()}
          style={styles.action}>
          <AppText style={styles.actionText}>{gt.text('benefitApply')}</AppText>
        </Pressable>
      )}

      {error ? (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderDefault, padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  title: { fontSize: 15, fontWeight: typography.semibold, color: colors.textPrimary },
  saves: { fontSize: 14, fontWeight: typography.bold, color: colors.textPrimary },
  funded: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault },
  actionText: { fontSize: 13, fontWeight: typography.semibold, color: colors.textPrimary },
  applied: { fontSize: 13, fontWeight: typography.semibold, color: colors.successText },
  error: { fontSize: 12, color: colors.errorText },
});
