import { appearanceExplicitKey, appearanceStorageKey, isAppearancePreference, type AppearancePreference } from './appearance-types';

/**
 * Web local appearance store.
 *
 * `localStorage` rather than `expo-sqlite/kv-store`: the web build of
 * expo-sqlite is WASM-backed and has no synchronous read, and a synchronous
 * read is the whole point (see `appearance-storage.ts`).
 *
 * Static rendering runs this module in Node during export, where `window` does
 * not exist. That path reports "no stored preference", which is correct — the
 * server cannot know the visitor's choice, and the inline script in
 * `app/+html.tsx` paints the right background before hydration regardless.
 */
export function readLocalAppearance(): { preference: AppearancePreference | null; explicit: boolean } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { preference: null, explicit: false };
    const stored = window.localStorage.getItem(appearanceStorageKey);
    const explicit = window.localStorage.getItem(appearanceExplicitKey) === 'true';
    return { preference: isAppearancePreference(stored) ? stored : null, explicit };
  } catch {
    return { preference: null, explicit: false };
  }
}

export function writeLocalAppearance(preference: AppearancePreference, explicit: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(appearanceStorageKey, preference);
    window.localStorage.setItem(appearanceExplicitKey, explicit ? 'true' : 'false');
    // Keep the document in step so the browser paints native form controls,
    // scrollbars, and the address bar to match.
    document.documentElement.style.colorScheme = preference === 'system' ? 'light dark' : preference;
  } catch {
    // Private-mode browsers throw on write. The choice still applies for this
    // session; it simply will not survive a reload.
  }
}
