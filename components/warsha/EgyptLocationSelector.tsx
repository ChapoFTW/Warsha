import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTextField, StateBadge } from '@/components/warsha/BrandUI';
import { OptionRow } from '@/components/warsha/OptionRow';
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

export type EgyptLocationSelectorCopy = {
  governorate: string;
  district: string;
  selectGovernorate: string;
  selectDistrict: string;
  search: string;
  close: string;
  governorateHelper?: string;
  districtHelper?: string;
};

export function EgyptLocationSelector({
  governorate,
  district,
  onChange,
  copy,
  required = false,
  governoratePurpose,
  districtPurpose,
}: {
  governorate: string;
  district: string;
  onChange: (next: { governorate: string; district: string }) => void;
  copy?: EgyptLocationSelectorCopy;
  /**
   * Marks both fields required, on the fields themselves.
   *
   * Worker onboarding used to state this in a block above the control, which
   * repeated both field names and pushed the first dropdown to the bottom edge
   * of a 320dp screen. A badge belongs beside the thing it qualifies.
   */
  required?: boolean;
  /**
   * Why Warsha asks.
   *
   * Rendered ABOVE the control, which is a different thing from a helper and
   * was briefly conflated with one. A purpose informs the choice, so it has to
   * be read before the control is touched; a helper describes the input format
   * ("Example: 5") and belongs under it. Putting the purpose underneath left
   * this card explaining two of its three fields after the fact and the third
   * beforehand -- the same screen disagreeing with itself.
   */
  governoratePurpose?: string;
  districtPurpose?: string;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const wt = useWorkerText();
  const text: EgyptLocationSelectorCopy = copy ?? {
    governorate: wt.text('governorate'),
    district: wt.text('district'),
    selectGovernorate: wt.text('selectGovernorate'),
    selectDistrict: wt.text('selectArea'),
    search: wt.text('searchPlaces'),
    close: wt.text('close'),
  };
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
        label={text.governorate}
        value={governorateOption?.[language] ?? governorate}
        placeholder={text.selectGovernorate}
        purpose={governoratePurpose ?? text.governorateHelper}
        required={required}
        icon="map"
        onPress={() => open('governorate')}
      />
      <SelectorButton
        label={text.district}
        value={areaOption?.[language] ?? district}
        placeholder={text.selectDistrict}
        purpose={districtPurpose ?? text.districtHelper}
        required={required}
        icon="location-on"
        disabled={!governorateOption}
        onPress={() => open('area')}
      />

      <Modal visible={kind !== null} animationType="slide" onRequestClose={() => setKind(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={[styles.header, isRTL && styles.reverse]}>
            <AppText accessibilityRole="header" style={styles.title}>
              {kind === 'governorate' ? text.selectGovernorate : text.selectDistrict}
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel={text.close} onPress={() => setKind(null)} style={styles.close}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <BrandTextField
            accessibilityLabel={text.search}
            placeholder={text.search}
            value={query}
            onChangeText={setQuery}
          />
          <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {/* `OptionRow` in `button` mode: choosing a governorate closes the
                sheet rather than toggling anything, so it shows a chevron and
                no state mark. It also names itself from the option, which is
                what this list was missing — with no explicit label Android
                composed one from the children, the icon contributed an empty
                segment, and every place announced as ", Cairo". Exactly the
                defect that was fixed once in the trade list and left here,
                because the fix lived in a screen instead of in a control. */}
            {options.map(option => (
              <OptionRow
                key={option.id}
                mode="button"
                label={option[language]}
                onPress={() => select(option)}
                leading={(
                  <MaterialIcons
                    name={kind === 'governorate' ? 'map' : 'location-on'}
                    size={22}
                    color={colors.textSecondary}
                  />
                )}
              />
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
  purpose,
  icon,
  disabled,
  required,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  purpose?: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  disabled?: boolean;
  required?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  const wt = useWorkerText();
  return (
    <View style={styles.field}>
      <View style={[styles.labelRow, isRTL && styles.reverse]}>
        <AppText style={styles.fieldLabel}>{label}</AppText>
        {required ? <StateBadge label={wt.text('required')} compact /> : null}
      </View>
      {purpose ? <AppText style={styles.purpose}>{purpose}</AppText> : null}
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
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  fieldLabel: { ...typography.body, color: colors.textPrimary, fontWeight: typography.semibold },
  selector: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  selectorValue: { flex: 1, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  disabled: { opacity: 0.45 },
  purpose: { ...typography.bodySmall, color: colors.textMuted },
  reverse: { flexDirection: 'row-reverse' },
  modalSafe: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { ...typography.h2, flex: 1, fontWeight: typography.bold, color: colors.textPrimary },
  close: { width: 48, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },

  optionLabel: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 23 },
});
