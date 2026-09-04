import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import { passwordRequirements } from '@/src/auth/password-policy';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';

import { AppText } from './Typography';

/**
 * The password rules, and which of them this password already satisfies.
 *
 * This existed once, inline in `app/reset-password.tsx`, and nowhere else — so
 * signup asked for a password with no idea what the rules were and refused it
 * afterwards with a single sentence. Both screens use this now, which is the
 * only way the checklist and the rule can stay the same thing.
 *
 * ACCESSIBILITY. Three channels, deliberately, because the requirement is that
 * none of them is load-bearing alone:
 *
 *   - SHAPE: a filled check against an empty circle. Distinguishable with no
 *     colour perception at all.
 *   - COLOUR: success ink against muted. The fast channel for everyone else.
 *   - WORDS: every row's accessible label ends with "Met" or "Not met yet".
 *     The icon is `accessibilityElementsHidden`, so a screen reader gets one
 *     coherent sentence per rule rather than a decorative glyph and a fragment.
 *
 * The list is a live region. As somebody types, the rules they have satisfied
 * are announced without them having to go looking — which is the whole point of
 * a checklist, and is invisible to anybody not using a reader.
 */
export function PasswordRequirementList({ password }: { password: string }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const requirements = useMemo(() => passwordRequirements(password), [password]);

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={t('passwordChecklistLabel')}
      accessibilityLiveRegion="polite"
      style={styles.list}>
      {requirements.map((requirement) => (
        <View
          key={requirement.key}
          accessible
          accessibilityLabel={`${t(requirement.key)}. ${t(requirement.met ? 'requirementMet' : 'requirementUnmet')}`}
          style={[styles.row, isRTL && styles.reverse]}>
          <MaterialIcons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name={requirement.met ? 'check-circle' : 'radio-button-unchecked'}
            size={17}
            color={requirement.met ? colors.success : colors.textMuted}
          />
          <AppText style={[styles.text, requirement.met && styles.met]}>
            {t(requirement.key)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  text: { color: colors.textMuted, fontSize: 13 },
  met: { color: colors.success },
});
