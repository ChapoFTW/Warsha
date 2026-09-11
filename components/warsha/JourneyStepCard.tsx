import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandCard } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';

/**
 * One step of a journey: what this step is, why, and the controls for it.
 *
 * ## Why this exists, and why it is only these five
 *
 * It was written twice. `JourneyCard` in the worker journey and four cards in
 * the verification flow had the same structure and the same style values —
 * `card: { gap: spacing.md }`, `title: { ...typography.h2, bold, textPrimary }`,
 * `body: { ...typography.body, textSecondary }` — declared separately in two
 * files. Not two components sharing tokens. One component, typed out twice.
 *
 * The icon is the only real difference, so it is a variant rather than a second
 * component: the journey marks each step with one, verification does not.
 *
 * ## What deliberately stayed out
 *
 * Warsha has a lot of cards and most of them are not this. They were compared
 * before anything was extracted, because three screens looking similar is not
 * evidence that they are the same thing:
 *
 * - the verification status card draws a 48px mark inline rather than in a tile,
 *   has no body, and reports an outcome rather than asking for anything;
 * - the worker dashboard heads its cards at `typography.h1`, the help index at
 *   `bodySmall` semibold. Those are different levels of the same hierarchy and
 *   flattening them would be a regression dressed as consistency;
 * - `app/onboarding/address.tsx` names raw sizes (24, 16) instead of the scale.
 *   That is real debt, and it is already tracked and budgeted by
 *   `audit:typography` — converting it is that ratchet's job, not this one's.
 *
 * `BrandCard` remains the primitive underneath: surface, elevation, padding.
 * This is a composition over it, not a replacement for it.
 */
export function JourneyStepCard({
  icon,
  title,
  body,
  children,
}: {
  /** The journey marks its steps; verification does not. Omit for no mark. */
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  title: string;
  /** Optional, because a card whose fields already explain themselves does not
      need a third sentence saying the same thing. */
  body?: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <BrandCard style={styles.card}>
      {icon ? (
        <View style={styles.mark}>
          {/* Decorative. The title says what the step is, and a reader that
              announced the mark as well would hear the private-use glyph —
              see docs/decisions/accessible-names.md. */}
          <MaterialIcons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name={icon}
            size={32}
            color={colors.textPrimary}
          />
        </View>
      ) : null}
      <AppText style={styles.title}>{title}</AppText>
      {body ? <AppText style={styles.body}>{body}</AppText> : null}
      {children}
    </BrandCard>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { gap: spacing.md },
  mark: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
  },
  title: { ...typography.h2, fontWeight: typography.bold, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
});
