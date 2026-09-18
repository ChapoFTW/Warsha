import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandButton } from '@/components/warsha/BrandUI';
import { EgyptLocationSelector } from '@/components/warsha/EgyptLocationSelector';
import { PressableSurface } from '@/components/warsha/PressableSurface';
import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemeColors, useThemedStyles } from '@/src/appearance/appearance-context';
import { useLocalization } from '@/src/i18n/localization';
import { egyptPlaceNames } from '@/src/locations/egypt-locations';
import { MARKETPLACE_MANAGED_RADIUS_KM, type ProviderAreaInput } from '@/src/providers/provider-types';
import { useWorkerText } from '@/src/worker/worker-copy';

/**
 * The districts a Professional covers.
 *
 * The owner's decision, 2026-09-17: a Professional may cover more than one, and
 * the areas are what decides which requests reach them. The work location is a
 * separate, single thing — one anchor, which ranks them and bounds urgent
 * travel — and is not repeated per district.
 *
 * `save_provider_foundation` has always accepted a list and refused a repeated
 * governorate-and-district pair; the editors sent `areas[0]` and dropped the
 * rest, so a Professional who works across three districts could declare one.
 * Adding the same pair twice is prevented here rather than sent and refused.
 *
 * An added area is removed the way a chosen trade is: the whole chip is the
 * control, so it keeps the 48dp target rather than a small cross inside it.
 */
export function ServiceAreaEditor({
  areas,
  onChange,
  required = false,
}: {
  areas: ProviderAreaInput[];
  onChange: (next: ProviderAreaInput[]) => void;
  required?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const colors = useThemeColors();
  const { isRTL, language } = useLocalization();
  const wt = useWorkerText();
  const [pending, setPending] = useState<{ governorate: string; district: string }>({ governorate: '', district: '' });

  const same = (a: { governorate: string; district: string }, b: { governorate: string; district: string }) =>
    a.governorate.trim().toLowerCase() === b.governorate.trim().toLowerCase()
    && (a.district ?? '').trim().toLowerCase() === (b.district ?? '').trim().toLowerCase();
  const duplicate = areas.some(area => same(area, pending));
  const complete = pending.governorate.trim().length > 0 && pending.district.trim().length > 0;

  const add = () => {
    if (!complete || duplicate) return;
    onChange([...areas, { ...pending, radiusKm: MARKETPLACE_MANAGED_RADIUS_KM }]);
    setPending({ governorate: '', district: '' });
  };

  return (
    <View style={styles.group}>
      {areas.length > 0 ? (
        <View style={[styles.list, isRTL && styles.rowReverse]}>
          {areas.map(area => {
            const place = egyptPlaceNames(area.governorate, area.district, language);
            return (
              <PressableSurface
                key={`${area.governorate}/${area.district}`}
                accessibilityRole="button"
                accessibilityLabel={`${wt.text('areaRemove')} ${place.governorate} ${place.district}`}
                onPress={() => onChange(areas.filter(item => !same(item, area)))}
                style={[styles.chip, isRTL && styles.rowReverse]}>
                <AppText style={styles.chipText}>{`${place.governorate} · ${place.district}`}</AppText>
                <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              </PressableSurface>
            );
          })}
        </View>
      ) : (
        <AppText style={styles.note}>{wt.text('areaNone')}</AppText>
      )}

      <AppText style={styles.label}>{areas.length > 0 ? wt.text('areaAddAnother') : wt.text('areaAddFirst')}</AppText>
      <EgyptLocationSelector
        required={required && areas.length === 0}
        governoratePurpose={wt.text('governoratePurpose')}
        districtPurpose={wt.text('districtPurpose')}
        governorate={pending.governorate}
        district={pending.district}
        onChange={setPending}
      />
      {duplicate ? (
        <AppText accessibilityLiveRegion="polite" style={styles.note}>{wt.text('areaAlreadyAdded')}</AppText>
      ) : null}
      <BrandButton
        label={wt.text('areaAdd')}
        icon="add"
        variant="secondary"
        disabled={!complete || duplicate}
        onPress={add}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  group: { gap: spacing.md },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowReverse: { flexDirection: 'row-reverse' },
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
  chipText: { ...typography.body, flexShrink: 1, color: colors.textPrimary },
  label: { ...typography.body, fontWeight: typography.semibold, color: colors.textPrimary },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
