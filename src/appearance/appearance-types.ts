/**
 * WPS-020 appearance contracts.
 *
 * Deliberately import-free so the resolution rules can be executed directly by
 * a Node regression suite without a bundler, a React renderer, or a device.
 */

/** What the user chose. Persisted verbatim — `system` is stored as `system`. */
export const appearancePreferences = ['system', 'light', 'dark'] as const;
export type AppearancePreference = (typeof appearancePreferences)[number];

/** What the interface actually paints. `system` never reaches this type. */
export const resolvedAppearances = ['light', 'dark'] as const;
export type ResolvedAppearance = (typeof resolvedAppearances)[number];

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && (appearancePreferences as readonly string[]).includes(value);
}

/**
 * The single resolution rule, used by the provider, by Mock, and by the tests.
 *
 * A device scheme of `null` means the platform did not tell us. Warsha's
 * established appearance is dark, so an unknown device resolves to dark rather
 * than flipping an existing user to light because an API returned nothing.
 */
export function resolveAppearance(
  preference: AppearancePreference,
  deviceScheme: ResolvedAppearance | null | undefined,
): ResolvedAppearance {
  if (preference === 'light' || preference === 'dark') return preference;
  return deviceScheme === 'light' ? 'light' : 'dark';
}

/**
 * Deterministic precedence, applied once per account transition.
 *
 * 1. An explicit local choice made on this device wins. It is what the person
 *    most recently told this device to do, and it is already on screen.
 * 2. Otherwise the account's stored preference, once the session has hydrated.
 * 3. Otherwise `system`.
 *
 * `localIsExplicit` is false when the local value is only a default, so a fresh
 * install adopts the account preference instead of overwriting it with `system`.
 */
export function precedence(input: {
  localPreference: AppearancePreference | null;
  localIsExplicit: boolean;
  serverPreference: AppearancePreference | null;
}): { preference: AppearancePreference; pushToServer: boolean } {
  if (input.localIsExplicit && input.localPreference) {
    return { preference: input.localPreference, pushToServer: input.serverPreference !== input.localPreference };
  }
  if (input.serverPreference) return { preference: input.serverPreference, pushToServer: false };
  if (input.localPreference) return { preference: input.localPreference, pushToServer: true };
  return { preference: 'system', pushToServer: false };
}

/** Local key. Device-level, not account-scoped: it must be readable before auth. */
export const appearanceStorageKey = 'warsha:appearance:v1';
/** Records whether the local value was chosen by a person or defaulted. */
export const appearanceExplicitKey = 'warsha:appearance-explicit:v1';

/** Status-bar content colour for a resolved appearance. */
export function statusBarStyle(scheme: ResolvedAppearance): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}
