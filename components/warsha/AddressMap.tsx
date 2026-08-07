import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import type { MapRendererCopy, PinPosition } from '@/src/providers/map-renderer-types';
import { resolveMapRenderer } from '@/src/providers/map-renderers';

/**
 * WPS-024 address pin — provider-agnostic.
 *
 * This component knows that an address is confirmed by a PIN. It does not know
 * which vendor draws the map, and it imports no mapping library: the server's
 * provider registry names a renderer, `resolveMapRenderer` turns that name into
 * a component, and this renders it.
 *
 * The consequence worth stating: switching map vendor touches a registry row, a
 * new renderer file and a line in `map-renderers.ts`. It does not touch this
 * file, or any screen that collects an address.
 *
 * `mapsAvailable` false and "no renderer for that key" land in the same place —
 * a plain explanation. Neither is an error state, because a customer who cannot
 * see a map has not done anything wrong and must still be able to continue.
 */

export type { PinPosition };

type Props = {
  value: PinPosition | null;
  onChange: (position: PinPosition) => void;
  /** False when no provider is configured; the caller shows manual entry. */
  mapsAvailable: boolean;
  /** Named by the server's render descriptor. Null falls back to the sole renderer. */
  rendererKey?: string | null;
  copy: MapRendererCopy;
};

export function AddressMap({ value, onChange, mapsAvailable, rendererKey, copy }: Props) {
  const styles = useThemedStyles(makeStyles);
  const Renderer = resolveMapRenderer(rendererKey);

  if (!mapsAvailable || !Renderer) {
    return (
      <View style={styles.unavailable}>
        <AppText style={styles.unavailableText}>{copy.unavailable}</AppText>
      </View>
    );
  }

  return <Renderer value={value} onChange={onChange} copy={copy} />;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  unavailable: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.lg,
  },
  unavailableText: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
});

export const addressMapStyles = { typography };
