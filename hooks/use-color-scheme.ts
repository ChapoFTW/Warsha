import { useAppearance } from '@/src/appearance/appearance-context';

import type { ResolvedAppearance } from '@/src/appearance/appearance-types';

/**
 * The appearance Warsha is actually painting.
 *
 * Before WPS-020 this re-exported React Native's `useColorScheme`, which
 * answers a different question: it reports the *device* setting. Someone who
 * chose Light on a dark phone would have had this hook say "dark" while the app
 * was light — a hidden dark-mode assumption of exactly the kind WPS-020 exists
 * to remove. The `.web` variant additionally returned `'light'` until
 * hydration, so the two platforms did not even agree with each other.
 *
 * It now reads the resolved appearance from the provider that decides it, which
 * already accounts for the stored preference, the account preference, and live
 * device changes while `system` is selected. There is no platform split any
 * more, because there is nothing platform-specific left to decide.
 *
 * The return type narrows from `'light' | 'dark' | null` to `'light' | 'dark'`:
 * the app always knows what it is painting, even when the device does not say.
 *
 * If the device setting itself is genuinely the question — it is not, anywhere
 * in Warsha today — `useAppearance().deviceScheme` still reports it.
 */
export function useColorScheme(): ResolvedAppearance {
  return useAppearance().scheme;
}
