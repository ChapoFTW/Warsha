import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandTextField } from '@/components/warsha/BrandUI';
import { AppText } from '@/components/warsha/Typography';
import { WarshaIcon } from '@/components/warsha/WarshaIcon';
import { professionIconName } from '@/src/brand/warsha-icons';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import {
  listProfessions,
  professionLabel,
  type ProfessionKey,
} from '@/src/providers/profession-taxonomy';
import { useWorkerText } from '@/src/worker/worker-copy';

export function ProfessionSelector({
  selected,
  onChange,
}: {
  selected: ProfessionKey[];
  onChange: (selected: ProfessionKey[]) => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const wt = useWorkerText();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<ProfessionKey[]>(selected);

  const open = () => {
    setPending(selected);
    setQuery('');
    setVisible(true);
  };

  const toggle = (key: ProfessionKey) => {
    setPending(current => current.includes(key)
      ? current.filter(item => item !== key)
      : current.length < 10 ? [...current, key] : current);
  };

  return (
    <View style={styles.group}>
      {selected.length ? (
        <View style={[styles.chips, isRTL && styles.reverse]}>
          {selected.map(key => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${wt.text('removeProfession')} ${professionLabel(key, language)}`}
              onPress={() => onChange(selected.filter(item => item !== key))}
              style={[styles.chip, isRTL && styles.reverse]}>
              <WarshaIcon name={professionIconName(key)} size="md" />
              <AppText style={styles.chipLabel}>{professionLabel(key, language)}</AppText>
              <MaterialIcons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <BrandButton
        label={selected.length ? wt.text('changeProfessions') : wt.text('chooseProfessions')}
        icon="handyman"
        variant="secondary"
        onPress={open}
      />

      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={[styles.modalHeader, isRTL && styles.reverse]}>
            <AppText accessibilityRole="header" style={styles.title}>{wt.text('professionPlural')}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={wt.text('close')}
              onPress={() => setVisible(false)}
              style={styles.close}>
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <BrandTextField
            accessibilityLabel={wt.text('searchProfessions')}
            placeholder={wt.text('searchProfessions')}
            value={query}
            onChangeText={setQuery}
          />
          <AppText style={styles.selectedCount}>{pending.length} / 10 {wt.text('selected')}</AppText>
          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {listProfessions(language, query).map(profession => {
              const checked = pending.includes(profession.key);
              return (
                <Pressable
                  key={profession.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => toggle(profession.key)}
                  style={[styles.option, isRTL && styles.reverse, checked && styles.optionSelected]}>
                  <MaterialIcons
                    name={checked ? 'check-box' : 'check-box-outline-blank'}
                    size={26}
                    color={colors.textPrimary}
                  />
                  {/* The trade's own mark where the package draws one, its
                      category's where it deliberately does not. A worker
                      scanning thirty-four trades reads a silhouette faster
                      than a word. */}
                  <WarshaIcon name={professionIconName(profession.key)} size="lg" />
                  <AppText style={styles.optionLabel}>{profession[language]}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
          <BrandButton
            label={wt.text('done')}
            disabled={pending.length === 0}
            onPress={() => {
              onChange(pending);
              setVisible(false);
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated },
  chipLabel: { flexShrink: 1, color: colors.textPrimary },
  reverse: { flexDirection: 'row-reverse' },
  modalSafe: { flex: 1, gap: spacing.md, padding: spacing.lg, backgroundColor: colors.canvas },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, fontSize: 24, lineHeight: 31, fontWeight: typography.bold, color: colors.textPrimary },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  selectedCount: { color: colors.textSecondary },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  option: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  optionSelected: { borderColor: colors.textPrimary, backgroundColor: colors.surfaceElevated },
  optionLabel: { flex: 1, fontSize: 16, lineHeight: 23, color: colors.textPrimary },
});
