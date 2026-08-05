import Storage from 'expo-sqlite/kv-store';

import { appearanceExplicitKey, appearanceStorageKey, isAppearancePreference, type AppearancePreference } from './appearance-types';

/**
 * Native local appearance store.
 *
 * The read is **synchronous** on purpose. An asynchronous read means the first
 * frame is painted before the answer arrives, which is precisely the flash
 * WPS-020 forbids. `expo-sqlite/kv-store` backs the same database the rest of
 * the app already uses, so this introduces no new storage system.
 *
 * The web implementation lives in `appearance-storage.web.ts`. That is the only
 * platform split WPS-020 keeps, and it exists for a concrete reason: the web
 * build of expo-sqlite is WASM-backed and has no synchronous read at all.
 */
export function readLocalAppearance(): { preference: AppearancePreference | null; explicit: boolean } {
  try {
    const stored = Storage.getItemSync(appearanceStorageKey);
    const explicit = Storage.getItemSync(appearanceExplicitKey) === 'true';
    return { preference: isAppearancePreference(stored) ? stored : null, explicit };
  } catch {
    // A storage failure must never prevent the app from rendering. Falling back
    // to "no stored preference" resolves to the device scheme, which is the
    // documented default.
    return { preference: null, explicit: false };
  }
}

export function writeLocalAppearance(preference: AppearancePreference, explicit: boolean): void {
  try {
    Storage.setItemSync(appearanceStorageKey, preference);
    Storage.setItemSync(appearanceExplicitKey, explicit ? 'true' : 'false');
  } catch {
    // Losing the persisted choice degrades to "resets on next launch"; it must
    // never surface as an error to someone who just tapped a theme.
  }
}
