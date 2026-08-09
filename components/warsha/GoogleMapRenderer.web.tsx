import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
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
 * signed-out surfaces. Raw coordinates are deliberately not exposed as a
 * substitute map: normal users choose a place, use device location, or place
 * the native map pin on Android/iOS.
 */

export function GoogleMapRenderer({ copy }: MapRendererProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.frame}>
      <AppText style={styles.notice}>{copy.unavailable}</AppText>
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
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
});
