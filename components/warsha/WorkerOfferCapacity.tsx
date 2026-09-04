import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { useMarketplaceText } from '@/src/marketplace-intelligence/marketplace-translations';
import {
  workerIsAtOfferCapacity,
  type WorkerOfferCapacity as Capacity,
} from '@/src/marketplace-intelligence/worker-offer-capacity';

import { AppText } from './Typography';

/**
 * How many requests this worker is currently waiting on, out of how many.
 *
 * Renders nothing at all when capacity does not apply — an account with no
 * provider profile, or a capacity the server has not answered for yet. A
 * placeholder reading "0 of —" would be a worse answer than silence, because a
 * worker at their limit would read it as room.
 *
 * The number in the sentence is the server's, never a constant compiled into
 * this file. `app_settings` holds the policy; changing it from ten to fifteen
 * changes this line without a release.
 *
 * At capacity the tone changes from informational to blocking and the copy says
 * what to do about it, because "10 of 10" alone leaves a worker looking for a
 * button that has stopped working. The state is carried by an icon, by words,
 * and by ground colour — never by colour alone.
 */
export function WorkerOfferCapacityNotice({ capacity }: { capacity: Capacity | null }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const mt = useMarketplaceText();

  if (!capacity?.applies || capacity.limit === null || capacity.remaining === null) return null;

  const full = workerIsAtOfferCapacity(capacity);
  const value = mt('offerCapacityValue')
    .replace('{used}', String(capacity.used))
    .replace('{limit}', String(capacity.limit));
  const detail = full
    ? mt('offerCapacityFull').replace('{limit}', String(capacity.limit))
    : mt('offerCapacityRemaining').replace('{remaining}', String(capacity.remaining));

  return (
    <View
      accessible
      // One sentence for a screen reader rather than three fragments it has to
      // stitch together in the right order — which it cannot do in Arabic.
      accessibilityLabel={`${mt('offerCapacityLabel')}: ${value}. ${detail}`}
      style={[styles.card, full && styles.cardFull]}>
      <View style={[styles.row, isRTL && styles.reverse]}>
        <MaterialIcons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={full ? 'block' : 'inventory-2'}
          size={18}
          color={full ? colors.warning : colors.textSecondary}
        />
        <AppText style={styles.label}>{mt('offerCapacityLabel')}</AppText>
        <AppText style={[styles.value, full && styles.valueFull]}>{value}</AppText>
      </View>
      <AppText style={styles.detail}>{detail}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardFull: { borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: typography.semibold, flex: 1 },
  value: { fontSize: 15, fontWeight: typography.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  valueFull: { color: colors.warning },
  detail: { ...typography.bodySmall, color: colors.textSecondary },
});
