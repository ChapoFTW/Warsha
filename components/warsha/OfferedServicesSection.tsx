import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { professionLabel } from '@/src/providers/profession-taxonomy';
import type { ProviderServiceInput } from '@/src/providers/provider-types';
import type { TradeSection } from '@/src/providers/worker-trade-selection';
import {
  catalogueServiceLabel,
  specificServiceLabel,
  type CatalogueServiceRow,
} from '@/src/services/specific-services';
import { useWorkerText } from '@/src/worker/worker-copy';

/**
 * The jobs one trade does, under the name of that trade.
 *
 * Replaces the flat cloud of every service Warsha sells. The relationship the
 * old screen could not express -- these jobs belong to THIS trade, and this
 * trade is why you are being offered them -- is the whole of what this control
 * says: the profession names the section, and only its own work is inside.
 *
 * ## Why an accordion and not a sheet
 *
 * `ProfessionSelector` is a modal because it chooses from thirty-four trades
 * and needs a search field. This is the opposite problem: the worker has
 * already answered, the answer is one to a few trades, and the point of the
 * screen is that they can SEE the relationship. Sections that expand in place
 * keep the profession and its jobs on the same surface; a sheet per profession
 * would hide exactly the thing being communicated behind a second tap.
 *
 * ## Collapsed by default, except when there is only one
 *
 * A worker with one trade should not have to open anything -- the section IS
 * the step. A worker with several gets a legible list of headings, each showing
 * its own count, so several trades stay manageable rather than becoming one
 * scroll again.
 */
export function OfferedServicesSection<T extends CatalogueServiceRow>({
  sections,
  historicalServices = [],
  onToggleService,
  onToggleAll,
  disabled,
}: {
  sections: TradeSection<T>[];
  historicalServices?: ProviderServiceInput[];
  onToggleService: (service: T, offered: boolean) => void;
  onToggleAll: (professionKey: string, offered: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language } = useLocalization();
  const wt = useWorkerText();
  const [opened, setOpened] = useState<string[]>([]);
  const single = sections.length === 1;

  return (
    <View style={styles.group}>
      {historicalServices.length ? (
        <View style={styles.section}>
          <View style={styles.legacyHeader}>
            <AppText style={styles.trade}>{wt.text('historicalServicesTitle')}</AppText>
            <AppText style={styles.summary}>{wt.text('historicalServicesBody')}</AppText>
          </View>
          <View style={styles.body}>
            {historicalServices.map(service => (
              <View key={service.serviceId} style={styles.legacyRow}>
                <MaterialIcons name="history" size={21} color={colors.textMuted} />
                <AppText style={styles.optionLabel}>
                  {(service.translationKey
                    ? specificServiceLabel(service.translationKey, language)
                    : null) ?? service.name}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {sections.map(section => (
        <TradeAccordion
          key={section.professionKey}
          section={section}
          expanded={single || opened.includes(section.professionKey)}
          onExpand={() => setOpened(current => current.includes(section.professionKey)
            ? current.filter(key => key !== section.professionKey)
            : [...current, section.professionKey])}
          collapsible={!single}
          onToggleService={onToggleService}
          onToggleAll={onToggleAll}
          disabled={disabled}
        />
      ))}
    </View>
  );
}

function TradeAccordion<T extends CatalogueServiceRow>({
  section,
  expanded,
  collapsible,
  onExpand,
  onToggleService,
  onToggleAll,
  disabled,
}: {
  section: TradeSection<T>;
  expanded: boolean;
  collapsible: boolean;
  onExpand: () => void;
  onToggleService: (service: T, offered: boolean) => void;
  onToggleAll: (professionKey: string, offered: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(makeStyles);
  const { language, isRTL } = useLocalization();
  const wt = useWorkerText();

  const trade = professionLabel(section.professionKey, language);
  const count = section.selectedServiceIds.length;
  const all = count > 0 && count === section.services.length;
  const summary = count === 0
    ? wt.text('noServicesChosen')
    : wt.servicesSelected(count);

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole={collapsible ? 'button' : 'header'}
        accessibilityLabel={`${trade}. ${summary}`}
        accessibilityState={collapsible ? { expanded, disabled: Boolean(disabled) } : undefined}
        disabled={!collapsible || disabled}
        onPress={onExpand}
        style={[styles.header, isRTL && styles.reverse]}>
        <View style={styles.headerText}>
          <AppText style={styles.trade}>{trade}</AppText>
          <AppText style={[styles.summary, count === 0 && styles.summaryEmpty]}>{summary}</AppText>
        </View>
        {collapsible ? (
          <MaterialIcons
            name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={26}
            color={colors.textMuted}
          />
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {section.services.length === 0 ? (
            <AppText style={styles.summaryEmpty}>{wt.text('noServicesAvailable')}</AppText>
          ) : (
            <>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: all, disabled: Boolean(disabled) }}
                accessibilityLabel={wt.text('selectAllServices')}
                disabled={disabled}
                onPress={() => onToggleAll(section.professionKey, !all)}
                style={[styles.selectAll, isRTL && styles.reverse]}>
                <MaterialIcons
                  name={all ? 'check-box' : 'check-box-outline-blank'}
                  size={24}
                  color={colors.textPrimary}
                />
                <AppText style={styles.selectAllLabel}>{wt.text('selectAllServices')}</AppText>
              </Pressable>
              {section.services.map(service => {
                const checked = section.selectedServiceIds.includes(service.id);
                const label = catalogueServiceLabel(service, language);
                return (
                  <Pressable
                    key={service.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: Boolean(disabled) }}
                    accessibilityLabel={label}
                    disabled={disabled}
                    onPress={() => onToggleService(service, !checked)}
                    style={[styles.option, isRTL && styles.reverse, checked && styles.optionSelected]}>
                    <MaterialIcons
                      name={checked ? 'check-box' : 'check-box-outline-blank'}
                      size={24}
                      color={colors.textPrimary}
                    />
                    <AppText style={styles.optionLabel}>{label}</AppText>
                  </Pressable>
                );
              })}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  section: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  legacyHeader: { gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  legacyRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
  reverse: { flexDirection: 'row-reverse' },
  trade: { fontSize: 17, lineHeight: 23, fontWeight: typography.semibold, color: colors.textPrimary },
  summary: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  summaryEmpty: { color: colors.textMuted },
  body: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  selectAll: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surfaceElevated },
  selectAllLabel: { flex: 1, fontWeight: typography.semibold, color: colors.textPrimary },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.sm },
  optionSelected: { backgroundColor: colors.surfaceElevated },
  optionLabel: { flex: 1, fontSize: 15, lineHeight: 23, color: colors.textPrimary },
});
