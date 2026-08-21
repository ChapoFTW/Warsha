export type LocationLanguage = 'en' | 'ar' | 'fr';

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type AddressSearchOutcome =
  | { outcome: 'succeeded'; suggestions: PlaceSuggestion[] }
  | { outcome: 'unavailable' | 'failed'; suggestions: [] };

/**
 * Provider-neutral place data used by every Warsha client.
 *
 * Coordinates remain the positioning authority. The text fields are editable
 * provider suggestions and may be incomplete, especially for buildings that
 * do not have a conventional street address.
 */
export type ResolvedPlace = {
  placeId: string;
  formattedAddress: string;
  governorate: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
};

export type AddressResolutionState = 'resolved' | 'partial' | 'lookup_failed';

export type BrowserLocationFailure =
  | 'permission_denied'
  | 'unavailable'
  | 'timed_out'
  | 'unsupported'
  | 'unknown';

export function parseResolvedPlace(value: unknown): ResolvedPlace | null {
  if (!value || typeof value !== 'object') return null;
  const place = value as Partial<ResolvedPlace>;
  if (typeof place.formattedAddress !== 'string'
      || typeof place.latitude !== 'number'
      || !Number.isFinite(place.latitude)
      || typeof place.longitude !== 'number'
      || !Number.isFinite(place.longitude)) return null;
  return {
    placeId: typeof place.placeId === 'string' ? place.placeId : '',
    formattedAddress: place.formattedAddress.trim(),
    governorate: nonEmptyString(place.governorate),
    district: nonEmptyString(place.district),
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

export function parsePlaceSuggestions(value: unknown): PlaceSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is PlaceSuggestion => {
    if (!entry || typeof entry !== 'object') return false;
    const suggestion = entry as Partial<PlaceSuggestion>;
    return typeof suggestion.placeId === 'string' && suggestion.placeId.length > 0
      && typeof suggestion.primary === 'string'
      && typeof suggestion.secondary === 'string';
  });
}

export function resolvedAddressFields(place: ResolvedPlace): {
  addressLine?: string;
  governorate?: string;
  district?: string;
} {
  return {
    ...(place.formattedAddress ? { addressLine: place.formattedAddress } : {}),
    ...(place.governorate ? { governorate: place.governorate } : {}),
    ...(place.district ? { district: place.district } : {}),
  };
}

export function addressResolutionState(
  place: ResolvedPlace | null,
  requirement: 'formatted' | 'structured' = 'structured',
): AddressResolutionState {
  if (!place || !place.formattedAddress) return 'lookup_failed';
  if (requirement === 'formatted') return 'resolved';
  return place.governorate && place.district ? 'resolved' : 'partial';
}

export function classifyBrowserLocationError(error: unknown): BrowserLocationFailure {
  const code = error && typeof error === 'object' && 'code' in error
    ? Number((error as { code: unknown }).code)
    : null;
  if (code === 1) return 'permission_denied';
  if (code === 2) return 'unavailable';
  if (code === 3) return 'timed_out';
  if (error instanceof Error && [
    'permission_denied', 'unavailable', 'timed_out', 'unsupported', 'unknown',
  ].includes(error.message)) return error.message as BrowserLocationFailure;
  return 'unknown';
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
