/**
 * WPS-024 map and place provider contract.
 *
 * Warsha's location logic depends on THIS FILE and never on Google. The five
 * operations WPS-024 names, and why each is on the interface rather than folded
 * into a neighbour:
 *
 *   autocomplete()     — a partial string to a list of candidate places.
 *   placeDetails()     — a chosen candidate to a coordinate. Separate from
 *                        autocomplete because vendors bill the pair as one
 *                        session and the session token has to span both.
 *   forwardGeocode()   — a written address to a coordinate.
 *   reverseGeocode()   — a coordinate to a written address.
 *   renderMap()        — how the CLIENT should draw a map for this provider.
 *
 * renderMap() is the odd one and deserves its reasoning stated
 * ------------------------------------------------------------
 * A map is drawn on a phone by a native SDK; no server can draw one. So this
 * method does not return an image — it returns the DESCRIPTOR the client needs
 * in order to pick a renderer: which renderer, whether a publishable render key
 * is required, and what attribution the vendor's terms demand.
 *
 * That keeps the choice of map vendor in one place. The server knows which
 * provider is active because the registry says so; the client asks and obeys.
 * Without this, swapping to MapLibre would mean editing a component, and the
 * component would go on importing `react-native-maps` for a provider no longer
 * in use.
 *
 * The failure contract, which every implementation inherits
 * --------------------------------------------------------
 * There is no outcome that means "stop". Location search is a convenience;
 * placing a pin by hand is the guaranteed path and is always on screen. A
 * vendor outage must degrade the search box, never block onboarding.
 */

export type PlaceSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type ResolvedPlace = {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

export type MapsOutcome<T> =
  | { kind: 'ok'; value: T; latencyMs: number; attempts: number }
  | { kind: 'no_results'; latencyMs: number; attempts: number }
  | { kind: 'provider_error'; latencyMs: number; attempts: number; safeReason: string }
  | { kind: 'timed_out'; latencyMs: number; attempts: number; safeReason: string }
  | { kind: 'refused_no_credential' };

/**
 * What the client needs in order to draw a map for this provider.
 *
 * `rendererKey` names a renderer registered on the device side. It is a string
 * rather than a component because this crosses a network boundary, and because
 * the server has no business holding a React component.
 */
export type MapRenderDescriptor = {
  providerKey: string;
  rendererKey: string;
  /**
   * True when the native SDK reads a publishable key from the app manifest.
   *
   * Publishable is not a euphemism: such a key MUST be in the bundle because
   * there is no server-side way to draw a map on a phone. It is restricted by
   * package name and signing fingerprint and scoped to rendering only. The
   * billed search key is a different key and never leaves the backend.
   */
  requiresPublishableRenderKey: boolean;
  /** Vendor terms usually require visible credit. Passed through, not invented. */
  attribution: string;
  /** Where the map opens before anybody has chosen anything. */
  defaultViewport: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
};

export interface MapProvider {
  readonly providerKey: string;
  readonly providerVersion: string;
  isConfigured(): boolean;
  autocomplete(input: string, sessionToken: string): Promise<MapsOutcome<PlaceSuggestion[]>>;
  placeDetails(placeId: string, sessionToken: string): Promise<MapsOutcome<ResolvedPlace>>;
  forwardGeocode(address: string): Promise<MapsOutcome<ResolvedPlace>>;
  reverseGeocode(latitude: number, longitude: number): Promise<MapsOutcome<ResolvedPlace>>;
  renderMap(): MapRenderDescriptor;
}

/**
 * Location calls are short and interactive.
 *
 * Eight seconds, against twenty for OCR, because somebody is typing into a
 * search box and a suggestion that arrives after they have finished typing is
 * worse than no suggestion — it changes what is under their thumb.
 */
export const MAPS_TIMEOUT_MS = 8_000;
export const MAPS_MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers = new Map<string, MapProvider>();

/** Keyed by `private.external_providers.provider_key`. */
export function registerMapProvider(provider: MapProvider): void {
  providers.set(provider.providerKey, provider);
}

export function resolveMapProvider(providerKey: string | null | undefined): MapProvider | null {
  if (!providerKey) return null;
  return providers.get(providerKey) ?? null;
}

export function registeredMapProviderKeys(): string[] {
  return [...providers.keys()].sort();
}
