/**
 * WPS-023 provider-neutral location boundary.
 *
 * No map or geocoding provider has been selected for Warsha, and none is
 * configured here. That is stated rather than hidden: this module reports its
 * own capabilities honestly so the address screen can say "searching for an
 * address is not available yet" instead of showing a search box that silently
 * does nothing.
 *
 * `expo-location` is deliberately NOT a dependency. Adding it would put a
 * permission prompt in front of people for a capability the product cannot yet
 * use, and it could not be accepted without a physical device.
 *
 * What this means in practice, and what the copy tells the user:
 *
 *   * "Use my current location" is UNAVAILABLE. It is shown as unavailable,
 *     not hidden, so nobody hunts for a feature that is not there.
 *   * "Search for an address" is UNAVAILABLE for the same reason.
 *   * Placing a pin manually WORKS, and is the supported path.
 *
 * The locked rule from the specification survives this intact: GPS permission
 * is optional, a confirmed pin is mandatory, and manual placement is always
 * available. Today manual placement is the only path, which satisfies the rule
 * rather than bending it.
 */

export type LocationCapability = {
  /** Whether a device fix can be requested at all. */
  deviceLocation: boolean;
  /** Whether a text address can be resolved to coordinates. */
  addressSearch: boolean;
  /** Whether an interactive map can be rendered. */
  interactiveMap: boolean;
  /** Always true. Manual entry is the guaranteed path, never a fallback. */
  manualPin: true;
  providerKey: string | null;
};

/**
 * Fail closed. A missing provider is reported as missing; it never degrades
 * into a silent stub that returns a plausible-looking coordinate, because a
 * plausible-looking wrong coordinate sends a worker to the wrong building.
 */
export const locationCapability: LocationCapability = {
  deviceLocation: false,
  addressSearch: false,
  interactiveMap: false,
  manualPin: true,
  providerKey: null,
};

export type ResolvedPin = {
  latitude: number;
  longitude: number;
  source: 'device_location' | 'address_search' | 'manual_pin';
};

export class LocationProviderUnavailable extends Error {
  readonly capability: keyof LocationCapability;

  constructor(capability: keyof LocationCapability) {
    super(`No configured location provider supports ${capability}`);
    this.name = 'LocationProviderUnavailable';
    this.capability = capability;
  }
}

export async function requestDeviceLocation(): Promise<ResolvedPin> {
  throw new LocationProviderUnavailable('deviceLocation');
}

export async function searchAddress(_query: string): Promise<ResolvedPin[]> {
  throw new LocationProviderUnavailable('addressSearch');
}

/**
 * The one path that works. Validation lives in `onboarding-types`, and the
 * server validates the same bounds again — a coordinate the client accepted is
 * still a coordinate the server checks.
 */
export function manualPin(latitude: number, longitude: number): ResolvedPin {
  return { latitude, longitude, source: 'manual_pin' };
}

/**
 * Governorates offered for manual entry. A fixed list, not a lookup: it exists
 * so somebody can pick "Cairo" without a geocoder, and it carries no
 * coordinates, because a governorate centroid presented as a service address
 * is exactly the kind of plausible wrong answer this module refuses to give.
 */
export const governorates = [
  'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Sharqia', 'Dakahlia', 'Beheira',
  'Gharbia', 'Menoufia', 'Kafr El Sheikh', 'Damietta', 'Port Said', 'Ismailia',
  'Suez', 'North Sinai', 'South Sinai', 'Beni Suef', 'Faiyum', 'Minya', 'Asyut',
  'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea', 'New Valley', 'Matrouh',
] as const;
