import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/warsha/ScreenHeader';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { appearancePreferences, type AppearancePreference } from '@/src/appearance/appearance-types';
import { useAuth } from '@/src/auth/auth-context';
import { useDiscoveryText } from '@/src/discovery/discovery-translations';
import { useLocalization } from '@/src/i18n/localization';

const labelKeys = {
  system: 'appearanceSystem',
  light: 'appearanceLight',
  dark: 'appearanceDark',
} as const;

const hintKeys = {
  system: 'appearanceSystemHint',
  light: 'appearanceLightHint',
  dark: 'appearanceDarkHint',
} as const;

const icons = {
  system: 'brightness-auto',
  light: 'light-mode',
  dark: 'dark-mode',
} as const;

/**
 * WPS-020 appearance settings.
 *
 * Applies immediately with no Save button and no restart, because the choice IS
 * the preview — a confirmation step would ask someone to commit to something
 * they are already looking at.
 *
 * The control uses radio semantics rather than a switch: three mutually
 * exclusive options is exactly what a radio group is, and a screen reader then
 * announces "2 of 3, selected" without any custom labelling.
 */
export default function AppearanceScreen() {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const dt = useDiscoveryText();
  const { user, mode } = useAuth();
  const { preference, scheme, setPreference } = useAppearance();
  const signedIn = mode === 'mock' || Boolean(user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={dt.text('appearance')} />
        <AppText style={styles.hint}>{dt.text('appearanceHint')}</AppText>

        <View accessibilityRole="radiogroup" accessibilityLabel={dt.text('appearance')} style={styles.group}>
          {appearancePreferences.map((option: AppearancePreference) => {
            const selected = preference === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={dt.text(labelKeys[option])}
                accessibilityHint={dt.text(hintKeys[option])}
                onPress={() => setPreference(option)}
                style={({ pressed }) => [
                  styles.option,
                  isRTL && styles.reverse,
                  selected && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}>
                <View style={styles.optionIcon}>
                  <MaterialIcons name={icons[option]} size={22} color={colors.textPrimary} />
                </View>
                <View style={styles.optionCopy}>
                  <AppText style={styles.optionLabel}>{dt.text(labelKeys[option])}</AppText>
                  <AppText style={styles.optionHint}>{dt.text(hintKeys[option])}</AppText>
                </View>
                {/* The tick is a second, non-colour signal for the selected state. */}
                <MaterialIcons
                  name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={22}
                  color={selected ? colors.textPrimary : colors.textMuted} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.note}>
          <AppText style={styles.noteText} accessibilityLiveRegion="polite">
            {scheme === 'dark' ? dt.text('appearanceCurrentlyDark') : dt.text('appearanceCurrentlyLight')}
          </AppText>
          <AppText style={styles.noteText}>
            {signedIn ? dt.text('appearanceSyncedHint') : dt.text('appearanceGuestHint')}
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hint: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  group: { gap: spacing.sm },
  option: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.cardBackground },
  optionSelected: { borderColor: colors.borderFocus, backgroundColor: colors.surfaceSelected },
  optionPressed: { backgroundColor: colors.cardPressed },
  reverse: { flexDirection: 'row-reverse' },
  optionIcon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceElevated },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 15, fontWeight: typography.semibold },
  optionHint: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
  note: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  noteText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary },
});
