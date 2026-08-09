import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import {
  egyptAreaForStoredValue,
  egyptGovernorateForStoredValue,
  listEgyptAreas,
  listEgyptGovernorates,
  type EgyptLocationOption,
} from '@/src/locations/egypt-locations';
import { useWorkerText } from '@/src/worker/worker-copy';

type SelectionKind = 'governorate' | 'area';

export function EgyptLocationSelector({
  governorate,
  district,
  onChange,
}: {
  governorate: string;
  district: string;
  onChange: (next: { governorate: string; district: string }) => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const wt = useWorkerText();
  const [kind, setKind] = useState<SelectionKind | null>(null);
  const [query, setQuery] = useState('');
  const governorateOption = egyptGovernorateForStoredValue(governorate);
  const areaOption = governorateOption ? egyptAreaForStoredValue(governorateOption.id, district) : null;

  const open = (nextKind: SelectionKind) => {
    setQuery('');
    setKind(nextKind);
  };

  const options = kind === 'governorate'
    ? listEgyptGovernorates(language, query)
    : governorateOption ? listEgyptAreas(governorateOption.id, language, query) : [];

  const select = (option: EgyptLocationOption) => {
    if (kind === 'governorate') onChange({ governorate: option.en, district: '' });
    else onChange({ governorate, district: option.en });
    setKind(null);
  };

  return (
    <View style={styles.group}>
      <SelectorButton
        label={wt.text('governorate')}
        value={governorateOption?.[language] ?? governorate}
        placeholder={wt.text('selectGovernorate')}
        icon="map"
        onPress={() => open('governorate')}
      />
      <SelectorButton
        label={wt.text('district')}
        value={areaOption?.[language] ?? district}
        placeholder={wt.text('selectArea')}
        icon="location-on"
        disabled={!governorateOption}
        onPress={() => open('area')}
      />

      <Modal visible={kind !== null} animationType="slide" onRequestClose={() => setKind(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={[styles.header, isRTL && styles.reverse]}>
            <AppText accessibilityRole="header" style={styles.title}>
              {kind === 'governorate' ? wt.text('selectGovernorate') : wt.text('selectArea')}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={wt.text('close')} onPress={() => setKind(null)} style={styles.close}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <BrandTextField
            accessibilityLabel={wt.text('searchPlaces')}
            placeholder={wt.text('searchPlaces')}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {options.map(option => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                onPress={() => select(option)}
                style={[styles.option, isRTL && styles.reverse]}>
                <MaterialIcons name={kind === 'governorate' ? 'map' : 'location-on'} size={23} color={colors.textPrimary} />
                <AppText style={styles.optionLabel}>{option[language]}</AppText>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function SelectorButton({
  label,
  value,
  placeholder,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value || placeholder}`}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.selector, isRTL && styles.reverse, disabled && styles.disabled]}>
        <MaterialIcons name={icon} size={22} color={colors.textPrimary} />
        <AppText numberOfLines={1} style={[styles.selectorValue, !value && styles.placeholder]}>{value || placeholder}</AppText>
        <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.textSecondary, fontWeight: typography.semibold },
  selector: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  selectorValue: { flex: 1, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  disabled: { opacity: 0.45 },
  reverse: { flexDirection: 'row-reverse' },
  modalSafe: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: 24, lineHeight: 31, fontWeight: typography.bold, color: colors.textPrimary },
  close: { width: 48, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  option: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  optionLabel: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 23 },
});
