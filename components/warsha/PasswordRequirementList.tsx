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
 *
 * BEFORE ANYTHING IS TYPED it shows one sentence instead of five rules.
 *
 * The checklist used to render in full on an untouched field, so the first
 * thing a professional met on Warsha's signup form was five rules they had not
 * satisfied — and a screen reader announced five "Not met yet" in a row, which
 * sounds like five errors before a character has been entered. Rendering the
 * summary until the field is touched keeps the policy visible, keeps it
 * identical, and stops the form opening with a list of refusals.
 *
 * Once typing starts the full checklist appears with a count, so what is on
 * screen is progress — "3 / 5" going up — rather than a tally of failures.
 */
export function PasswordRequirementList({ password }: { password: string }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { t, isRTL } = useLocalization();
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  const met = requirements.filter((requirement) => requirement.met).length;

  // Nothing typed yet: state the policy once, as a sentence, and say nothing
  // about what has not been met — because nothing has been attempted.
  if (password.length === 0) {
    return <AppText style={styles.summary}>{t('passwordHintSummary')}</AppText>;
  }

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={t('passwordChecklistLabel')}
      accessibilityLiveRegion="polite"
      style={styles.list}>
      {/* Progress, counted. A number going up is legible to somebody who reads
          the rules slowly or not at all, and it is the same fact the rows show. */}
      <AppText style={styles.progress}>
        {`${t('passwordProgressLabel')} ${met} / ${requirements.length}`}
      </AppText>
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
  summary: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  progress: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  text: { color: colors.textMuted, fontSize: 13 },
  met: { color: colors.success },
});
