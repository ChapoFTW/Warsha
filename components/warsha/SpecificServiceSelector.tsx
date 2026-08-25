import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import type { Service } from '@/src/data/marketplace-types';
import { useLocalization } from '@/src/i18n/localization';
import {
  catalogueServiceLabel,
  orderedCatalogueServices,
  specificServicePickerCopy,
} from '@/src/services/specific-services';

/**
 * Choosing which kind of work this is, on a phone.
 *
 * Web has offered this since the catalogue expansion; the native request form
 * never had it, because its service list came from `provider.services` and a
 * customer asking for quotes has not chosen a provider. So the control existed
 * on one surface and not the other, for a product rule that is the same on
 * both.
 *
 * Deliberately not a search field. The largest category has fifteen services
 * and the smallest six -- a list that short is faster to read than to type
 * into, and a keyboard over a modal costs safe-area and dismissal behaviour for
 * nothing. `ProfessionSelector` and `EgyptLocationSelector` do search, because
 * they choose from hundreds.
 *
 * The picker is optional by construction: "any service" is the first row, it is
 * selected until the customer says otherwise, and choosing it is a real answer
 * rather than a way to undo a mistake.
 */
export function SpecificServiceSelector({
  services,
  categoryId,
  selectedServiceId,
  onChange,
  closeLabel,
  disabled,
}: {
  /** The whole catalogue. Filtering to the category happens here, once. */
  services: readonly Service[];
  categoryId: string;
  /** The stored UUID, or '' for "any service in this category". */
  selectedServiceId: string;
  onChange: (serviceId: string) => void;
  /** Localized word for the dismiss control, from the caller's own copy. */
  closeLabel: string;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const [visible, setVisible] = useState(false);
  const copy = specificServicePickerCopy[language];

  const options = orderedCatalogueServices(
    services.filter((service): service is Service & { categoryId: string } =>
      typeof service.categoryId === 'string'),
    categoryId,
  );
  const selected = options.find((service) => service.id === selectedServiceId);
  // The label is resolved here on every render rather than stored alongside the
  // id, so switching language relabels the same UUID instead of needing a
  // refetch -- and so no display string can ever become the identity.
  const value = selected ? catalogueServiceLabel(selected, language) : copy.anyService;

  // Nothing to choose between: a category with no catalogue rows would open an
  // empty sheet, which is worse than not offering the control at all.
  const unavailable = Boolean(disabled) || !categoryId || options.length === 0;

  const select = (serviceId: string) => {
    onChange(serviceId);
    setVisible(false);
  };

  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{copy.label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.label + '. ' + value}
        accessibilityState={{ disabled: unavailable, expanded: visible }}
        disabled={unavailable}
        onPress={() => setVisible(true)}
        style={[styles.selector, isRTL && styles.reverse, unavailable && styles.disabled]}>
        <MaterialIcons name="build" size={22} color={colors.textPrimary} />
        <AppText numberOfLines={2} style={[styles.selectorValue, !selected && styles.placeholder]}>
          {value}
        </AppText>
        <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.textMuted} />
      </Pressable>

      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={[styles.header, isRTL && styles.reverse]}>
            <AppText accessibilityRole="header" style={styles.title}>{copy.label}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={() => setVisible(false)}
              style={styles.close}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {/* Leaving it open is a first-class answer, so it reads as the
                first option rather than as an escape from the list. */}
            <Option
              label={copy.anyService}
              icon="apps"
              checked={!selected}
              onPress={() => select('')}
            />
            {options.map((service) => (
              <Option
                key={service.id}
                label={catalogueServiceLabel(service, language)}
                icon="build"
                checked={service.id === selectedServiceId}
                onPress={() => select(service.id)}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Option({
  label,
  icon,
  checked,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  checked: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useLocalization();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.option, isRTL && styles.reverse, checked && styles.optionSelected]}>
      <MaterialIcons name={icon} size={23} color={colors.textPrimary} />
      <AppText style={styles.optionLabel}>{label}</AppText>
      {checked ? <MaterialIcons name="check" size={22} color={colors.textPrimary} /> : null}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  field: { gap: spacing.sm },
  fieldLabel: { color: colors.textSecondary, fontWeight: typography.semibold },
  selector: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
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
  optionSelected: { borderColor: colors.textPrimary, backgroundColor: colors.surfaceElevated },
  optionLabel: { flex: 1, color: colors.textPrimary, fontSize: 16, lineHeight: 23 },
});
