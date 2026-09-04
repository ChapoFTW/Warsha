import type { TextStyle, ViewStyle } from 'react-native';

import { darkColors, elevationFor, lightColors, type ThemeColors } from './appearance';

/**
 * The Warsha palette, resolved for the dark appearance.
 *
 * WPS-020 made colour a runtime decision. This export is the **static** dark
 * palette and remains correct for module-scope constants that can never
 * re-render — the navigation fallback theme and the native window colour.
 *
 * Product components must not import it. They call `useThemeColors()` or wrap
 * their stylesheet in `useThemedStyles()`, both from
 * `@/src/appearance/appearance-context`, so the value follows the active
 * appearance. `scripts/audit-appearance.mjs` enforces that boundary.
 */
export const colors: ThemeColors = darkColors;

export type ColorToken = keyof ThemeColors;
export type { ThemeColors };
export { darkColors, lightColors, elevationFor };

/** 4px base spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Approved radii: 6, 10, 16, 22, and full-round. */
export const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 22,
  full: 999,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;

export const fontFamilies = {
  latin: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  arabic: {
    regular: 'Cairo_400Regular',
    medium: 'Cairo_500Medium',
    semibold: 'Cairo_600SemiBold',
    bold: 'Cairo_700Bold',
  },
} as const;

export type BrandFontWeight = keyof typeof fontFamilies.latin;

export function brandFontFamily(isRTL: boolean, weight: BrandFontWeight = 'regular') {
  return (isRTL ? fontFamilies.arabic : fontFamilies.latin)[weight];
}

export const typography = {
  family: fontFamilies.latin.regular,
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8 } satisfies TextStyle,
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.45 } satisfies TextStyle,
  h2: { fontSize: 22, lineHeight: 28, letterSpacing: -0.2 } satisfies TextStyle,
  h3: { fontSize: 17, lineHeight: 23 } satisfies TextStyle,
  body: { fontSize: 15, lineHeight: 24 } satisfies TextStyle,
  bodySmall: { fontSize: 13, lineHeight: 20 } satisfies TextStyle,
  caption: { fontSize: 11, lineHeight: 16, letterSpacing: 0.8 } satisfies TextStyle,
} as const;

/**
 * The Warsha motion authority.
 *
 * One table, six ideas, and no component is allowed a seventh. Motion here is
 * a response to the person using the product, never decoration: nothing loops,
 * nothing overshoots, nothing rotates for effect, and nothing delays an action
 * the user has already asked for.
 *
 * `quick`/`standard`/`deliberate` are the original three and keep their names
 * and their values, because they are already spelled into components and into
 * `scripts/*.test.mts`. The additions name the two states the product was
 * silently missing — the instant a finger lands, and the state a reduced-motion
 * reader is entitled to — plus the emphasised step between an interaction and
 * a brand moment.
 *
 * The web restates these in `web/app/globals.css`; `test:web-brand` asserts the
 * two tables agree, exactly as it already does for colour.
 */
export const motion = {
  /** Reduced motion, and any change that must not be watched. */
  instant: 0,
  /** Press-down. The fastest thing in the product: it must feel like contact. */
  press: 110,
  /** A hover, a focus ring, a tonal change. */
  quick: 150,
  /** The default for an interaction: a lift, a menu, a state swap. */
  standard: 220,
  /** A transition that deserves to be noticed — a panel, a section entering. */
  emphasised: 320,
  /** Brand-scale. Reserved for the mark; never for a button. */
  deliberate: 500,
  easing: [0.4, 0, 0.2, 1] as const,
} as const;

/**
 * How a pressable answers a finger.
 *
 * Scale, not bounce. 0.98 is deliberately almost imperceptible as a number and
 * completely legible as a feeling; anything below about 0.96 reads as a toy.
 * The tonal dip carries most of the work — scale alone is invisible on a small
 * control, opacity alone is invisible on a large one, so every Warsha pressable
 * gets both and neither is loud.
 */
export const pressFeedback = {
  /** A whole card or tile: large surface, so it may travel slightly more. */
  surfaceScale: 0.978,
  /** A button or a chip: small surface, so it barely moves. */
  controlScale: 0.986,
  /** Applied on top of whatever the resting opacity already is. */
  opacity: 0.82,
} as const;

/** Dark-resolved elevation. Themed screens use `useThemedElevation()` instead. */
export const elevation: Record<'resting' | 'card' | 'modal', ViewStyle> = elevationFor(darkColors, 'dark');

export const shadows = { card: elevation.card } as const;

/**
 * Expo starter compatibility. Before WPS-020 both entries held the same dark
 * values, so anything trusting `Colors.light` silently rendered dark. They are
 * now genuinely different.
 */
export const Colors = {
  light: { text: lightColors.textPrimary, background: lightColors.canvas, tint: lightColors.actionPrimaryBackground, icon: lightColors.textSecondary, tabIconDefault: lightColors.navigationInactive, tabIconSelected: lightColors.navigationActive },
  dark: { text: darkColors.textPrimary, background: darkColors.canvas, tint: darkColors.actionPrimaryBackground, icon: darkColors.textSecondary, tabIconDefault: darkColors.navigationInactive, tabIconSelected: darkColors.navigationActive },
};
export const Fonts = { sans: typography.family, serif: 'serif', rounded: typography.family, mono: 'monospace' };
