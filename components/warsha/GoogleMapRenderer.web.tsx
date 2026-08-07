import { StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { isValidCoordinate } from '@/src/onboarding/onboarding-types';
import type { MapRendererProps } from '@/src/providers/map-renderer-types';

/**
 * WPS-024 — the Google Maps renderer, web.
 *
 * `react-native-maps` has no web implementation. Importing it into a web
 * bundle fails the build, so this file exists and the bundler picks it for
 * web automatically.
 *
 * What it deliberately is NOT: a map. There is no web map here, and rendering
 * a static image with a pin on it would be exactly the surface WPS-024's
 * Location Data Policy forbids — one that "pretends to be live" and that
 * somebody would rely on. It is a coordinate entry field that says what it is.
 *
 * Warsha is a mobile product; the web build exists for review and for the
 * signed-out surfaces. A customer completing address onboarding does it on a
 * phone, where the real map runs.
 */

export function GoogleMapRenderer({ value, onChange, copy }: MapRendererProps) {
  const styles = useThemedStyles(makeStyles);

  const update = (latitude: string, longitude: string) => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!isValidCoordinate(lat, lng)) return;
    onChange({ latitude: lat, longitude: lng });
  };

  return (
    <View style={styles.frame}>
      <AppText style={styles.notice}>{copy.unavailable}</AppText>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          accessibilityLabel="Latitude"
          value={value ? String(value.latitude) : ''}
          onChangeText={(text) => update(text, value ? String(value.longitude) : '0')}
        />
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          accessibilityLabel="Longitude"
          value={value ? String(value.longitude) : ''}
          onChangeText={(text) => update(value ? String(value.latitude) : '0', text)}
        />
      </View>
      <AppText style={styles.hint}>{copy.dragHint}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  frame: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.lg,
  },
  notice: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flexGrow: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: radii.md,
    backgroundColor: colors.inputBackground,
    color: colors.inputText,
    paddingHorizontal: spacing.md,
  },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
});
