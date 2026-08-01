import type { TextStyle, ViewStyle } from 'react-native';

/** Locked Warsha palette from the approved "The Current" identity system. */
export const colors = {
  background: '#080808',
  surface: '#141414',
  surfaceElevated: '#191919',
  surfaceSoft: '#1D1D1D',
  border: 'rgba(250,250,250,0.14)',
  borderSoft: 'rgba(250,250,250,0.08)',
  borderStrong: 'rgba(250,250,250,0.22)',
  textPrimary: '#FAFAFA',
  textSecondary: '#B8B8B8',
  textMuted: '#6E6E6E',
  white: '#FAFAFA',
  success: '#2FBF71',
  successSoft: 'rgba(47,191,113,0.13)',
  warning: '#E8A13A',
  warningSoft: 'rgba(232,161,58,0.13)',
  error: '#F06455',
  errorSoft: 'rgba(240,100,85,0.13)',
  transparent: 'transparent',
  scrim: 'rgba(8,8,8,0.88)',
} as const;

export type ColorToken = keyof typeof colors;

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

/** Calm state-change motion. Never use bounce, overshoot, or decorative rotation. */
export const motion = {
  quick: 150,
  standard: 220,
  deliberate: 500,
  easing: [0.4, 0, 0.2, 1] as const,
} as const;

const baseShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 10 },
};

export const elevation = {
  resting: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
  } satisfies ViewStyle,
  card: {
    ...baseShadow,
    borderWidth: 1,
    borderColor: colors.border,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 3,
  } satisfies ViewStyle,
  modal: {
    ...baseShadow,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowOpacity: 0.26,
    shadowRadius: 24,
    elevation: 7,
  } satisfies ViewStyle,
} as const;

export const shadows = { card: elevation.card } as const;

// Backwards-compatible exports for Expo starter components that remain in the repository.
export const Colors = {
  light: { text: colors.textPrimary, background: colors.background, tint: colors.white, icon: colors.textSecondary, tabIconDefault: colors.textMuted, tabIconSelected: colors.white },
  dark: { text: colors.textPrimary, background: colors.background, tint: colors.white, icon: colors.textSecondary, tabIconDefault: colors.textMuted, tabIconSelected: colors.white },
};
export const Fonts = { sans: typography.family, serif: 'serif', rounded: typography.family, mono: 'monospace' };
