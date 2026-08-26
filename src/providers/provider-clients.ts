import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import {
  classifyDeviceLocationError,
  type DeviceFixResult,
} from '@/src/providers/device-location-policy';
import type { MapRenderDescriptor } from '@/src/providers/map-renderer-types';
import {
  parsePlaceSuggestions,
  parseResolvedPlace,
  type AddressSearchOutcome,
  type LocationLanguage,
  type ResolvedPlace,
} from '@/src/providers/location-address';

/**
 * WPS-024 live external-provider clients.
 *
 * Deliberately a NEW module rather than an edit to
 * `src/onboarding/identity-extraction.ts` and `location-provider.ts`. Those two
 * are WPS-023's pure boundary contracts: import-free, network-free, and
 * asserted to stay that way. They describe what extraction and location are
 * ALLOWED to do, and those rules did not change when a provider arrived.
 *
 * What changed is that capability is now a RUNTIME answer from the server
 * rather than a compile-time constant. That is strictly better: a constant in
 * the bundle cannot know whether a credential has been configured, and this
 * can. `locationCapability.deviceLocation === false` remains true and remains
 * meaningful — it says the client ships with no provider hardcoded as a
 * default.
 *
 * Three rules hold across everything here:
 *
 *   1. Mock makes no network call and no external call, ever.
 *   2. Every failure is reported as unavailable with a reason a person can
 *      act on, and never as an error that blocks a flow. Extraction and search
 *      are conveniences; manual entry and manual pin placement are the
 *      guaranteed paths.
 *   3. No credential appears in this file, or anywhere else the bundle can
 *      reach. Every call goes to an Edge Function that holds the secret.
 */

export type ExtractionCapabilityLive = {
  available: boolean;
  manualEntryAlwaysAvailable: true;
  confirmationRequired: true;
};

export type LocationCapabilityLive = {
  mapsAvailable: boolean;
  searchAvailable: boolean;
  manualPinAlwaysAvailable: true;
  pinRequiredBeforeBooking: true;
  /**
   * Which renderer draws the map, named by the server's provider registry.
   *
   * A KEY, never a vendor name a component branches on. Null when no location
   * provider is registered, and `resolveMapRenderer` treats that as "use the
   * only renderer we ship" rather than as a failure.
   */
  mapRendererKey: string | null;
};

export type ExtractionResult =
  | {
      outcome: 'succeeded';
      candidates: {
        fieldKey: string;
        value: string;
        editableValue: string;
        requiresManualEntry: boolean;
      }[];
    }
  // Every outcome `vision-extract` can return, not a subset. The client used to
  // name four of seven and cast the rest, which typechecked while quietly
  // hiding the two states a worker is most likely to meet on a development
  // backend: the provider switched off, and no credential configured.
  | {
      outcome: 'unavailable' | 'no_text_found' | 'unreadable' | 'provider_error'
        | 'timed_out' | 'refused_disabled' | 'refused_no_credential'
        | 'refused_rate_limited';
      reason: string;
    };

export type { PlaceSuggestion, ResolvedPlace } from '@/src/providers/location-address';

/** Capability while offline or in Mock: everything unavailable, nothing blocked. */
const OFFLINE_EXTRACTION: ExtractionCapabilityLive = {
  available: false,
  manualEntryAlwaysAvailable: true,
  confirmationRequired: true,
};

const OFFLINE_LOCATION: LocationCapabilityLive = {
  mapsAvailable: false,
  searchAvailable: false,
  manualPinAlwaysAvailable: true,
  pinRequiredBeforeBooking: true,
  mapRendererKey: null,
};

/**
 * A Places session token.
 *
 * Groups a burst of autocomplete keystrokes with the details call that
 * follows so Google bills the sequence once. Without one, cost scales with
 * how fast somebody types. Generated per search session on the client because
 * that is the only place that knows when a session begins.
 */
export function newSessionToken(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const providerClients = {
  async extractionCapability(): Promise<ExtractionCapabilityLive> {
    if (environment.dataMode === 'mock') return OFFLINE_EXTRACTION;
    try {
      const { data, error } = await getSupabaseClient().rpc('get_extraction_capability');
      if (error || !data) return OFFLINE_EXTRACTION;
      return data as ExtractionCapabilityLive;
    } catch {
      return OFFLINE_EXTRACTION;
    }
  },

  async locationCapability(): Promise<LocationCapabilityLive> {
    if (environment.dataMode === 'mock') return OFFLINE_LOCATION;
    try {
      const { data, error } = await getSupabaseClient().rpc('get_location_capability');
      if (error || !data) return OFFLINE_LOCATION;
      return data as LocationCapabilityLive;
    } catch {
      return OFFLINE_LOCATION;
    }
  },

  /**
   * Ask the server to read a document that is already in private storage.
   *
   * The image is NOT sent from here. It was uploaded to the owner-isolated
   * bucket first, and the server fetches it with the service role. That keeps
   * the document on one path instead of two, and means a failed extraction
   * never leaves a copy of an identity document somewhere a retry would have
   * to clean up.
   */
  async extractIdentityFields(
    storagePath: string,
    documentType: 'national_id_front' | 'national_id_back',
  ): Promise<ExtractionResult> {
    if (environment.dataMode === 'mock') {
      return { outcome: 'unavailable', reason: 'manual_entry' };
    }
    try {
      const { data, error } = await getSupabaseClient().functions.invoke('vision-extract', {
        body: { storagePath, documentType },
      });
      if (error) return { outcome: 'provider_error', reason: 'manual_entry' };
      const payload = data as {
        available?: boolean;
        outcome?: string;
        reason?: string;
        candidates?: ExtractionResult extends { outcome: 'succeeded' }
          ? never
          : { fieldKey: string; value: string; editableValue: string; requiresManualEntry: boolean }[];
      };
      if (payload?.outcome === 'succeeded' && Array.isArray(payload.candidates)) {
        return { outcome: 'succeeded', candidates: payload.candidates };
      }
      return {
        outcome: (payload?.outcome as 'unreadable') ?? 'unavailable',
        reason: payload?.reason ?? 'manual_entry',
      };
    } catch {
      return { outcome: 'provider_error', reason: 'manual_entry' };
    }
  },

  /**
   * How the active provider wants its map drawn.
   *
   * Answered by the proxy from `MapProvider.renderMap()`, so there is one
   * source of truth for the renderer key, the attribution a vendor's terms
   * require, and the viewport a map opens at. Null when the proxy cannot
   * answer, which `AddressMap` treats as "use the renderer we ship" rather
   * than as an outage.
   */
  async mapRenderDescriptor(): Promise<MapRenderDescriptor | null> {
    if (environment.dataMode === 'mock') return null;
    try {
      const { data, error } = await getSupabaseClient().functions.invoke('location-proxy', {
        body: { operation: 'render_descriptor' },
      });
      if (error) return null;
      return ((data as { descriptor?: MapRenderDescriptor })?.descriptor ?? null);
    } catch {
      return null;
    }
  },

  async searchAddresses(
    input: string,
    sessionToken: string,
    language: LocationLanguage,
  ): Promise<AddressSearchOutcome> {
    if (environment.dataMode === 'mock') return { outcome: 'unavailable', suggestions: [] };
    if (input.trim().length < 3) return { outcome: 'succeeded', suggestions: [] };
    try {
      const { data, error } = await getSupabaseClient().functions.invoke('location-proxy', {
        body: { operation: 'autocomplete', input, sessionToken, language },
      });
      if (error) return { outcome: 'failed', suggestions: [] };
      const payload = data as { available?: boolean; suggestions?: unknown } | null;
      if (payload?.available !== true) return { outcome: 'unavailable', suggestions: [] };
      return { outcome: 'succeeded', suggestions: parsePlaceSuggestions(payload.suggestions) };
    } catch {
      // An unavailable search is not an error state. The person places a pin.
      return { outcome: 'failed', suggestions: [] };
    }
  },

  async resolvePlace(
    placeId: string,
    sessionToken: string,
    language: LocationLanguage,
  ): Promise<ResolvedPlace | null> {
    if (environment.dataMode === 'mock') return null;
    try {
      const { data, error } = await getSupabaseClient().functions.invoke('location-proxy', {
        body: { operation: 'place_details', placeId, sessionToken, language },
      });
      if (error) return null;
      return parseResolvedPlace((data as { place?: unknown } | null)?.place);
    } catch {
      return null;
    }
  },

  /**
   * Turn a pin into an address label.
   *
   * A null answer is normal, not a failure: plenty of Egyptian buildings have
   * no geocodable address, and the pin is what a worker navigates to anyway.
   * The caller shows the coordinate and carries on.
   */
  async describePin(
    latitude: number,
    longitude: number,
    language: LocationLanguage,
  ): Promise<ResolvedPlace | null> {
    if (environment.dataMode === 'mock') return null;
    try {
      const { data, error } = await getSupabaseClient().functions.invoke('location-proxy', {
        body: { operation: 'reverse_geocode', latitude, longitude, language },
      });
      if (error) return null;
      return parseResolvedPlace((data as { place?: unknown } | null)?.place);
    } catch {
      return null;
    }
  },
};

/**
 * Request a one-off device fix.
 *
 * `expo-location` is imported lazily so that a build which never asks for a
 * fix never loads it, and so this module stays importable by the regression
 * suite under Node.
 *
 * Foreground only, and low accuracy on purpose: the person is about to adjust
 * the pin by hand anyway, and asking the OS for the best possible fix costs
 * battery and seconds to improve a starting point that is about to be moved.
 * Warsha never requests background location and the config plugin does not
 * declare it, so the OS cannot grant one.
 */
export type { DeviceFixResult } from '@/src/providers/device-location-policy';

const DEVICE_FIX_TIMEOUT_MS = 20_000;

async function currentPositionWithTimeout(
  Location: typeof import('expo-location'),
  accuracy: NonNullable<import('expo-location').LocationOptions['accuracy']>,
  timeoutMs: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy })
      .then(position => ({ kind: 'position' as const, position }))
      .catch(error => ({ kind: 'error' as const, error })),
    new Promise<{ kind: 'timeout' }>(resolve => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return result;
}

export async function requestDeviceFix(): Promise<DeviceFixResult> {
  if (environment.dataMode === 'mock') {
    return { outcome: 'location_error', code: 'mock_mode' };
  }
  try {
    const Location = await import('expo-location');
    const initialProvider = await Location.getProviderStatusAsync();
    if (!initialProvider.locationServicesEnabled) return { outcome: 'services_disabled' };

    const existingPermission = await Location.getForegroundPermissionsAsync().catch(() => null);
    const permission = existingPermission?.granted
      ? existingPermission
      : await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return { outcome: 'permission_denied', canAskAgain: permission.canAskAgain };
    }

    const provider = await Location.getProviderStatusAsync();
    if (!provider.locationServicesEnabled) return { outcome: 'services_disabled' };
    const providerSignals = [provider.gpsAvailable, provider.networkAvailable, provider.passiveAvailable]
      .filter((value): value is boolean => typeof value === 'boolean');
    if (providerSignals.length > 0 && providerSignals.every(value => !value)) {
      return { outcome: 'provider_unavailable' };
    }

    // A recent coarse fix is enough to seed the pin and avoids making an
    // emulator wait for a fresh satellite/network update it may never emit.
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 15 * 60_000,
      requiredAccuracy: 2_000,
    }).catch(() => null);
    if (lastKnown) {
      return {
        outcome: 'succeeded',
        position: { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude },
      };
    }

    let current = await currentPositionWithTimeout(
      Location,
      Location.Accuracy.Balanced,
      DEVICE_FIX_TIMEOUT_MS,
    );

    // Some Android location providers reject a balanced one-shot before a
    // coarse network fix is warm. A single bounded low-accuracy retry is still
    // foreground-only and is adequate for seeding Warsha's private matching
    // coordinate. No provider, reverse geocoder, SMS, or background permission
    // is involved.
    if (current.kind !== 'position') {
      const firstFailure = current.kind === 'timeout'
        ? { outcome: 'timed_out' as const }
        : classifyDeviceLocationError(current.error);
      if (firstFailure.outcome === 'permission_denied' || firstFailure.outcome === 'services_disabled') {
        return firstFailure;
      }
      current = await currentPositionWithTimeout(Location, Location.Accuracy.Low, 10_000);
      if (current.kind === 'timeout') return { outcome: 'timed_out' };
      if (current.kind === 'error') return classifyDeviceLocationError(current.error);
    }
    return {
      outcome: 'succeeded',
      position: {
        latitude: current.position.coords.latitude,
        longitude: current.position.coords.longitude,
      },
    };
  } catch (error) {
    // Preserve the category. The UI still offers the other paths, while Metro
    // can now distinguish permission, provider and native-module failures.
    return classifyDeviceLocationError(error);
  }
}
