import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAppearance, useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { appearancePreferences, type AppearancePreference } from '@/src/appearance/appearance-types';
import { useLocalization } from '@/src/i18n/localization';

const copy = {
  en: {
    language: 'Language',
    switchLanguage: 'Switch to Arabic',
    appearance: 'Appearance',
    close: 'Close appearance options',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    systemHint: 'Follow this device',
    lightHint: 'Always use light',
    darkHint: 'Always use dark',
  },
  ar: {
    language: 'اللغة',
    switchLanguage: 'التبديل إلى الإنجليزية',
    appearance: 'المظهر',
    close: 'إغلاق خيارات المظهر',
    system: 'النظام',
    light: 'فاتح',
    dark: 'داكن',
    systemHint: 'اتباع إعداد الجهاز',
    lightHint: 'استخدام المظهر الفاتح دائمًا',
    darkHint: 'استخدام المظهر الداكن دائمًا',
  },
} as const;

const appearanceIcons = {
  system: 'brightness-auto',
  light: 'light-mode',
  dark: 'dark-mode',
} as const;

/**
 * One global preference dock, owned by the root chrome rather than copied into
 * individual product screens. It remains reachable on public, onboarding,
 * customer, worker, shared, and staff routes. Desktop web gets labelled
 * controls; narrow native and web surfaces get compact, accessible controls.
 */
export function GlobalPreferenceControls({ embedded = false }: { embedded?: boolean }) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { language, isRTL, toggleLanguage } = useLocalization();
  const { preference, setPreference } = useAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const text = copy[language];
  const expanded = Platform.OS === 'web' && width >= 840;
  const appearanceLabel = text[preference];

  const focusStyle = (key: string) => focused === key ? styles.focused : null;

  return (
    <View
      pointerEvents="box-none"
      style={embedded ? styles.embedded : [
        styles.layer,
        { top: Math.max(insets.top, spacing.sm) },
        isRTL ? styles.layerStart : styles.layerEnd,
      ]}>
      <View style={[styles.dock, isRTL && styles.reverse]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${text.language}. ${text.switchLanguage}`}
          onFocus={() => setFocused('language')}
          onBlur={() => setFocused(null)}
          onPress={toggleLanguage}
          style={({ pressed }) => [styles.control, focusStyle('language'), pressed && styles.pressed]}>
          <MaterialIcons name="language" size={18} color={colors.textPrimary} />
          <AppText style={styles.controlText}>
            {expanded ? (language === 'en' ? 'العربية' : 'English') : (language === 'en' ? 'AR' : 'EN')}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${text.appearance}. ${appearanceLabel}`}
          accessibilityState={{ expanded: appearanceOpen }}
          onFocus={() => setFocused('appearance')}
          onBlur={() => setFocused(null)}
          onPress={() => setAppearanceOpen(true)}
          style={({ pressed }) => [styles.control, focusStyle('appearance'), pressed && styles.pressed]}>
          <MaterialIcons name={appearanceIcons[preference]} size={18} color={colors.textPrimary} />
          {expanded ? <AppText style={styles.controlText}>{appearanceLabel}</AppText> : null}
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        transparent
        visible={appearanceOpen}
        onRequestClose={() => setAppearanceOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={text.close}
            onPress={() => setAppearanceOpen(false)}
            style={styles.scrim}
          />
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={text.appearance}
            style={[styles.menu, isRTL ? styles.menuStart : styles.menuEnd]}>
            <View style={[styles.menuHeading, isRTL && styles.reverse]}>
              <AppText style={styles.menuTitle}>{text.appearance}</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={text.close}
                onPress={() => setAppearanceOpen(false)}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                <MaterialIcons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
            {appearancePreferences.map(option => {
              const selected = preference === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityLabel={text[option]}
                  accessibilityHint={text[`${option}Hint`]}
                  accessibilityState={{ checked: selected, selected }}
                  onFocus={() => setFocused(`option-${option}`)}
                  onBlur={() => setFocused(null)}
                  onPress={() => {
                    setPreference(option as AppearancePreference);
                    setAppearanceOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    isRTL && styles.reverse,
                    selected && styles.optionSelected,
                    focusStyle(`option-${option}`),
                    pressed && styles.pressed,
                  ]}>
                  <MaterialIcons name={appearanceIcons[option]} size={20} color={colors.textPrimary} />
                  <View style={styles.optionCopy}>
                    <AppText style={styles.optionTitle}>{text[option]}</AppText>
                    <AppText style={styles.optionHint}>{text[`${option}Hint`]}</AppText>
                  </View>
                  <MaterialIcons
                    name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={20}
                    color={selected ? colors.textPrimary : colors.textMuted}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  layer: { position: 'absolute', zIndex: 1000 },
  embedded: { zIndex: 1000 },
  layerEnd: { right: spacing.md },
  layerStart: { left: spacing.md },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceElevated,
  },
  reverse: { flexDirection: 'row-reverse' },
  control: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 2,
    borderColor: colors.transparent,
    borderRadius: radii.full,
  },
  controlText: { fontSize: 12, fontWeight: typography.semibold },
  focused: { borderColor: colors.borderFocus },
  pressed: { backgroundColor: colors.surfacePressed },
  modalRoot: { flex: 1, justifyContent: 'flex-start' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  menu: {
    width: '92%',
    maxWidth: 420,
    marginTop: 88,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceElevated,
  },
  menuEnd: { alignSelf: 'flex-end' },
  menuStart: { alignSelf: 'flex-start' },
  menuHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuTitle: { fontSize: 18, fontWeight: typography.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full },
  option: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.transparent,
    borderRadius: radii.md,
  },
  optionSelected: { borderColor: colors.borderStrong, backgroundColor: colors.surfaceSelected },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 14, fontWeight: typography.semibold },
  optionHint: { fontSize: 11, color: colors.textSecondary },
});
