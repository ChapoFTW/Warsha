import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useGrowth } from '@/src/growth/growth-context';
import { growthRepository } from '@/src/growth/growth-repository';
import { useGrowthText } from '@/src/growth/growth-translations';
import { formatMinorAsEgp, type EligiblePromotion } from '@/src/growth/growth-types';
import { useLocalization } from '@/src/i18n/localization';

type Props = {
  bookingId: string;
  /** The current customer-facing total in minor units. */
  baseMinor: number;
  onApplied?: () => void;
};

/**
 * The only place a customer ever sees a promotion.
 *
 * Nothing renders unless the SERVER returns an eligibility result. There is no
 * code entry, no campaign list, and no "you might qualify" state — a client
 * cannot tell the difference between "no campaign exists" and "you are not
 * eligible", which is what stops this surface from becoming a campaign
 * enumerator.
 *
 * The banner states that Warsha funds the offer, because a customer seeing a
 * discount should not have to wonder whether their worker is absorbing it.
 */
export function EligiblePromotionBanner({ bookingId, baseMinor, onApplied }: Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const gt = useGrowthText();
  const { accountKey, role } = useGrowth();

  const [offer, setOffer] = useState<EligiblePromotion>({ eligible: false });
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!accountKey || !bookingId || baseMinor < 1) {
      setOffer({ eligible: false });
      return;
    }
    void (async () => {
      try {
        const result = await growthRepository.getEligiblePromotion(
          accountKey,
          bookingId,
          baseMinor,
          role,
        );
        if (current !== generation.current) return;
        setOffer(result);
      } catch {
        // An eligibility failure must never break a booking. It resolves to
        // "no offer", exactly as the server's own evaluator does.
        if (current !== generation.current) return;
        setOffer({ eligible: false });
      }
    })();
  }, [accountKey, bookingId, baseMinor, role]);

  const onApply = useCallback(async () => {
    if (!offer.eligible || busy) return;
    setBusy(true);
    setError(null);
    try {
      await growthRepository.redeemPromotion(
        accountKey,
        bookingId,
        offer.campaignKey,
        baseMinor,
        role,
      );
      setApplied(true);
      onApplied?.();
    } catch {
      setError(gt.text('promotionUnavailable'));
      setOffer({ eligible: false });
    } finally {
      setBusy(false);
    }
  }, [offer, busy, accountKey, bookingId, baseMinor, role, onApplied, gt]);

  if (!offer.eligible) return null;

  const title = gt.locale === 'ar' ? offer.titleAr : offer.titleEn;
  const saves = `${gt.text('promotionSaves')} ${formatMinorAsEgp(offer.discountMinor)} ${gt.text('currency')}`;

  return (
    <View
      style={styles.card}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${gt.text('promotionTitle')}: ${title}. ${saves}`}>
      <View style={[styles.row, isRTL && styles.reverse]}>
        <MaterialIcons name="local-offer" size={18} color={colors.textPrimary} />
        <AppText style={styles.title}>{title}</AppText>
      </View>
      <AppText style={styles.saves}>{saves}</AppText>
      <AppText style={styles.funded}>{gt.text('promotionFunded')}</AppText>

      {applied ? (
        // Confirmed by an icon and a word, never by colour alone.
        <View style={[styles.row, isRTL && styles.reverse]}>
          <MaterialIcons name="check-circle-outline" size={17} color={colors.successText} />
          <AppText style={styles.applied}>{gt.text('promotionApplied')}</AppText>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={gt.text('promotionApply')}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void onApply()}
          style={styles.action}>
          <AppText style={styles.actionText}>{gt.text('promotionApply')}</AppText>
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
