import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { PressableSurface } from '@/components/warsha/PressableSurface';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';

export type OptionRowMode = 'checkbox' | 'radio' | 'button';

/**
 * One choice in a list of choices.
 *
 * Warsha asks a professional to pick a trade from thirty-four, then jobs from
 * a dozen, then a governorate, then an area. Four screens, the same question,
 * and until now four separate implementations of the same row — each with its
 * own height, its own border, and its own idea of what "selected" looks like.
 *
 * Three problems came out of that, and this exists to end all three.
 *
 * ## It looked like scaffolding
 *
 * Each row drew `check-box-outline-blank` at 26px straight from MaterialIcons.
 * A stock Material glyph on a hairline rectangle is what an unstyled form looks
 * like, and thirty-four of them stacked is what an unstyled form looks like at
 * scale. Warsha has a palette, a radius scale and a type scale; the rows used
 * almost none of it, and the screen read as a prototype because of it.
 *
 * ## "Selected" was almost invisible
 *
 * The chosen state was a one-pixel border changing colour. On a phone, in
 * daylight, that is not an answer to "which ones did I pick?" — which is the
 * only question this control exists to answer. The mark here fills, the ground
 * changes, and the border thickens, so the answer survives a glance.
 *
 * ## The accessible name kept breaking
 *
 * With no explicit `accessibilityLabel`, Android composes one from the
 * children — and a decorative icon contributes an empty segment, so every trade
 * announced as ", Plumber" and every governorate as ", Cairo". It was fixed
 * once in the profession list and remained broken in the location list, because
 * the fix lived in a screen rather than in a shared control.
 *
 * Here the name is a required prop. There is no arrangement of children that
 * can produce that bug, because nothing is composed from children at all.
 *
 * ## Why the mark is on the trailing edge
 *
 * Leading edge is where recognition happens: a silhouette is read faster than a
 * word, and someone who reads slowly relies on it. So the trade's own mark goes
 * first, the label second, and the confirmation last — the eye scans marks down
 * the leading edge and checks state down the trailing one, instead of both
 * competing for the same corner.
 */
export function OptionRow({
  label,
  detail,
  leading,
  mode = 'checkbox',
  selected = false,
  disabled = false,
  onPress,
  style,
}: {
  /**
   * The accessible name AND the visible label. Required, so the composed-name
   * defect cannot come back: there is no path here that leaves it unset.
   */
  label: string;
  /** A second line — a count, a hint. Never where the meaning lives. */
  detail?: string;
  /** The recognition mark. Decorative: it must not carry meaning alone. */
  leading?: React.ReactNode;
  /**
   * `checkbox` for many-of, `radio` for one-of, `button` for a row that picks
   * and closes rather than toggling. A `button` row shows no state mark,
   * because there is no state to show.
   */
  mode?: OptionRowMode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();

  return (
    <PressableSurface
      accessibilityRole={mode === 'button' ? 'button' : mode}
      // Composed from data, never from what happens to be rendered inside.
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={mode === 'button'
        ? { disabled }
        : { checked: selected, disabled }}
      disabled={disabled}
      feedback="surface"
      onPress={onPress}
      style={[
        styles.row,
        isRTL && styles.reverse,
        selected && styles.rowSelected,
        disabled && styles.rowDisabled,
        style,
      ]}>
      {leading ? <View style={styles.leading}>{leading}</View> : null}

      <View style={styles.copy}>
        <AppText style={[styles.label, selected && styles.labelSelected]}>{label}</AppText>
        {detail ? <AppText style={styles.detail}>{detail}</AppText> : null}
      </View>

      {mode === 'button' ? (
        /* A row that navigates rather than toggles says so, and points the way
           the language runs. */
        <MaterialIcons
          name={isRTL ? 'chevron-left' : 'chevron-right'}
          size={22}
          color={colors.textMuted}
        />
      ) : (
        <View style={[
          styles.mark,
          mode === 'radio' && styles.markRadio,
          selected && styles.markSelected,
        ]}>
          {selected ? (
            <MaterialIcons name="check" size={16} color={colors.actionPrimaryText} />
          ) : null}
        </View>
      )}
    </PressableSurface>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  /*
   * Three channels, because one is not enough on a small screen: the ground
   * changes, the border thickens and darkens, and the mark fills. The border
   * width is compensated with padding so a row does not shift by a pixel as it
   * is chosen — a list that twitches while you tap down it feels broken.
   */
  rowSelected: {
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSelected,
    paddingVertical: spacing.md - 1,
    paddingHorizontal: spacing.lg - 1,
  },
  rowDisabled: { opacity: 0.45 },
  reverse: { flexDirection: 'row-reverse' },
  leading: { width: 28, alignItems: 'center' },
  copy: { flex: 1, gap: 2 },
  label: { ...typography.body, color: colors.textPrimary },
  labelSelected: { fontWeight: typography.semibold },
  detail: { ...typography.bodySmall, color: colors.textSecondary },
  mark: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.borderDefault,
    borderRadius: radii.xs,
    backgroundColor: 'transparent',
  },
  // Round for one-of, square for many-of. The shape is the affordance, and it
  // is the one convention every phone user already knows.
  markRadio: { borderRadius: radii.full },
  markSelected: {
    borderColor: colors.actionPrimaryBackground,
    backgroundColor: colors.actionPrimaryBackground,
  },
});
