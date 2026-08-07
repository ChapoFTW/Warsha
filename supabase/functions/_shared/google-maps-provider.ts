/**
 * WPS-024 — Google Maps Platform as ONE implementation of `MapProvider`.
 *
 * Everything in Warsha that knows Google Maps exists is in this file. Nothing
 * imports it except the composition root in `map-providers.ts`.
 *
 * Two keys with genuinely different natures, and conflating them is the most
 * likely way this integration leaks money or data:
 *
 *   RENDER KEY — read by the native Maps SDK from the app manifest. It must be
 *   in the bundle; there is no server-side way to draw a map on a phone. It is
 *   therefore PUBLISHABLE, restricted at Google by package name and signing
 *   fingerprint, and scoped to map rendering only. It is not handled here —
 *   `renderMap()` only reports that the client will need one.
 *
 *   SERVER KEY — used for Places Autocomplete and Geocoding, which are billed
 *   per request. It is a genuine secret, lives only in Edge Function
 *   environment secrets, and every call that needs it goes through this
 *   module. A copy in the bundle would let anyone spend Warsha's Maps budget.
 *
 * That split is the whole reason the proxy exists. A client calling Places
 * directly would need the billed key on the device.
 */

import { readSecret, redact } from './provider-secrets.ts';
import {
  MAPS_MAX_ATTEMPTS,
  MAPS_TIMEOUT_MS,
  type MapProvider,
  type MapRenderDescriptor,
  type MapsOutcome,
  type PlaceSuggestion,
  type ResolvedPlace,
} from './map-provider.ts';

export const MAPS_PROVIDER_KEY = 'google_maps_platform';
export const MAPS_PROVIDER_VERSION = 'places/v1+geocoding/v1';

/** Egypt. Results are biased here rather than filtered: a bias degrades
 * gracefully near a border, a hard filter returns nothing and looks broken. */
const REGION = 'eg';

/** Cairo. A starting viewport, never a default answer. */
const DEFAULT_VIEWPORT = {
  latitude: 30.0444,
  longitude: 31.2357,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function worthRetrying(status: number | null): boolean {
  if (status === null) return true;
  if (status === 429) return true;
  return status >= 500 && status < 600;
}

async function call<T>(
  url: string,
  mapper: (payload: any) => T | null,
): Promise<MapsOutcome<T>> {
  const key = readSecret('mapsServerKey');
  if (!key) return { kind: 'refused_no_credential' };

  const started = Date.now();
  let attempts = 0;
  let lastReason = 'The location service did not respond.';

  while (attempts < MAPS_MAX_ATTEMPTS) {
    attempts += 1;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MAPS_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${url}&key=${encodeURIComponent(key)}`, { signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        if (attempts < MAPS_MAX_ATTEMPTS) continue;
        return {
          kind: 'timed_out',
          latencyMs: Date.now() - started,
          attempts,
          safeReason: 'The location service took too long.',
        };
      }
      // `redact` strips `?key=…` before anything is returned or logged. Google
      // echoes the request URL in some error bodies, and that is the single most
      // common way a Maps key reaches a log aggregator.
      lastReason = redact(error).slice(0, 200);
      if (attempts < MAPS_MAX_ATTEMPTS) continue;
      return { kind: 'provider_error', latencyMs: Date.now() - started, attempts, safeReason: lastReason };
    }
    clearTimeout(timer);

    if (!response.ok) {
      lastReason = `Provider returned ${response.status}`;
      if (attempts < MAPS_MAX_ATTEMPTS && worthRetrying(response.status)) continue;
      return { kind: 'provider_error', latencyMs: Date.now() - started, attempts, safeReason: lastReason };
    }

    const payload = await response.json();
    const latencyMs = Date.now() - started;

    if (payload.status === 'ZERO_RESULTS') return { kind: 'no_results', latencyMs, attempts };
    if (payload.status && payload.status !== 'OK') {
      return {
        kind: 'provider_error',
        latencyMs,
        attempts,
        safeReason: redact(String(payload.status)).slice(0, 120),
      };
    }

    const value = mapper(payload);
    if (value === null) return { kind: 'no_results', latencyMs, attempts };
    return { kind: 'ok', value, latencyMs, attempts };
  }

  return { kind: 'provider_error', latencyMs: Date.now() - started, attempts, safeReason: lastReason };
}

export const googleMapsProvider: MapProvider = {
  providerKey: MAPS_PROVIDER_KEY,
  providerVersion: MAPS_PROVIDER_VERSION,

  isConfigured(): boolean {
    return readSecret('mapsServerKey') !== null;
  },

  autocomplete(input: string, sessionToken: string): Promise<MapsOutcome<PlaceSuggestion[]>> {
    const url = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
      + `?input=${encodeURIComponent(input)}`
      + `&components=country:${REGION}`
      + `&sessiontoken=${encodeURIComponent(sessionToken)}`
      + '&language=ar';
    return call(url, (payload) => {
      const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
      if (predictions.length === 0) return null;
      return predictions.slice(0, 8).map((p: any): PlaceSuggestion => ({
        placeId: String(p.place_id ?? ''),
        primary: String(p.structured_formatting?.main_text ?? p.description ?? ''),
        secondary: String(p.structured_formatting?.secondary_text ?? ''),
      })).filter((p: PlaceSuggestion) => p.placeId.length > 0);
    });
  },

  placeDetails(placeId: string, sessionToken: string): Promise<MapsOutcome<ResolvedPlace>> {
    // `fields` is not an optimisation. Places bills by field group, and asking
    // for everything would both cost more and pull back reviews, photographs and
    // opening hours that Warsha has no business holding.
    const url = 'https://maps.googleapis.com/maps/api/place/details/json'
      + `?place_id=${encodeURIComponent(placeId)}`
      + `&sessiontoken=${encodeURIComponent(sessionToken)}`
      + '&fields=formatted_address,geometry/location,place_id'
      + '&language=ar';
    return call(url, (payload) => {
      const result = payload.result;
      const location = result?.geometry?.location;
      if (!result || typeof location?.lat !== 'number' || typeof location?.lng !== 'number') {
        return null;
      }
      return {
        placeId: String(result.place_id ?? placeId),
        formattedAddress: String(result.formatted_address ?? ''),
        latitude: location.lat,
        longitude: location.lng,
      };
    });
  },

  reverseGeocode(latitude: number, longitude: number): Promise<MapsOutcome<ResolvedPlace>> {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json'
      + `?latlng=${latitude},${longitude}`
      + `&region=${REGION}`
      + '&language=ar';
    return call(url, (payload) => {
      const result = Array.isArray(payload.results) ? payload.results[0] : null;
      if (!result) return null;
      return {
        placeId: String(result.place_id ?? ''),
        formattedAddress: String(result.formatted_address ?? ''),
        // The coordinates returned are the ones asked about, not the ones the
        // provider snapped to. The pin the person placed is the pin that counts:
        // a worker is going to the building somebody pointed at, not to the
        // centroid of the administrative area it sits in.
        latitude,
        longitude,
      };
    });
  },

  forwardGeocode(address: string): Promise<MapsOutcome<ResolvedPlace>> {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json'
      + `?address=${encodeURIComponent(address)}`
      + `&region=${REGION}`
      + '&language=ar';
    return call(url, (payload) => {
      const result = Array.isArray(payload.results) ? payload.results[0] : null;
      const location = result?.geometry?.location;
      if (!result || typeof location?.lat !== 'number' || typeof location?.lng !== 'number') {
        return null;
      }
      return {
        placeId: String(result.place_id ?? ''),
        formattedAddress: String(result.formatted_address ?? ''),
        latitude: location.lat,
        longitude: location.lng,
      };
    });
  },

  renderMap(): MapRenderDescriptor {
    return {
      providerKey: MAPS_PROVIDER_KEY,
      // Resolved on the device to a registered renderer. The server names the
      // renderer; it does not know what a React component is.
      rendererKey: 'google_native_sdk',
      requiresPublishableRenderKey: true,
      attribution: 'Map data ©2026 Google',
      defaultViewport: DEFAULT_VIEWPORT,
    };
  },
};
