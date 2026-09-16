import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { categoryIconName } from '@/src/brand/warsha-icons';
import { Category } from '@/src/data/mock-data';
import { useLocalization } from '@/src/i18n/localization';

import { PressableSurface } from './PressableSurface';
import { AppText } from './Typography';
import { WarshaIcon } from './WarshaIcon';

/**
 * A service category, as a customer meets it.
 *
 * ## Why this is a row and not a tile
 *
 * It was a 104px tile in a horizontal carousel, which put the catalogue at
 * right angles to the page. Home scrolls down; the nineteen things Home exists
 * to offer scrolled sideways. Four fitted on a 411dp screen and the rest were
 * off the edge with nothing to say how many were out there — on the one area of
 * the product whose whole job is "what do you need help with?".
 *
 * A full-width row joins the page's own scroll. Nineteen of them are nineteen
 * things you can see are there, in one gesture, in the order the catalogue
 * means them to be in.
 *
 * ## Why it is flat
 *
 * Elevation communicates hierarchy, and nineteen floating rows would
 * communicate none. A hairline border on `surface` is what the tile already
 * used and what the rest of Warsha's list surfaces use; the icon well keeps the
 * category recognisable without any of them claiming to be more important than
 * its neighbours.
 *
 * ## The mark
 *
 * Warsha's own, resolved from the category id through the shared icon authority
 * rather than from `service_categories.icon_name` — a column holding
 * unvalidated Material glyph names, where a name Material did not know drew an
 * empty box and said nothing. It is decorative: `WarshaIcon` hides itself when
 * given no label, so the localized name beside it is the whole accessible name.
 */
export function CategoryCard({ item }: { item: Category }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  return (
    /* A row is a surface, so it may travel marginally further than a button
       before the movement becomes something you watch rather than feel. */
    <PressableSurface
      accessibilityRole="button"
      accessibilityLabel={t(item.label)}
      feedback="surface"
      onPress={() => router.push({ pathname: '/categories/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.row, isRTL && styles.reverse, pressed && styles.rowPressed]}>
      <View style={styles.iconGround}>
        <WarshaIcon name={categoryIconName(item.id)} size="lg" />
      </View>
      {/* No line cap. A full-width row has room the 104px tile never had, so a
          long French or Arabic category name wraps and the row grows — which is
          the rule the catalogue has always been held to, at a new geometry. */}
      <AppText style={styles.label}>{t(item.label)}</AppText>
      {/* Says "this opens something" and nothing else, so it is not announced. */}
      <MaterialIcons
        accessibilityElementsHidden
        importantForAccessibility="no"
        name={isRTL ? 'chevron-left' : 'chevron-right'}
        size={22}
        color={colors.textMuted}
      />
    </PressableSurface>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  reverse: { flexDirection: 'row-reverse' },
  rowPressed: { backgroundColor: colors.surfacePressed, borderColor: colors.borderDefault },
  iconGround: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSoft,
  },
  // `flex: 1` is what pushes the chevron to the trailing edge and lets a long
  // name in any language use the space instead of truncating early.
  label: { flex: 1, ...typography.body, fontWeight: typography.medium },
});
