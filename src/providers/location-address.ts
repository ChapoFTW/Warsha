import { resolveEgyptLocation } from '../locations/egypt-location-matching.ts';

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

/**
 * The text in an address search box, and why it is there.
 *
 * `typed` came from a person. `selected` was written by the app after they
 * picked a suggestion. They look identical and must behave differently, which
 * is the whole reason the origin is stored rather than guessed.
 */
export type AddressQuery = { text: string; origin: 'typed' | 'selected' };

/** Nothing shorter is worth a billed request, or a useful answer. */
export const ADDRESS_QUERY_MINIMUM = 3;

/**
 * Whether this query should ask the provider for suggestions.
 *
 * Selecting a suggestion fills the box with the address that was chosen. When
 * searching keyed off the text alone, that fill was indistinguishable from
 * typing: the box re-searched the selected address and offered the same
 * suggestion again, which is the loop customers saw.
 *
 * A debounce cannot fix that -- the request is not early, it is unwanted -- so
 * the origin decides, and the next keystroke sets it back to `typed`.
 */
export function shouldRequestSuggestions(
  query: AddressQuery,
  context: { available: boolean; disabled: boolean },
): boolean {
  if (query.origin === 'selected') return false;
  if (!context.available || context.disabled) return false;
  return query.text.trim().length >= ADDRESS_QUERY_MINIMUM;
}

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

/**
 * The form fields a resolved place fills in.
 *
 * Governorate and area are a controlled taxonomy on every Warsha surface, so
 * what goes into them has to be a value that taxonomy recognises. The provider
 * names the same places differently -- "Alexandria Governorate" where the
 * dataset says "Alexandria", "Dekheila" where it says "Al Dikhila" -- and this
 * used to hand those raw strings straight to the field. Nothing matched, so the
 * selector stayed on "Choose a governorate" and Area stayed disabled, while the
 * street line filled in perfectly. That is what made it look arbitrary.
 *
 * Both entry points -- picking a suggestion and reverse-geocoding the current
 * position -- come through here, so they cannot drift apart.
 *
 * A value that cannot be mapped confidently is OMITTED rather than passed
 * through. An unrecognised string in a controlled field is not a partial
 * success; it is a field that looks answered and is not, on data somebody has
 * no reason to re-check. Leaving it empty asks the question honestly.
 */
export function resolvedAddressFields(place: ResolvedPlace): {
  addressLine?: string;
  governorate?: string;
  district?: string;
} {
  const resolved = resolveEgyptLocation({
    governorate: place.governorate,
    district: place.district,
  });
  return {
    ...(place.formattedAddress ? { addressLine: place.formattedAddress } : {}),
    // The canonical English name, which is what every surface stores.
    ...(resolved.governorate ? { governorate: resolved.governorate.option.en } : {}),
    ...(resolved.area ? { district: resolved.area.option.en } : {}),
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
