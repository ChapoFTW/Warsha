'use client';

import { supabase } from '@/lib/supabase';

export type LocationCapability = {
  mapsAvailable: boolean;
  searchAvailable: boolean;
  manualPinAlwaysAvailable: boolean;
  pinRequiredBeforeBooking: boolean;
};

export type PlaceSuggestion = { placeId: string; primary: string; secondary: string };
export type ResolvedPlace = {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

const UNAVAILABLE: LocationCapability = {
  mapsAvailable: false,
  searchAvailable: false,
  manualPinAlwaysAvailable: true,
  pinRequiredBeforeBooking: true,
};

export async function getLocationCapability(): Promise<LocationCapability> {
  const { data, error } = await supabase().rpc('get_location_capability');
  if (error || !data || typeof data !== 'object') return UNAVAILABLE;
  const value = data as Partial<LocationCapability>;
  return {
    mapsAvailable: value.mapsAvailable === true,
    searchAvailable: value.searchAvailable === true,
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
): Promise<PlaceSuggestion[]> {
  if (input.trim().length < 3) return [];
  const { data, error } = await supabase().functions.invoke('location-proxy', {
    body: { operation: 'autocomplete', input: input.trim(), sessionToken },
  });
  if (error || data?.available !== true || !Array.isArray(data.suggestions)) return [];
  return data.suggestions.filter((entry: unknown): entry is PlaceSuggestion => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Partial<PlaceSuggestion>;
    return typeof value.placeId === 'string'
      && typeof value.primary === 'string'
      && typeof value.secondary === 'string';
  });
}

export async function resolvePlace(
  placeId: string,
  sessionToken: string,
): Promise<ResolvedPlace | null> {
  const { data, error } = await supabase().functions.invoke('location-proxy', {
    body: { operation: 'place_details', placeId, sessionToken },
  });
  return error ? null : parsePlace(data?.place);
}

export async function describeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ResolvedPlace | null> {
  const { data, error } = await supabase().functions.invoke('location-proxy', {
    body: { operation: 'reverse_geocode', latitude, longitude },
  });
  return error ? null : parsePlace(data?.place);
}

export function currentBrowserLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.geolocation) {
      reject(new Error('geolocation_unavailable'));
      return;
    }
    globalThis.navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

function parsePlace(value: unknown): ResolvedPlace | null {
  if (!value || typeof value !== 'object') return null;
  const place = value as Partial<ResolvedPlace>;
  if (typeof place.formattedAddress !== 'string'
      || typeof place.latitude !== 'number'
      || typeof place.longitude !== 'number') return null;
  return {
    placeId: typeof place.placeId === 'string' ? place.placeId : '',
    formattedAddress: place.formattedAddress,
    latitude: place.latitude,
    longitude: place.longitude,
  };
}
