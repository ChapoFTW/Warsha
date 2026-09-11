import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { AppText } from '@/components/warsha/Typography';
import { radii, spacing, typography, type ThemeColors } from '@/constants/theme';
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

export function GoogleMapRenderer({ value, onChange, copy, onUnavailable }: MapRendererProps) {
  const styles = useThemedStyles(makeStyles);
  const mapRef = useRef<MapView | null>(null);

  /*
   * Whether the map ever came up, and what to show while it has not.
   *
   * `MapView` renders its own empty frame from the moment it mounts, so a map
   * that never loads is a grey rectangle with a Google watermark and no
   * explanation — which is what an emulator without a usable Maps key shows,
   * and what a customer on a bad connection sees too. Nothing said it was
   * loading and nothing said it had failed.
   *
   * `onMapLoaded`, NOT `onMapReady`, and the difference is the whole point.
   *
   * `onMapReady` fires when the SDK has initialised. `onMapLoaded` fires when
   * the map has finished RENDERING. They are usually a moment apart and
   * occasionally forever apart, and the second case is the one that matters:
   * with a Maps key the build is not authorised for, or tiles that never
   * arrive, the SDK comes up perfectly and paints nothing.
   *
   * This was written against `onMapReady` and photographed on 2026-09-11 doing
   * exactly the thing it exists to prevent. The professional's address step
   * showed a blank grey rectangle with a Google watermark, no "Loading the
   * map.", and no "The map is unavailable right now." — because `ready` had
   * gone true the instant the SDK initialised, which cancels the timeout that
   * would have said so. The one state the component could not report was the
   * one it was built for.
   *
   * So readiness now means rendered. The timeout answers the rest: after it,
   * the space says the map is unavailable, which is true, and points at the
   * other two ways of setting a location sitting right above it.
   *
   * `onMapLoaded` is supported on Android and on iOS under Google Maps, and
   * this renderer passes `PROVIDER_GOOGLE` on both. If it ever did not fire on
   * a working map the result is a visible, honest fallback rather than a silent
   * blank — which is the right way round for the two failures to be.
   */
  const [ready, setReady] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (ready) return undefined;
    const timer = setTimeout(() => setGaveUp(true), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  /*
   * Say so upward, once.
   *
   * The surface around this one offers the map as one of three ways to set a
   * location. If the map cannot be drawn it needs to stop offering it and show
   * what it already has instead — otherwise two of the three routes work, the
   * third leads to a rectangle that says it is unavailable, and the person is
   * left to work out which.
   */
  const announced = useRef(false);
  useEffect(() => {
    if (!gaveUp || ready || announced.current) return;
    announced.current = true;
    onUnavailable?.();
  }, [gaveUp, ready, onUnavailable]);
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

  if (gaveUp && !ready) {
    return (
      <View style={styles.frame}>
        <View style={styles.unavailable}>
          <AppText style={styles.unavailableText}>{copy.unavailable}</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      {ready ? null : (
        <View style={styles.loading} pointerEvents="none">
          <AppText style={styles.loadingText}>{copy.loading}</AppText>
        </View>
      )}
      <MapView
        onMapLoaded={() => setReady(true)}
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

/* Long enough that a slow connection is not called a failure, short enough
   that nobody watches an empty rectangle wondering. */
const MAP_READY_TIMEOUT_MS = 12_000;

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  frame: { gap: spacing.sm },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { ...typography.bodySmall, color: colors.textSecondary },
  unavailable: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  unavailableText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  map: { width: '100%', height: 260, borderRadius: radii.lg },
  hint: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
});
