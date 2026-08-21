'use client';

import { supabase } from '@/lib/supabase';
import {
  classifyBrowserLocationError,
  parsePlaceSuggestions,
  parseResolvedPlace,
  type AddressSearchOutcome,
  type LocationLanguage,
  type PlaceSuggestion,
  type ResolvedPlace,
} from '@/src/providers/location-address';

export type LocationCapability = {
  mapsAvailable: boolean;
  searchAvailable: boolean;
  manualPinAlwaysAvailable: boolean;
  pinRequiredBeforeBooking: boolean;
};

export type { PlaceSuggestion, ResolvedPlace } from '@/src/providers/location-address';

const UNAVAILABLE: LocationCapability = {
  mapsAvailable: false,
  searchAvailable: false,
  manualPinAlwaysAvailable: true,
  pinRequiredBeforeBooking: true,
};

export async function getLocationCapability(): Promise<LocationCapability> {
  const client = supabase();
  const [{ data, error }, descriptorResult] = await Promise.all([
    client.rpc('get_location_capability'),
    client.functions.invoke('location-proxy', { body: { operation: 'render_descriptor' } }),
  ]);
  if (error || !data || typeof data !== 'object') return UNAVAILABLE;
  const value = data as Partial<LocationCapability>;
  const descriptor = descriptorResult.data as {
    available?: boolean;
    descriptor?: { serverCredentialAvailable?: boolean };
  } | null;
  const serverCredentialAvailable = !descriptorResult.error
    && descriptor?.available === true
    && descriptor.descriptor?.serverCredentialAvailable === true;
  return {
    mapsAvailable: value.mapsAvailable === true,
    searchAvailable: value.searchAvailable === true && serverCredentialAvailable,
    manualPinAlwaysAvailable: true,
    pinRequiredBeforeBooking: true,
  };
}

export function newPlaceSessionToken(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function searchAddresses(
  input: string,
  sessionToken: string,
  language: LocationLanguage,
): Promise<AddressSearchOutcome> {
  if (input.trim().length < 3) return { outcome: 'succeeded', suggestions: [] };
  const { data, error } = await supabase().functions.invoke('location-proxy', {
    body: { operation: 'autocomplete', input: input.trim(), sessionToken, language },
  });
  if (error) return { outcome: 'failed', suggestions: [] };
  if (data?.available !== true) return { outcome: 'unavailable', suggestions: [] };
  return { outcome: 'succeeded', suggestions: parsePlaceSuggestions(data.suggestions) };
}

export async function resolvePlace(
  placeId: string,
  sessionToken: string,
  language: LocationLanguage,
): Promise<ResolvedPlace | null> {
  const { data, error } = await supabase().functions.invoke('location-proxy', {
    body: { operation: 'place_details', placeId, sessionToken, language },
  });
  return error ? null : parseResolvedPlace(data?.place);
}

export async function describeCoordinates(
  latitude: number,
  longitude: number,
  language: LocationLanguage,
): Promise<ResolvedPlace | null> {
  const { data, error } = await supabase().functions.invoke('location-proxy', {
    body: { operation: 'reverse_geocode', latitude, longitude, language },
  });
  return error ? null : parseResolvedPlace(data?.place);
}

export function currentBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    globalThis.navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(new Error(classifyBrowserLocationError(error))),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}
