import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Appearance, StyleSheet, type ViewStyle } from 'react-native';

import { elevationFor, themeColors, type ThemeColors } from '@/constants/appearance';
import { useAuth } from '@/src/auth/auth-context';

import { appearanceRepository } from './appearance-repository';
import { readLocalAppearance, writeLocalAppearance } from './appearance-storage';
import {
  precedence,
  resolveAppearance,
  type AppearancePreference,
  type ResolvedAppearance,
} from './appearance-types';

type AppearanceValue = {
  /** What the person chose. `system` stays `system`, never the resolved value. */
  preference: AppearancePreference;
  /** What is actually painted right now. */
  scheme: ResolvedAppearance;
  /** The device or browser setting, or null if the platform did not say. */
  deviceScheme: ResolvedAppearance | null;
  colors: ThemeColors;
  elevation: Record<'resting' | 'card' | 'modal', ViewStyle>;
  setPreference: (next: AppearancePreference) => void;
  /** Called by `AppearanceAccountSync`; not part of the public surface. */
  attachAccount: (mode: 'mock' | 'supabase', accountKey: string | null) => void;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

function currentDeviceScheme(): ResolvedAppearance | null {
  const scheme = Appearance.getColorScheme();
  return scheme === 'light' || scheme === 'dark' ? scheme : null;
}

/**
 * WPS-020 appearance provider.
 *
 * It sits **above** authentication on purpose: the theme must be correct on the
 * first frame, which is long before there is a session — and the configuration
 * error screen, which renders when Supabase is unconfigured, is outside
 * `AuthProvider` entirely and still has to be readable. The account link is
 * therefore pushed up from `AppearanceAccountSync`, which does live inside
 * `AuthProvider`, rather than pulled down through a hook this provider cannot
 * legally call from where it stands.
 */
export function AppearanceProvider({ children }: PropsWithChildren) {
  /**
   * Read synchronously in the state initializer, so the very first render
   * already has the right answer. Nothing is painted before this runs, which is
   * what makes the startup flash structurally impossible rather than merely
   * unlikely.
   */
  const [{ preference, explicit }, setLocal] = useState(() => {
    const stored = readLocalAppearance();
    return { preference: stored.preference ?? ('system' as AppearancePreference), explicit: stored.explicit };
  });
  const [deviceScheme, setDeviceScheme] = useState<ResolvedAppearance | null>(currentDeviceScheme);
  const [account, setAccount] = useState<{ mode: 'mock' | 'supabase'; key: string | null }>({ mode: 'mock', key: null });

  const explicitRef = useRef(explicit);
  explicitRef.current = explicit;
  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;
  const accountRef = useRef(account);
  accountRef.current = account;

  // Live device changes. Required for `system` to mean anything: flipping the
  // OS switch must reach Warsha without a relaunch.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setDeviceScheme(colorScheme === 'light' || colorScheme === 'dark' ? colorScheme : null);
    });
    return () => subscription.remove();
  }, []);

  const attachAccount = useCallback((mode: 'mock' | 'supabase', key: string | null) => {
    setAccount(current => (current.mode === mode && current.key === key ? current : { mode, key }));
  }, []);

  // Account transition: apply the documented precedence exactly once per account.
  useEffect(() => {
    if (!account.key || account.mode === 'mock') return;
    const target = account.key;
    let active = true;
    void appearanceRepository.get().then((serverPreference) => {
      if (!active || accountRef.current.key !== target) return;
      const outcome = precedence({
        localPreference: preferenceRef.current,
        localIsExplicit: explicitRef.current,
        serverPreference,
      });
      if (outcome.preference !== preferenceRef.current) {
        setLocal({ preference: outcome.preference, explicit: true });
        writeLocalAppearance(outcome.preference, true);
      }
      if (outcome.pushToServer) void appearanceRepository.set(outcome.preference);
    });
    return () => { active = false; };
  }, [account.key, account.mode]);

  const setPreference = useCallback((next: AppearancePreference) => {
    // Local first and synchronously: the interface changes on the same frame as
    // the tap, and a slow or failing server never delays or undoes it.
    setLocal({ preference: next, explicit: true });
    writeLocalAppearance(next, true);
    if (accountRef.current.key && accountRef.current.mode !== 'mock') void appearanceRepository.set(next);
  }, []);

  const scheme = resolveAppearance(preference, deviceScheme);

  const value = useMemo<AppearanceValue>(() => ({
    preference,
    scheme,
    deviceScheme,
    colors: themeColors[scheme],
    elevation: elevationFor(themeColors[scheme], scheme),
    setPreference,
    attachAccount,
  }), [attachAccount, deviceScheme, preference, scheme, setPreference]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/**
 * Renders nothing. Its only job is to tell the appearance provider which
 * account is signed in, from a position inside `AuthProvider` where that is
 * knowable.
 */
export function AppearanceAccountSync() {
  const { mode, user } = useAuth();
  const { attachAccount } = useAppearance();
  const accountKey = mode === 'mock' ? 'mock-user' : user?.id ?? null;
  useEffect(() => { attachAccount(mode, accountKey); }, [accountKey, attachAccount, mode]);
  return null;
}

export function useAppearance(): AppearanceValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside AppearanceProvider');
  return context;
}

/** The active palette. Use this for inline colour props. */
export function useThemeColors(): ThemeColors {
  return useAppearance().colors;
}

export function useThemedElevation(): Record<'resting' | 'card' | 'modal', ViewStyle> {
  return useAppearance().elevation;
}

type StyleFactory<T> = (colors: ThemeColors) => T;

/**
 * Build a stylesheet from the active palette.
 *
 * The factory is called once per appearance change rather than once per render,
 * and no component is remounted — navigation state, scroll position, form
 * contents, and in-flight work all survive a theme switch, because only style
 * objects are rebuilt.
 */
export function useThemedStyles<T>(factory: StyleFactory<T>): T {
  const colors = useThemeColors();
  return useMemo(() => factory(colors), [colors, factory]);
}

/** Convenience for `StyleSheet.create` factories, which is nearly all of them. */
export function themedStyleSheet<T extends StyleSheet.NamedStyles<T>>(factory: (colors: ThemeColors) => T) {
  return (colors: ThemeColors) => StyleSheet.create(factory(colors));
}
