import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { PressableSurface } from '@/components/warsha/PressableSurface';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedElevation, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';

export type ChoiceCardMode = 'button' | 'radio' | 'checkbox';

/**
 * A big choice, as a card.
 *
 * `OptionRow` is the other half of this pair and the two are not
 * interchangeable. A row is for a LIST — thirty-four trades, a dozen jobs, every
 * governorate — where the job is to scan and compare, so it is compact and the
 * marks line up down an edge. A card is for a HANDFUL of choices that are the
 * whole point of the screen: which kind of account, which language, which
 * appearance. There the job is to recognise, and the card can afford the room.
 *
 * ## Why this exists as a component
 *
 * It was drawn twice, by hand, in two screens, and the second copy had two bugs
 * the first had already been fixed for:
 *
 * **No elevation.** The card sat on a one-pixel border on a white fill against a
 * warm-white ground, which is what an unstyled container looks like. Warsha has
 * `elevation.card` and the screen simply did not use it. The shadow is the thing
 * that makes a card read as a surface you can press rather than a box somebody
 * drew — and it is resolved per theme, because light's shadow is a warm brown
 * that belongs on paper and dark's is black.
 *
 * **An icon well that did not exist.** The recess behind the mark was
 * `surfaceElevated`, which in the LIGHT theme is `#FFFFFF` — the same value as
 * the card it sits on. So in Warsha's default appearance there was no well at
 * all and the icon floated in an empty column. It was correct in dark and
 * invisible in light, which is exactly the failure a themed token is meant to
 * prevent and the reason nobody had noticed.
 *
 * `canvas` instead. A recess in a card is the page showing through, which is
 * true in both themes and visible in both: warm paper inside white here,
 * near-black inside charcoal there.
 *
 * ## The accessible name is composed from data
 *
 * Never from children. With no explicit label Android builds one out of whatever
 * is rendered, and a decorative icon contributes an empty segment — which is how
 * every trade in the list once announced itself as ", Plumber". The mark is
 * hidden from assistive technology and the name is built from the title and the
 * hint, so there is no arrangement of children that can reintroduce that.
 *
 * ## Selection shows in three ways at once
 *
 * Ground, border and mark. Colour alone is not an answer to "which one did I
 * pick?" for a reader who cannot rely on it, and a one-pixel border changing
 * shade is not an answer for anybody on a phone in daylight.
 */
export function ChoiceCard({
  title,
  hint,
  icon,
  mode = 'button',
  selected = false,
  disabled = false,
  onPress,
  accessibilityHint,
  style,
}: {
  /** The visible title, and the first half of the accessible name. */
  title: string;
  /** A second line explaining the choice. Part of the accessible name. */
  hint?: string;
  /** The recognition mark. Decorative — it must never carry meaning alone. */
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  /**
   * `button` for a card that picks and moves on, and which therefore shows no
   * state mark because there is no state to show. `radio` for one-of,
   * `checkbox` for many-of.
   */
  mode?: ChoiceCardMode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityHint?: string;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const elevation = useThemedElevation();
  const { isRTL } = useLocalization();

  const stateMark = mode === 'radio'
    ? (selected ? 'radio-button-checked' : 'radio-button-unchecked')
    : (selected ? 'check-box' : 'check-box-outline-blank');

  return (
    <PressableSurface
      accessibilityRole={mode === 'button' ? 'button' : mode}
      accessibilityLabel={hint ? `${title}. ${hint}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={mode === 'button'
        ? { disabled }
        : { checked: selected, disabled }}
      disabled={disabled}
      feedback="surface"
      onPress={onPress}
      style={[
        styles.card,
        elevation.card,
        isRTL && styles.reverse,
        selected && styles.selected,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.well}>
        <MaterialIcons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon}
          size={26}
          color={disabled ? colors.textMuted : colors.textPrimary}
        />
      </View>

      <View style={styles.copy}>
        <AppText style={styles.title}>{title}</AppText>
        {hint ? <AppText style={styles.hint}>{hint}</AppText> : null}
      </View>

      {mode === 'button' ? null : (
        <MaterialIcons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={stateMark}
          size={22}
          color={selected ? colors.textPrimary : colors.textMuted}
        />
      )}
    </PressableSurface>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  reverse: { flexDirection: 'row-reverse' },
  selected: { borderColor: colors.borderFocus, backgroundColor: colors.surfaceSelected },
  disabled: { opacity: 0.5 },
  well: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.canvas,
  },
  copy: { flex: 1, gap: spacing.xs },
  title: { ...typography.h3, fontWeight: typography.semibold, color: colors.textPrimary },
  hint: { color: colors.textSecondary },
});
