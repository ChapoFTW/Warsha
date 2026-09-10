import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandButton, BrandTextField, EmptyState } from '@/components/warsha/BrandUI';
import { OptionRow } from '@/components/warsha/OptionRow';
import { PressableSurface } from '@/components/warsha/PressableSurface';
import { AppText } from '@/components/warsha/Typography';
import { WarshaIcon } from '@/components/warsha/WarshaIcon';
import { professionIconName } from '@/src/brand/warsha-icons';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { isolateLtr } from '@/src/i18n/direction';
import { useLocalization } from '@/src/i18n/localization';
import {
  listProfessions,
  professionLabel,
  type ProfessionKey,
} from '@/src/providers/profession-taxonomy';
import { useWorkerText } from '@/src/worker/worker-copy';

const LIMIT = 10;

/**
 * Which trades a professional works in.
 *
 * This screen was the clearest example of Warsha reading as a prototype, and
 * the reasons were structural rather than cosmetic.
 *
 * **Thirty-four rows, flat.** The taxonomy has always been ordered by category
 * — plumbing trades together, electrical together — and the list threw that
 * ordering away visually, presenting one undifferentiated wall. A plumber
 * looking for their trade had to read down thirty-four labels. Drawing the
 * seams turns the same list into a handful of short sections, so the one that
 * matters is reached without reading everything above it. That is the single
 * biggest thing here for someone who does not read fluently, and it needed no
 * new copy.
 *
 * The seams were briefly labelled with the category names Warsha already
 * translates. They are not any more, and the reason is in the taxonomy beside
 * the labels: once each row became the plain work noun, the category name was
 * one of its own rows. What finds the section now is that row — "Plumbing",
 * full width, with an icon — which is a louder landmark than a grey caption
 * above it ever was.
 *
 * **Rows drawn by hand.** Each was a stock `check-box-outline-blank` on a
 * hairline rectangle, with "selected" expressed as a one-pixel border changing
 * colour — nearly invisible on a phone, which is a poor answer to the only
 * question the control exists to answer. `OptionRow` owns that now, and owns it
 * for the location and service pickers too, which had each grown their own
 * slightly different version of the same row.
 *
 * **No feedback at the limit.** Ten is the cap. Past it, taps did nothing at
 * all: `toggle` silently declined and the screen said nothing. The counter now
 * states the limit before it is reached and explains itself once it is.
 */
export function ProfessionSelector({
  selected,
  onChange,
}: {
  selected: ProfessionKey[];
  onChange: (selected: ProfessionKey[]) => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL, t } = useLocalization();
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
      : current.length < LIMIT ? [...current, key] : current);
  };

  /*
   * Grouped in the taxonomy's own order, which is already category-by-category.
   * Nothing is re-sorted here: the ranking decides who is found first and is not
   * this component's to rearrange. All this does is draw the seams that were
   * always there.
   */
  const groups = useMemo(() => {
    const ordered: { categoryId: string; professions: ReturnType<typeof listProfessions> }[] = [];
    for (const profession of listProfessions(language, query)) {
      const last = ordered[ordered.length - 1];
      if (last?.categoryId === profession.categoryId) last.professions.push(profession);
      else ordered.push({ categoryId: profession.categoryId, professions: [profession] });
    }
    return ordered;
  }, [language, query]);

  const atLimit = pending.length >= LIMIT;

  return (
    <View style={styles.group}>
      {selected.length ? (
        <View style={[styles.chips, isRTL && styles.reverse]}>
          {selected.map(key => (
            <PressableSurface
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${wt.text('removeProfession')} ${professionLabel(key, language, 'professional')}`}
              onPress={() => onChange(selected.filter(item => item !== key))}
              style={[styles.chip, isRTL && styles.reverse]}>
              <WarshaIcon name={professionIconName(key)} size="md" />
              <AppText style={styles.chipLabel}>{professionLabel(key, language, 'professional')}</AppText>
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </PressableSurface>
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
          <View style={styles.header}>
            <View style={[styles.headerRow, isRTL && styles.reverse]}>
              {/* The question, not a field name. "Your work" reads as a
                  taxonomy slot; "What do you do?" is what a person is actually
                  being asked, and it is the same question the step card asks. */}
              <AppText accessibilityRole="header" style={styles.title}>
                {wt.text('tradeTitle')}
              </AppText>
              <PressableSurface
                accessibilityRole="button"
                accessibilityLabel={wt.text('close')}
                onPress={() => setVisible(false)}
                style={styles.close}>
                <MaterialIcons name="close" size={22} color={colors.textPrimary} />
              </PressableSurface>
            </View>
            <AppText style={styles.subtitle}>{wt.text('tradeBody')}</AppText>
            <BrandTextField
              accessibilityLabel={wt.text('searchProfessions')}
              placeholder={wt.text('searchProfessions')}
              value={query}
              onChangeText={setQuery}
            />
            {/* The count carried the ten-trade limit and read as a footnote.
                It is the one thing on this screen that changes as you work, so
                it is now legible at a glance and says what happens at the cap
                rather than letting taps quietly stop working. */}
            <View style={[styles.counterRow, isRTL && styles.reverse]}>
              {/* Isolated. "3 / 10" is a number, a neutral slash and a number:
                  in an Arabic paragraph the bidi algorithm is entitled to
                  resolve that run right-to-left and show "10 / 3", which is a
                  different and wrong statement about how many you may pick. */}
              <AppText style={[styles.counter, atLimit && styles.counterFull]}>
                {isolateLtr(`${pending.length} / ${LIMIT}`)}
              </AppText>
              <AppText style={styles.counterLabel}>
                {atLimit ? wt.text('professionLimitReached') : wt.text('selected')}
              </AppText>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {groups.length === 0 ? (
              <EmptyState
                icon="search-off"
                title={t('noMatches')}
                body={wt.text('professionNoMatches')}
                action={t('clearSearch')}
                onAction={() => setQuery('')}
              />
            ) : groups.map(group => (
              <View key={group.categoryId} style={styles.section}>
                <View style={styles.sectionRows}>
                  {group.professions.map(profession => {
                    const checked = pending.includes(profession.key);
                    return (
                      <OptionRow
                        key={profession.key}
                        label={profession.work[language]}
                        selected={checked}
                        // At the cap, the trades you did NOT pick stop being
                        // offered rather than silently refusing a tap.
                        disabled={atLimit && !checked}
                        onPress={() => toggle(profession.key)}
                        leading={<WarshaIcon name={professionIconName(profession.key)} size="lg" />}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Separated from the list, so the primary action reads as a footer
              rather than as the last item you scrolled past. */}
          <View style={styles.footer}>
            <BrandButton
              label={wt.text('done')}
              disabled={pending.length === 0}
              onPress={() => {
                onChange(pending);
                setVisible(false);
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceElevated,
  },
  chipLabel: { ...typography.body, flexShrink: 1, color: colors.textPrimary },
  reverse: { flexDirection: 'row-reverse' },

  modalSafe: { flex: 1, backgroundColor: colors.canvas },
  header: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.canvasElevated,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typography.h2, flex: 1, fontWeight: typography.bold, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  counterRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  counter: { ...typography.body, fontWeight: typography.bold, color: colors.textPrimary },
  counterFull: { color: colors.warningText },
  counterLabel: { ...typography.bodySmall, flex: 1, color: colors.textSecondary },

  list: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxl },
  /* `list` puts spacing.xl between sections and `sectionRows` spacing.sm
     between rows inside one. That difference is the whole grouping now, so it
     has to stay large enough to read as a seam rather than as a wide gap. */
  section: { gap: spacing.sm },
  sectionRows: { gap: spacing.sm },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.canvasElevated,
  },
});
