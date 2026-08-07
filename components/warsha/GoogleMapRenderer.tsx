import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/src/appearance/appearance-context';
import { isValidCoordinate } from '@/src/onboarding/onboarding-types';
import type { MapRendererProps, PinPosition } from '@/src/providers/map-renderer-types';

/**
 * WPS-024 — the Google Maps renderer. ONE implementation of a map renderer.
 *
 * The only component in the application that imports `react-native-maps`.
 * `AddressMap` resolves a renderer by the key the server's registry names, so
 * a second map provider is a sibling of this file and a registry update — not
 * an edit to anything that draws an address.
 *
 * The rule this component exists to enforce: a customer confirms a PIN, not an
 * address. A written address in Egypt frequently will not find a building, and
 * the difference between a pin and a description is a worker arriving or a
 * worker circling a street for twenty minutes.
 *
 * Consequences that shape the interface:
 *
 *   * the pin is always draggable, and dragging it is the primary interaction
 *     rather than a correction for when search fails;
 *   * device location is a convenience button, never a requirement, and a
 *     detected position is a starting point the person is expected to adjust;
 *   * there is no "use this address" path that skips the pin.
 *
 * There is a `.web.tsx` sibling. `react-native-maps` has no web implementation,
 * and a web bundle that imports it fails to build — so the web build gets a
 * coordinate entry surface that is honest about being one, rather than a map
 * that silently does not work.
 */

/** Cairo. A starting viewport, never a default answer — nothing is confirmed
 * until the person moves the pin or drops one deliberately. */
const FALLBACK_REGION: Region = {
  latitude: 30.0444,
  longitude: 31.2357,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function GoogleMapRenderer({ value, onChange, copy }: MapRendererProps) {
  const styles = useThemedStyles(makeStyles);
  const mapRef = useRef<MapView | null>(null);
  const [region] = useState<Region>(
    value && isValidCoordinate(value.latitude, value.longitude)
      ? { ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }
      : FALLBACK_REGION,
  );

  const place = useCallback(
    (position: PinPosition) => {
      if (!isValidCoordinate(position.latitude, position.longitude)) return;
      onChange(position);
    },
    [onChange],
  );

  return (
    <View style={styles.frame}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        // Tapping the map moves the pin. On a phone this is far more reliable
        // than dragging a small marker with a thumb.
        onPress={(event) => place(event.nativeEvent.coordinate)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {value && isValidCoordinate(value.latitude, value.longitude) ? (
          <Marker
            coordinate={value}
            draggable
            onDragEnd={(event) => place(event.nativeEvent.coordinate)}
          />
        ) : null}
      </MapView>
      <AppText style={styles.hint}>{copy.dragHint}</AppText>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  frame: { gap: spacing.sm },
  map: { width: '100%', height: 260, borderRadius: radii.lg },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
});
