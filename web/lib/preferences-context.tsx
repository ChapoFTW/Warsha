'use client';

import { GlobalErrorReporting } from '@/components/global-error-reporting';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  appearanceExplicitKey,
  appearanceStorageKey,
  directionOf,
  isAppearancePreference,
  isLocale,
  languageExplicitKey,
  languageStorageKey,
  localeCookieValue,
  type AppearancePreference,
  type Locale,
} from './preferences';

/**
 * Warsha's global preferences, on the web, in one place.
 *
 * ## What this replaces
 *
 * `useAppLocale` used to be a hook with `useState<Locale>('en')` and an effect
 * that read `localStorage` after mount. Every component that needed the
 * language called it and therefore had *its own copy* of the answer. There was
 * no shared value to be wrong about, which sounds harmless and is not:
 *
 * - Server rendering and the first client render were **always English**,
 *   whatever the visitor had chosen, because a hook cannot read `localStorage`
 *   during render. Every page therefore painted English and corrected itself a
 *   frame later. On a fast machine that is a flicker; on a slow connection, on
 *   a large page, or behind a hard navigation it is a page that *is* English
 *   until it suddenly is not. That is precisely what QA saw and reported as
 *   "that other page can still appear English".
 * - The shell and the page each corrected themselves independently, so during
 *   that window they could legitimately disagree with each other.
 *
 * The fix is not a faster read. It is to decide the language **before
 * rendering**, on the server, from something the server can actually see - the
 * `warsha-locale` cookie - and to hold the answer in one context instead of
 * forty copies. `useAppLocale()` keeps its name and its signature, so every
 * existing call site is unchanged, but it is now a context read: one value,
 * one update, every consumer re-renders together.
 *
 * ## The cookie means "a person chose this"
 *
 * `warsha-locale` is written only by the language control. Nothing else sets
 * it, so its presence is exactly the "explicit preference" input of
 * `resolveEffectiveLocale`, and the middleware, the server render and the
 * client all read the same fact from the same place. It is scoped to
 * `.usewarsha.com` so the marketing site, the application and the console
 * genuinely share one preference - `localStorage` cannot, because they are
 * three origins by design.
 */

type PreferencesValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  appearance: AppearancePreference;
  setAppearance: (next: AppearancePreference) => void;
  /** True once the browser's own stored values have been reconciled. */
  hydrated: boolean;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Fired when a preference changes in this tab, where no storage event fires. */
export const preferenceChangeEvent = 'warsha:preference-change';

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('lang', locale);
  // Direction is never set independently of language anywhere in Warsha.
  root.setAttribute('dir', directionOf(locale));
}

function applyDocumentAppearance(preference: AppearancePreference) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  root.style.colorScheme = preference === 'system' ? 'light dark' : preference;
}

function readStoredLocale(): Locale | null {
  try {
    const stored = window.localStorage.getItem(languageStorageKey);
    const explicit = window.localStorage.getItem(languageExplicitKey) === 'true';
    return explicit && isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function readStoredAppearance(): AppearancePreference | null {
  try {
    const stored = window.localStorage.getItem(appearanceStorageKey);
    const explicit = window.localStorage.getItem(appearanceExplicitKey) === 'true';
    return explicit && isAppearancePreference(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * `initialLocale` is computed on the server and must be used verbatim for the
 * first client render, or React will report a hydration mismatch and the very
 * flicker this removes would come back wearing a warning.
 */
export function WarshaPreferencesProvider({
  children,
  initialLocale,
  /**
   * The public site is locale-addressed, so its route is the authority for
   * what this document *is*. The middleware has already redirected anybody
   * with an explicit preference to their own language, so by the time a page
   * renders, route and preference agree - and the switch there navigates
   * rather than re-rendering in place.
   */
  localeIsRouted = false,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  localeIsRouted?: boolean;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [appearance, setAppearanceState] = useState<AppearancePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  // A routed surface follows its own URL. Without this, navigating between two
  // locale-prefixed pages inside one client-side router would keep the first
  // page's language.
  useEffect(() => {
    if (!localeIsRouted) return;
    setLocaleState(initialLocale);
    applyDocumentLocale(initialLocale);
  }, [initialLocale, localeIsRouted]);

  const reconcile = useCallback(() => {
    const storedAppearance = readStoredAppearance();
    setAppearanceState(storedAppearance ?? 'system');
    if (!localeIsRouted) {
      const stored = readStoredLocale();
      if (stored) {
        setLocaleState(stored);
        applyDocumentLocale(stored);
        // The server decided from the cookie. If the device store disagrees,
        // the device store is the more recently expressed choice on *this*
        // machine, so the cookie is brought back into line rather than left to
        // contradict it on the next request.
        document.cookie = localeCookieValue(stored, window.location.hostname);
      }
    }
  }, [localeIsRouted]);

  useEffect(() => {
    reconcile();
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== languageStorageKey
        && event.key !== languageExplicitKey
        && event.key !== appearanceStorageKey
        && event.key !== appearanceExplicitKey) return;
      reconcile();
    };
    const onLocal = () => reconcile();
    window.addEventListener('storage', onStorage);
    window.addEventListener(preferenceChangeEvent, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(preferenceChangeEvent, onLocal);
    };
  }, [reconcile]);

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(languageStorageKey, next);
      window.localStorage.setItem(languageExplicitKey, 'true');
    } catch {
      // Choosing a language must work when storage is refused; it simply will
      // not be remembered for the next visit.
    }
    // The cookie is what the server, the middleware and the two sibling
    // origins read. It is written before any navigation the switch performs,
    // so the destination is already rendered in the chosen language.
    document.cookie = localeCookieValue(next, window.location.hostname);
    setLocaleState(next);
    applyDocumentLocale(next);
    // Other tabs get a `storage` event; this tab gets this.
    window.dispatchEvent(new Event(preferenceChangeEvent));
  }, []);

  const setAppearance = useCallback((next: AppearancePreference) => {
    try {
      window.localStorage.setItem(appearanceStorageKey, next);
      window.localStorage.setItem(appearanceExplicitKey, String(next !== 'system'));
    } catch {
      // Applying the choice matters more than remembering it.
    }
    setAppearanceState(next);
    applyDocumentAppearance(next);
    window.dispatchEvent(new Event(preferenceChangeEvent));
  }, []);

  const value = useMemo<PreferencesValue>(
    () => ({ locale, setLocale, appearance, setAppearance, hydrated }),
    [appearance, hydrated, locale, setAppearance, setLocale],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {/* The one client boundary all three web trees share, which makes it the
          one place global error reporting can be installed exactly once. */}
      <GlobalErrorReporting />
      {children}
    </PreferencesContext.Provider>
  );
}

export function useWarshaPreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('useWarshaPreferences requires WarshaPreferencesProvider');
  return value;
}

/**
 * The application's language.
 *
 * Same name and same signature as the hook it replaces, so the surfaces that
 * read it did not have to change. What changed is that there is now exactly
 * one answer rather than one per component.
 */
export function useAppLocale(): Locale {
  return useWarshaPreferences().locale;
}
